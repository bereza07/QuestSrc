import type { Migration } from "./types";

// Runtime-created achievements (proposed by AI, confirmed by the user). Built-in
// achievements still live in code; this table stores custom ones that were added
// to the character's journey.
export const migration0009: Migration = {
  version: 9,
  name: "custom_achievements",
  statements: [
    `CREATE TABLE custom_achievements (
      key           TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT NOT NULL,
      icon          TEXT,
      metric        TEXT NOT NULL,
      threshold     INTEGER NOT NULL,
      created_at    TEXT NOT NULL
    )`,
  ],
};
