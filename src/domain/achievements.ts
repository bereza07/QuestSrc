// Achievement definitions + pure unlock conditions (spec §32). Names and
// descriptions are localized in the UI via i18n keys `ach.<key>.name/desc`.

export interface AchievementMetrics {
  completedCount: number;
  epicCompleted: boolean;
  currentStreak: number;
  longestStreak: number;
  characterLevel: number;
  focusedSeconds: number;
}

export interface AchievementDef {
  key: string;
  icon: string;
  test: (m: AchievementMetrics) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: "first_quest", icon: "⚔️", test: (m) => m.completedCount >= 1 },
  { key: "ten_quests", icon: "🛡️", test: (m) => m.completedCount >= 10 },
  { key: "fifty_quests", icon: "🏰", test: (m) => m.completedCount >= 50 },
  { key: "boss_slayer", icon: "🐉", test: (m) => m.epicCompleted },
  { key: "week_warrior", icon: "🔥", test: (m) => m.longestStreak >= 7 },
  { key: "unstoppable", icon: "⚡", test: (m) => m.longestStreak >= 30 },
  { key: "deep_work", icon: "🧠", test: (m) => m.focusedSeconds >= 10 * 3600 },
  { key: "level_five", icon: "✨", test: (m) => m.characterLevel >= 5 },
];

/** Keys that are unlocked given the current metrics. */
export function evaluateAchievements(m: AchievementMetrics): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(m)).map((a) => a.key);
}
