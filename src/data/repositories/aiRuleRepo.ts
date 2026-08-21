import type { Database } from "@/data/db";
import { newId } from "@/data/db";

export interface AIRule {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  text: string;
  created_at: string;
  updated_at: string;
}

const map = (r: Row): AIRule => ({
  id: r.id,
  text: r.text,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function createAIRuleRepo(db: Database) {
  return {
    async list(): Promise<AIRule[]> {
      const rows = await db.select<Row>(
        "SELECT * FROM ai_rules ORDER BY created_at, id",
      );
      return rows.map(map);
    },

    async add(text: string): Promise<AIRule> {
      const id = newId();
      const now = new Date().toISOString();
      await db.execute(
        "INSERT INTO ai_rules (id, text, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [id, text, now, now],
      );
      return { id, text, createdAt: now, updatedAt: now };
    },

    async update(id: string, text: string): Promise<void> {
      await db.execute(
        "UPDATE ai_rules SET text = ?, updated_at = ? WHERE id = ?",
        [text, new Date().toISOString(), id],
      );
    },

    async remove(id: string): Promise<void> {
      await db.execute("DELETE FROM ai_rules WHERE id = ?", [id]);
    },
  };
}

export type AIRuleRepo = ReturnType<typeof createAIRuleRepo>;
