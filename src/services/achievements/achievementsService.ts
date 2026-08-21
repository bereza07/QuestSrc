import type { Repositories } from "@/data/repositories";
import {
  evaluateAchievements,
  type AchievementMetrics,
} from "@/domain/achievements";

const EPOCH = "1970-01-01T00:00:00.000Z";

async function gatherMetrics(repos: Repositories): Promise<AchievementMetrics> {
  const [completed, streak, character, focusedSeconds] = await Promise.all([
    repos.tasks.list({ status: ["COMPLETED"], includeCompleted: true }),
    repos.activity.getStreak(),
    repos.character.get(),
    repos.workSessions.focusedSecondsSince(EPOCH),
  ]);
  return {
    completedCount: completed.length,
    epicCompleted: completed.some((t) => t.difficulty === "EPIC"),
    currentStreak: streak.current,
    longestStreak: streak.longest,
    characterLevel: character?.level ?? 1,
    focusedSeconds,
  };
}

/**
 * Evaluate unlock conditions and persist any newly-earned achievements —
 * both built-in (from domain/achievements) and custom ones stored per-user.
 * Returns the keys unlocked on THIS call (for notifications).
 */
export async function evaluateAndUnlock(repos: Repositories): Promise<string[]> {
  const metrics = await gatherMetrics(repos);
  const earned = new Set(evaluateAchievements(metrics));

  // Also test the user's custom achievements.
  const custom = await repos.achievements.listCustom();
  for (const c of custom) {
    const value = metrics[c.metric] as number;
    if (typeof value === "number" && value >= c.threshold) earned.add(c.key);
  }

  const newlyUnlocked: string[] = [];
  for (const key of earned) {
    if (await repos.achievements.unlock(key)) newlyUnlocked.push(key);
  }
  return newlyUnlocked;
}
