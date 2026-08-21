import { describe, it, expect } from "vitest";
import { makeTestRepos } from "../helpers/testDb";
import { seedExampleData } from "@/data/seed";

describe("seed data", () => {
  it("populates a character, stats and example quests", async () => {
    const repos = await makeTestRepos();
    await seedExampleData(repos);

    const character = await repos.character.get();
    expect(character?.name).toBe("Vlad");

    const stats = await repos.stats.list();
    expect(stats.map((s) => s.name)).toEqual(
      expect.arrayContaining(["Programming", "Gameplay", "Engineering", "Discipline"]),
    );

    const tasks = await repos.tasks.list({ includeCompleted: true });
    expect(tasks.length).toBe(4);
  });

  it("is a no-op when a character already exists", async () => {
    const repos = await makeTestRepos();
    await seedExampleData(repos);
    await seedExampleData(repos); // second call should not duplicate
    const tasks = await repos.tasks.list({ includeCompleted: true });
    expect(tasks.length).toBe(4);
  });
});
