import type { Migration } from "./types";

// Персистентная память ассистента: пользовательские правила, которые ИИ должен
// соблюдать во всех ответах ("не планируй больше 4 ч в день", "по средам —
// только программирование", и т.п.). Правила инжектятся в системный промпт.
export const migration0010: Migration = {
  version: 10,
  name: "ai_rules",
  statements: [
    `CREATE TABLE ai_rules (
      id         TEXT PRIMARY KEY,
      text       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX idx_ai_rules_created ON ai_rules (created_at)`,
  ],
};
