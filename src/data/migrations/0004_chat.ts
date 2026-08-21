import type { Migration } from "./types";

// Phase 5 — AI chat persistence. A single default thread is enough for one user,
// but the schema keeps chats/chat_messages separate (spec §6) for future threads.
export const migration0004: Migration = {
  version: 4,
  name: "chat",
  statements: [
    `CREATE TABLE chats (
      id         TEXT PRIMARY KEY,
      title      TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE chat_messages (
      id           TEXT PRIMARY KEY,
      chat_id      TEXT NOT NULL,
      role         TEXT NOT NULL,
      content      TEXT NOT NULL,
      actions_json TEXT,
      created_at   TEXT NOT NULL
    )`,
    `CREATE INDEX idx_chat_messages_chat ON chat_messages (chat_id, created_at)`,
  ],
};
