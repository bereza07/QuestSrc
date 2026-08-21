import type { Database } from "@/data/db";
import { newId } from "@/data/db";
import type { AIAction } from "@/types/ai";

export const DEFAULT_CHAT = "default";

export interface ChatMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: AIAction[] | null;
  applied: boolean;
  createdAt: string;
}

interface Row {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  actions_json: string | null;
  applied: number | null;
  created_at: string;
}

function mapRow(r: Row): ChatMessageRow {
  let actions: AIAction[] | null = null;
  if (r.actions_json) {
    try {
      actions = JSON.parse(r.actions_json) as AIAction[];
    } catch {
      actions = null;
    }
  }
  return {
    id: r.id,
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.content,
    actions,
    applied: r.applied === 1,
    createdAt: r.created_at,
  };
}

export function createChatRepo(db: Database) {
  return {
    async list(chatId = DEFAULT_CHAT, limit = 100): Promise<ChatMessageRow[]> {
      const rows = await db.select<Row>(
        "SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY created_at, id LIMIT ?",
        [chatId, limit],
      );
      return rows.map(mapRow);
    },

    async append(
      role: "user" | "assistant",
      content: string,
      actions: AIAction[] | null = null,
      chatId = DEFAULT_CHAT,
    ): Promise<ChatMessageRow> {
      const id = newId();
      const createdAt = new Date().toISOString();
      await db.execute(
        `INSERT INTO chat_messages (id, chat_id, role, content, actions_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, chatId, role, content, actions ? JSON.stringify(actions) : null, createdAt],
      );
      return { id, role, content, actions, applied: false, createdAt };
    },

    /** Cancel: drop pending actions so they can't be applied after reload. */
    async clearActions(id: string): Promise<void> {
      await db.execute(
        "UPDATE chat_messages SET actions_json = NULL WHERE id = ?",
        [id],
      );
    },

    /** Confirm: mark as applied (keeps the actions as a record, hides buttons). */
    async markApplied(id: string): Promise<void> {
      await db.execute(
        "UPDATE chat_messages SET applied = 1 WHERE id = ?",
        [id],
      );
    },

    async clear(chatId = DEFAULT_CHAT): Promise<void> {
      await db.execute("DELETE FROM chat_messages WHERE chat_id = ?", [chatId]);
    },
  };
}

export type ChatRepo = ReturnType<typeof createChatRepo>;
