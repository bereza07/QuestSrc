import type { Migration } from "./types";

// Phase 3 — Streak & daily goal.
//   daily_activity: one row per calendar day the user was active, with the
//                   focused time / XP that day and whether the daily goal was met.
//   streak:         a single row ('main') caching current/longest streak.
//   rest_days:      explicit one-off rest days the user marked in advance.
// Recurring weekly rest days live in `settings` (work-days bitmask).
export const migration0003: Migration = {
  version: 3,
  name: "streak",
  statements: [
    `CREATE TABLE daily_activity (
      date            TEXT PRIMARY KEY,
      focused_seconds INTEGER NOT NULL DEFAULT 0,
      xp_earned       INTEGER NOT NULL DEFAULT 0,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      goal_met        INTEGER NOT NULL DEFAULT 0,
      is_rest_day     INTEGER NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE streak (
      id                 TEXT PRIMARY KEY,
      current            INTEGER NOT NULL DEFAULT 0,
      longest            INTEGER NOT NULL DEFAULT 0,
      last_active_date   TEXT,
      freezes_remaining  INTEGER NOT NULL DEFAULT 2,
      freezes_reset_month TEXT
    )`,
    `INSERT INTO streak (id, current, longest, freezes_remaining)
     VALUES ('main', 0, 0, 2)`,

    `CREATE TABLE rest_days (
      date TEXT PRIMARY KEY
    )`,
  ],
};
