import type { Database } from "@/data/db";

export interface UnlockedAchievement {
  key: string;
  unlockedAt: string;
}

export type CustomAchievementMetric =
  | "completedCount"
  | "currentStreak"
  | "longestStreak"
  | "characterLevel"
  | "focusedSeconds";

export interface CustomAchievement {
  key: string;
  name: string;
  description: string;
  icon: string | null;
  metric: CustomAchievementMetric;
  threshold: number;
  createdAt: string;
}

interface CustomRow {
  key: string;
  name: string;
  description: string;
  icon: string | null;
  metric: string;
  threshold: number;
  created_at: string;
}

export function createAchievementRepo(db: Database) {
  return {
    async listUnlocked(): Promise<UnlockedAchievement[]> {
      const rows = await db.select<{ key: string; unlocked_at: string }>(
        "SELECT key, unlocked_at FROM achievements",
      );
      return rows.map((r) => ({ key: r.key, unlockedAt: r.unlocked_at }));
    },

    /** Unlock a key if not already unlocked. Returns true if newly unlocked. */
    async unlock(key: string): Promise<boolean> {
      const res = await db.execute(
        "INSERT OR IGNORE INTO achievements (key, unlocked_at) VALUES (?, ?)",
        [key, new Date().toISOString()],
      );
      return res.rowsAffected > 0;
    },

    async listCustom(): Promise<CustomAchievement[]> {
      const rows = await db.select<CustomRow>(
        "SELECT * FROM custom_achievements ORDER BY created_at",
      );
      return rows.map((r) => ({
        key: r.key,
        name: r.name,
        description: r.description,
        icon: r.icon,
        metric: r.metric as CustomAchievementMetric,
        threshold: r.threshold,
        createdAt: r.created_at,
      }));
    },

    async addCustom(a: {
      key: string;
      name: string;
      description: string;
      icon?: string | null;
      metric: CustomAchievementMetric;
      threshold: number;
    }): Promise<void> {
      await db.execute(
        `INSERT OR IGNORE INTO custom_achievements
           (key, name, description, icon, metric, threshold, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          a.key,
          a.name,
          a.description,
          a.icon ?? null,
          a.metric,
          a.threshold,
          new Date().toISOString(),
        ],
      );
    },
  };
}

export type AchievementRepo = ReturnType<typeof createAchievementRepo>;
