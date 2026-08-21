import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createNodeSqliteDatabase } from "@/data/adapters/nodeSqlite";
import { runMigrations } from "@/data/migrations";
import { createRepositories } from "@/data/repositories";
import { createCharacter } from "@/services/character/characterService";
import { createTask, complete } from "@/services/tasks/taskService";

const files: string[] = [];
function tempDbPath(): string {
  const p = join(tmpdir(), `questforge-test-${randomUUID()}.sqlite`);
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

describe("database persistence", () => {
  it("keeps data across a close/reopen cycle", async () => {
    const path = tempDbPath();

    // First session: create character + completed task.
    {
      const db = createNodeSqliteDatabase(path);
      await runMigrations(db);
      const repos = createRepositories(db);
      await createCharacter(repos, {
        name: "Persistent Hero",
        mainQuest: "Ship the MVP",
        startingStats: [{ name: "Programming" }],
      });
      const stat = await repos.stats.findByName("Programming");
      const task = await createTask(repos, {
        title: "Persist me",
        difficulty: "MEDIUM",
        statRewards: [{ statId: stat!.id, xp: 40 }],
      });
      await complete(repos, task.id);
      await db.close();
    }

    // Second session: reopen the same file, data must still be there.
    {
      const db = createNodeSqliteDatabase(path);
      const applied = await runMigrations(db); // should be a no-op now
      expect(applied).toBe(0);
      const repos = createRepositories(db);

      const character = await repos.character.get();
      expect(character?.name).toBe("Persistent Hero");
      expect(character?.totalXp).toBe(40);

      const mainQuest = await repos.goals.getMainQuest();
      expect(mainQuest?.title).toBe("Ship the MVP");

      const stat = await repos.stats.findByName("Programming");
      expect(stat?.totalXp).toBe(40);

      await db.close();
    }
  });

  it("running migrations twice is idempotent", async () => {
    const db = createNodeSqliteDatabase(tempDbPath());
    const first = await runMigrations(db);
    const second = await runMigrations(db);
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
    await db.close();
  });
});
