import type { Migration } from "./types";

// Feedback #10 — optional character avatar, stored as a small data-URL string
// (no external files, works offline and in the JSON backup).
export const migration0006: Migration = {
  version: 6,
  name: "avatar",
  statements: [`ALTER TABLE character ADD COLUMN avatar TEXT`],
};
