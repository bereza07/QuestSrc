// node:sqlite adapter — used by the Vitest suite (and usable as a headless
// fallback). Synchronous under the hood; wrapped to satisfy the async
// Database interface. Real SQLite semantics, zero native compilation.

import { createRequire } from "node:module";
// Type-only import (erased at build time, so Vite never resolves it).
import type { DatabaseSync } from "node:sqlite";
import type { Database, QueryResult } from "@/data/db";

// Load node:sqlite via createRequire so bundlers/Vite don't try to resolve it
// at transform time (it's a newer builtin their static analysis chokes on).
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } =
  nodeRequire("node:sqlite") as typeof import("node:sqlite");

class NodeSqliteDatabase implements Database {
  constructor(
    private db: DatabaseSync,
    private inTransaction = false,
  ) {}

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...(params as never[]));
    return {
      rowsAffected: Number(info.changes ?? 0),
      lastInsertId: info.lastInsertRowid as number | undefined,
    };
  }

  async select<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params as never[])) as T[];
  }

  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      // Already inside a transaction — just run inline.
      return fn(this);
    }
    this.db.exec("BEGIN");
    const tx = new NodeSqliteDatabase(this.db, true);
    try {
      const result = await fn(tx);
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/** Open a node:sqlite database. Use ":memory:" for tests. */
export function createNodeSqliteDatabase(path = ":memory:"): Database {
  const raw = new DatabaseSyncCtor(path);
  raw.exec("PRAGMA foreign_keys = ON;");
  raw.exec("PRAGMA journal_mode = WAL;");
  return new NodeSqliteDatabase(raw);
}
