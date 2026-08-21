import type { XpTransaction, XpTransactionKind } from "@/types";
import type { Database } from "@/data/db";
import { newId } from "@/data/db";

interface XpRow {
  id: string;
  task_id: string | null;
  stat_id: string | null;
  kind: string;
  amount: number;
  reason: string | null;
  created_at: string;
}

function mapXp(r: XpRow): XpTransaction {
  return {
    id: r.id,
    taskId: r.task_id,
    statId: r.stat_id,
    kind: r.kind as XpTransactionKind,
    amount: r.amount,
    reason: r.reason ?? "",
    createdAt: r.created_at,
  };
}

export interface NewXpTransaction {
  taskId: string | null;
  statId: string | null;
  kind: XpTransactionKind;
  amount: number;
  reason: string;
}

export function createXpRepo(db: Database) {
  return {
    /**
     * Insert XP ledger rows. Uses INSERT OR IGNORE so the UNIQUE idempotency
     * index silently prevents any double award for the same (task, stat, kind).
     * Returns the number of rows actually inserted (0 => already awarded).
     */
    async insertMany(rows: NewXpTransaction[]): Promise<number> {
      let inserted = 0;
      const createdAt = new Date().toISOString();
      for (const row of rows) {
        const res = await db.execute(
          `INSERT OR IGNORE INTO xp_transactions
             (id, task_id, stat_id, kind, amount, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            row.taskId,
            row.statId,
            row.kind,
            row.amount,
            row.reason,
            createdAt,
          ],
        );
        inserted += res.rowsAffected;
      }
      return inserted;
    },

    async sumForStat(statId: string): Promise<number> {
      const rows = await db.select<{ total: number | null }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM xp_transactions WHERE stat_id = ?",
        [statId],
      );
      return rows[0]?.total ?? 0;
    },

    /** Total XP earned on/after an ISO timestamp (for the daily goal). */
    async sumSince(sinceIso: string): Promise<number> {
      const rows = await db.select<{ total: number | null }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM xp_transactions WHERE created_at >= ?",
        [sinceIso],
      );
      return rows[0]?.total ?? 0;
    },

    /** Character lifetime XP = sum of every ledger row. */
    async sumForCharacter(): Promise<number> {
      const rows = await db.select<{ total: number | null }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM xp_transactions",
      );
      return rows[0]?.total ?? 0;
    },

    /** Remove a task's ledger rows of a kind. Returns the affected stat ids. */
    async deleteForTask(
      taskId: string,
      kind: XpTransactionKind,
    ): Promise<string[]> {
      const rows = await db.select<{ stat_id: string | null }>(
        "SELECT DISTINCT stat_id FROM xp_transactions WHERE task_id = ? AND kind = ?",
        [taskId, kind],
      );
      await db.execute(
        "DELETE FROM xp_transactions WHERE task_id = ? AND kind = ?",
        [taskId, kind],
      );
      return rows.map((r) => r.stat_id).filter((s): s is string => !!s);
    },

    async existsForTask(
      taskId: string,
      kind: XpTransactionKind,
    ): Promise<boolean> {
      const rows = await db.select<{ n: number }>(
        "SELECT COUNT(*) AS n FROM xp_transactions WHERE task_id = ? AND kind = ?",
        [taskId, kind],
      );
      return (rows[0]?.n ?? 0) > 0;
    },

    async listForStat(statId: string, limit = 10): Promise<XpTransaction[]> {
      const rows = await db.select<XpRow>(
        "SELECT * FROM xp_transactions WHERE stat_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        [statId, limit],
      );
      return rows.map(mapXp);
    },

    async listForTask(taskId: string): Promise<XpTransaction[]> {
      const rows = await db.select<XpRow>(
        "SELECT * FROM xp_transactions WHERE task_id = ? ORDER BY created_at DESC",
        [taskId],
      );
      return rows.map(mapXp);
    },

    async listRecent(limit = 25): Promise<XpTransaction[]> {
      const rows = await db.select<XpRow>(
        "SELECT * FROM xp_transactions ORDER BY created_at DESC, id DESC LIMIT ?",
        [limit],
      );
      return rows.map(mapXp);
    },
  };
}

export type XpRepo = ReturnType<typeof createXpRepo>;
