import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createNodeSqliteDatabase } from "@/data/adapters/nodeSqlite";
import { runMigrations } from "@/data/migrations";
import { createRepositories } from "@/data/repositories";
import { createCharacter } from "@/services/character/characterService";
import { createTask, complete, uncomplete } from "@/services/tasks/taskService";

const files: string[] = [];
afterEach(() => {
  for (const f of files.splice(0)) {
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(f + suffix)) rmSync(f + suffix, { force: true });
    }
  }
});

async function setup() {
  const path = join(tmpdir(), `questforge-undo-${randomUUID()}.sqlite`);
  files.push(path);
  const db = createNodeSqliteDatabase(path);
  await runMigrations(db);
  const repos = createRepositories(db);
  await createCharacter(repos, {
    name: "Hero",
    startingStats: [{ name: "Programming" }],
  });
  return { db, repos };
}

describe("undo completion (XP revocation)", () => {
  it("revokes XP and reopens the task, and is self-consistent", async () => {
    const { db, repos } = await setup();
    const stat = await repos.stats.findByName("Programming");
    const task = await createTask(repos, {
      title: "Do the thing",
      difficulty: "MEDIUM",
      statRewards: [{ statId: stat!.id, xp: 40 }],
    });

    await complete(repos, task.id);
    expect((await repos.character.get())!.totalXp).toBe(40);
    expect((await repos.stats.findByName("Programming"))!.totalXp).toBe(40);

    await uncomplete(repos, task.id);
    const reopened = await repos.tasks.getById(task.id);
    expect(reopened!.status).toBe("TODO");
    expect((await repos.character.get())!.totalXp).toBe(0);
    expect((await repos.stats.findByName("Programming"))!.totalXp).toBe(0);

    // Re-completing after undo awards exactly once again.
    await complete(repos, task.id);
    expect((await repos.character.get())!.totalXp).toBe(40);

    await db.close();
  });
});
