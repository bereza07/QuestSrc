import type { Migration } from "./types";

// Phase 7 — Achievements. Definitions live in code (src/domain/achievements.ts);
// this table only records which have been unlocked and when.
export const migration0005: Migration = {
  version: 5,
  name: "achievements",
  statements: [
    `CREATE TABLE achievements (
      key         TEXT PRIMARY KEY,
      unlocked_at TEXT NOT NULL
    )`,
  ],
};
