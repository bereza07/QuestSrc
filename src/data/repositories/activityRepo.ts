import type { Database } from "@/data/db";
import { boolToInt, intToBool } from "@/data/db";

export interface DailyActivity {
  date: string;
  focusedSeconds: number;
  xpEarned: number;
  tasksCompleted: number;
  goalMet: boolean;
  isRestDay: boolean;
}

export interface StreakRow {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  freezesRemaining: number;
  freezesResetMonth: string | null;
}

interface ActivityRow {
  date: string;
  focused_seconds: number;
  xp_earned: number;
  tasks_completed: number;
  goal_met: number;
  is_rest_day: number;
}

function mapActivity(r: ActivityRow): DailyActivity {
  return {
    date: r.date,
    focusedSeconds: r.focused_seconds,
    xpEarned: r.xp_earned,
    tasksCompleted: r.tasks_completed,
    goalMet: intToBool(r.goal_met),
    isRestDay: intToBool(r.is_rest_day),
  };
}

export function createActivityRepo(db: Database) {
  return {
    async getDay(date: string): Promise<DailyActivity | null> {
      const rows = await db.select<ActivityRow>(
        "SELECT * FROM daily_activity WHERE date = ?",
        [date],
      );
      return rows[0] ? mapActivity(rows[0]) : null;
    },

    async listMetDates(): Promise<string[]> {
      const rows = await db.select<{ date: string }>(
        "SELECT date FROM daily_activity WHERE goal_met = 1",
      );
      return rows.map((r) => r.date);
    },

    async listRecent(days: number): Promise<DailyActivity[]> {
      const rows = await db.select<ActivityRow>(
        "SELECT * FROM daily_activity ORDER BY date DESC LIMIT ?",
        [days],
      );
      return rows.map(mapActivity);
    },

    /** Upsert a day's aggregates. Absolute values (not deltas). */
    async upsertDay(a: DailyActivity): Promise<void> {
      await db.execute(
        `INSERT INTO daily_activity
           (date, focused_seconds, xp_earned, tasks_completed, goal_met, is_rest_day)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           focused_seconds = excluded.focused_seconds,
           xp_earned       = excluded.xp_earned,
           tasks_completed = excluded.tasks_completed,
           goal_met        = excluded.goal_met,
           is_rest_day     = excluded.is_rest_day`,
        [
          a.date,
          a.focusedSeconds,
          a.xpEarned,
          a.tasksCompleted,
          boolToInt(a.goalMet),
          boolToInt(a.isRestDay),
        ],
      );
    },

    async getStreak(): Promise<StreakRow> {
      const rows = await db.select<{
        current: number;
        longest: number;
        last_active_date: string | null;
        freezes_remaining: number;
        freezes_reset_month: string | null;
      }>("SELECT * FROM streak WHERE id = 'main'");
      const r = rows[0];
      return {
        current: r?.current ?? 0,
        longest: r?.longest ?? 0,
        lastActiveDate: r?.last_active_date ?? null,
        freezesRemaining: r?.freezes_remaining ?? 0,
        freezesResetMonth: r?.freezes_reset_month ?? null,
      };
    },

    async setStreak(s: Partial<StreakRow>): Promise<void> {
      const map: Record<string, string> = {
        current: "current",
        longest: "longest",
        lastActiveDate: "last_active_date",
        freezesRemaining: "freezes_remaining",
        freezesResetMonth: "freezes_reset_month",
      };
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of Object.entries(s)) {
        const col = map[k];
        if (!col) continue;
        sets.push(`${col} = ?`);
        params.push(v);
      }
      if (sets.length === 0) return;
      await db.execute(`UPDATE streak SET ${sets.join(", ")} WHERE id = 'main'`, params);
    },

    // --- one-off rest days ---

    async listRestDays(): Promise<string[]> {
      const rows = await db.select<{ date: string }>("SELECT date FROM rest_days");
      return rows.map((r) => r.date);
    },

    async setRestDay(date: string, rest: boolean): Promise<void> {
      if (rest) {
        await db.execute("INSERT OR IGNORE INTO rest_days (date) VALUES (?)", [date]);
      } else {
        await db.execute("DELETE FROM rest_days WHERE date = ?", [date]);
      }
    },
  };
}

export type ActivityRepo = ReturnType<typeof createActivityRepo>;
