import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createNodeSqliteDatabase } from "@/data/adapters/nodeSqlite";
import { runMigrations } from "@/data/migrations";
import { createRepositories } from "@/data/repositories";

const files: string[] = [];
function tempDbPath(): string {
  const p = join(tmpdir(), `questforge-ws-${randomUUID()}.sqlite`);
  files.push(p);
  return p;
}

afterEach(() => {
  for (const f of files.splice(0)) {
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(f + suffix)) rmSync(f + suffix, { force: true });
    }
  }
});

async function freshRepos() {
  const db = createNodeSqliteDatabase(tempDbPath());
  await runMigrations(db);
  return { db, repos: createRepositories(db) };
}

describe("work sessions & timer persistence", () => {
  it("records sessions and sums focused time by range", async () => {
    const { db, repos } = await freshRepos();
    const now = new Date();
    const iso = now.toISOString();
    const earlier = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    await repos.workSessions.createSession({
      taskId: null,
      projectId: null,
      mode: "STOPWATCH",
      startedAt: earlier,
      endedAt: iso,
      durationSeconds: 1500,
      completedNormally: true,
    });
    await repos.workSessions.createSession({
      taskId: null,
      projectId: null,
      mode: "POMODORO",
      startedAt: iso,
      endedAt: iso,
      durationSeconds: 3000,
      completedNormally: true,
    });

    const total = await repos.workSessions.focusedSecondsSince(
      new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    );
    expect(total).toBe(4500);

    const list = await repos.workSessions.list();
    expect(list).toHaveLength(2);
    await db.close();
  });

  it("persists and recovers an active timer across reopen", async () => {
    const path = join(tmpdir(), `questforge-ws-${randomUUID()}.sqlite`);
    files.push(path);

    {
      const db = createNodeSqliteDatabase(path);
      await runMigrations(db);
      const repos = createRepositories(db);
      await repos.workSessions.startTimer({
        taskId: null,
        projectId: null,
        mode: "STOPWATCH",
        targetSeconds: null,
        startedAt: new Date().toISOString(),
        accumulatedSeconds: 0,
        isPaused: false,
      });
      await repos.workSessions.checkpointTimer(240, false);
      await db.close();
    }

    {
      const db = createNodeSqliteDatabase(path);
      await runMigrations(db);
      const repos = createRepositories(db);
      const active = await repos.workSessions.getActiveTimer();
      expect(active).not.toBeNull();
      // Only checkpointed focus time survives — never closed-app time.
      expect(active?.accumulatedSeconds).toBe(240);
      await repos.workSessions.clearTimer();
      expect(await repos.workSessions.getActiveTimer()).toBeNull();
      await db.close();
    }
  });
});
