import { describe, it, expect, beforeEach } from "vitest";
import { makeTestRepos } from "../helpers/testDb";
import type { Repositories } from "@/data/repositories";
import { createCharacter } from "@/services/character/characterService";
import { createTask, complete } from "@/services/tasks/taskService";
import { xpForLevel } from "@/domain/leveling";

async function setup(): Promise<{ repos: Repositories; statId: string }> {
  const repos = await makeTestRepos();
  await createCharacter(repos, {
    name: "Vlad",
    startingStats: [{ name: "Programming" }, { name: "Gameplay" }],
  });
  const stat = await repos.stats.findByName("Programming");
  return { repos, statId: stat!.id };
}

describe("task completion & XP", () => {
  let repos: Repositories;
  let statId: string;

  beforeEach(async () => {
    ({ repos, statId } = await setup());
  });

  it("awards XP once and updates stat + character totals", async () => {
    const task = await createTask(repos, {
      title: "Fix camera collision",
      difficulty: "MEDIUM",
      statRewards: [{ statId, xp: 40 }],
    });

    const result = await complete(repos, task.id);
    expect(result.awarded).toBe(true);
    expect(result.totalXp).toBe(40);

    const stat = await repos.stats.getById(statId);
    expect(stat!.totalXp).toBe(40);

    const character = await repos.character.get();
    expect(character!.totalXp).toBe(40);
  });

  it("is idempotent: completing twice awards XP only once", async () => {
    const task = await createTask(repos, {
      title: "Write loot tests",
      difficulty: "MEDIUM",
      statRewards: [{ statId, xp: 30 }],
    });

    const first = await complete(repos, task.id);
    const second = await complete(repos, task.id);

    expect(first.awarded).toBe(true);
    expect(second.awarded).toBe(false);

    const stat = await repos.stats.getById(statId);
    expect(stat!.totalXp).toBe(30); // NOT 60

    const character = await repos.character.get();
    expect(character!.totalXp).toBe(30);

    // Exactly one ledger row exists for this task.
    const ledger = await repos.xp.listForTask(task.id);
    expect(ledger).toHaveLength(1);
  });

  it("never creates duplicate ledger rows even after many completes", async () => {
    const task = await createTask(repos, {
      title: "Repeat me",
      difficulty: "EASY",
      statRewards: [{ statId, xp: 15 }],
    });
    for (let i = 0; i < 5; i++) await complete(repos, task.id);
    const ledger = await repos.xp.listForTask(task.id);
    expect(ledger).toHaveLength(1);
    const stat = await repos.stats.getById(statId);
    expect(stat!.totalXp).toBe(15);
  });

  it("detects stat and character level-ups", async () => {
    // Enough XP to clear level 1 (xpForLevel(1)=100). EPIC allows up to 300.
    const needed = xpForLevel(1);
    const task = await createTask(repos, {
      title: "Big milestone",
      difficulty: "EPIC",
      statRewards: [{ statId, xp: needed + 20 }],
    });
    const result = await complete(repos, task.id);
    expect(result.awarded).toBe(true);
    expect(result.characterLeveledUp).toBe(true);
    expect(result.characterNewLevel).toBeGreaterThanOrEqual(2);
    expect(result.statLevelUps.some((s) => s.statId === statId)).toBe(true);

    const stat = await repos.stats.getById(statId);
    expect(stat!.level).toBeGreaterThanOrEqual(2);
    expect(stat!.currentXp).toBe(20); // remainder after clearing level 1
  });

  it("completing a task with no rewards still marks it done, no XP", async () => {
    const task = await createTask(repos, { title: "No reward task" });
    const result = await complete(repos, task.id);
    expect(result.awarded).toBe(true);
    expect(result.totalXp).toBe(0);
    const character = await repos.character.get();
    expect(character!.totalXp).toBe(0);
  });

  it("respects XP bands: an over-cap reward is scaled down at creation", async () => {
    const task = await createTask(repos, {
      title: "Overpriced",
      difficulty: "TRIVIAL", // max 10
      statRewards: [{ statId, xp: 1000 }],
    });
    expect(task.xpReward).toBeLessThanOrEqual(10);
  });
});
