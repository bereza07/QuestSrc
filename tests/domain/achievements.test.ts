import { describe, it, expect } from "vitest";
import { evaluateAchievements, type AchievementMetrics } from "@/domain/achievements";

const base: AchievementMetrics = {
  completedCount: 0,
  epicCompleted: false,
  currentStreak: 0,
  longestStreak: 0,
  characterLevel: 1,
  focusedSeconds: 0,
};

describe("evaluateAchievements", () => {
  it("unlocks nothing at the start", () => {
    expect(evaluateAchievements(base)).toEqual([]);
  });

  it("unlocks first_quest at 1 completion", () => {
    expect(evaluateAchievements({ ...base, completedCount: 1 })).toContain("first_quest");
  });

  it("unlocks tiered quest counts", () => {
    const keys = evaluateAchievements({ ...base, completedCount: 50 });
    expect(keys).toEqual(expect.arrayContaining(["first_quest", "ten_quests", "fifty_quests"]));
  });

  it("unlocks streak and deep-work milestones", () => {
    const keys = evaluateAchievements({
      ...base,
      longestStreak: 30,
      focusedSeconds: 11 * 3600,
      epicCompleted: true,
      characterLevel: 5,
    });
    expect(keys).toEqual(
      expect.arrayContaining(["week_warrior", "unstoppable", "deep_work", "boss_slayer", "level_five"]),
    );
  });
});
