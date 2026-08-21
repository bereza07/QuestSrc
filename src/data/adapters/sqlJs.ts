// Browser SQLite adapter using sql.js (SQLite compiled to WebAssembly).
// Used when QuestForge runs in a plain browser (`npm run dev`) instead of the
// Tauri desktop shell. Real SQLite semantics; the database is a single
// connection, so transactions work properly. Bytes are persisted to IndexedDB
// (debounced) so data survives reloads.

import initSqlJs, { type Database as SqlJsDb } from "sql.js";
// Bundle the wasm as an asset URL so the app stays offline/self-contained.
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { Database, QueryResult } from "@/data/db";
import { loadDbBytes, saveDbBytes } from "./idbPersist";

class SqlJsDatabase implements Database {
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private db: SqlJsDb,
    private inTransaction = false,
  ) {}

  private schedulePersist() {
    if (this.inTransaction) return; // persist once, after commit
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      void saveDbBytes(this.db.export());
    }, 250);
  }

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    this.db.run(sql, params as never[]);
    const rowsAffected = this.db.getRowsModified();
    this.schedulePersist();
    return { rowsAffected };
  }

  async select<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as never[]);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      return out;
    } finally {
      stmt.free();
    }
  }

  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    this.db.run("BEGIN");
    const tx = new SqlJsDatabase(this.db, true);
    try {
      const result = await fn(tx);
      this.db.run("COMMIT");
      this.schedulePersist();
      return result;
    } catch (err) {
      this.db.run("ROLLBACK");
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    await saveDbBytes(this.db.export());
    this.db.close();
  }
}

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

export async function createSqlJsDatabase(): Promise<Database> {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => wasmUrl });
  const SQL = await sqlPromise;
  const saved = await loadDbBytes();
  const raw = saved ? new SQL.Database(saved) : new SQL.Database();
  raw.run("PRAGMA foreign_keys = ON;");
  return new SqlJsDatabase(raw);
}
