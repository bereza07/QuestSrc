import type { Migration } from "./types";

// Persist whether an assistant message's proposed actions were applied, so the
// "✓ confirmed" state survives a reload (and the actions are never re-applied).
export const migration0007: Migration = {
  version: 7,
  name: "chat_applied",
  statements: [
    `ALTER TABLE chat_messages ADD COLUMN applied INTEGER NOT NULL DEFAULT 0`,
  ],
};
