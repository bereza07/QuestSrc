// tauri-plugin-sql adapter — used by the real desktop app.
//
// IMPORTANT (architecture note): tauri-plugin-sql runs on top of an sqlx
// connection POOL, so a BEGIN issued by one `execute` call is not guaranteed
// to land on the same physical connection as the following statements. That
// makes cross-call BEGIN/COMMIT transactions unreliable here.
//
// Rather than fight the pool, QuestForge's correctness does NOT depend on
// multi-statement transactions on this adapter: XP is *derived* from the
// append-only `xp_transactions` table (protected by a UNIQUE index), and the
// cached totals on `character`/`stats` are recomputed from those rows. This
// makes task completion idempotent and self-healing even under partial
// failure (see services/xp/xpService.ts). `transaction()` therefore runs its
// body inline rather than emitting a fragile BEGIN/COMMIT that could leak an
// open transaction and lock the WAL. The Node test adapter uses real
// transactions, so the transactional path is still exercised in CI.

import Database_ from "@tauri-apps/plugin-sql";
import type { Database, QueryResult } from "@/data/db";

/** Convert `?` positional placeholders to the `$1,$2,…` form sqlx expects. */
function toNumberedPlaceholders(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

class TauriSqlDatabase implements Database {
  constructor(private db: Database_) {}

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const res = await this.db.execute(toNumberedPlaceholders(sql), params);
    return {
      rowsAffected: res.rowsAffected,
      lastInsertId: res.lastInsertId,
    };
  }

  async select<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return this.db.select<T[]>(toNumberedPlaceholders(sql), params);
  }

  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    // See the file-level note: run inline; correctness comes from the
    // append-only + derived-totals design, not from BEGIN/COMMIT here.
    return fn(this);
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

/** Open the app's SQLite database via tauri-plugin-sql. */
export async function createTauriSqlDatabase(
  connection = "sqlite:questforge.db",
): Promise<Database> {
  const db = await Database_.load(connection);
  const wrapped = new TauriSqlDatabase(db);
  await wrapped.execute("PRAGMA foreign_keys = ON;");
  return wrapped;
}
