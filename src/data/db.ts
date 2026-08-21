// Database abstraction. The rest of the data layer talks only to this
// interface, so the exact same repositories/migrations run against:
//   - tauri-plugin-sql (the real desktop app)      -> adapters/tauriSql.ts
//   - node:sqlite       (the Vitest test suite)     -> adapters/nodeSqlite.ts
//
// SQL is authored with `?` positional placeholders everywhere; each adapter
// adapts that to its underlying driver.

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number | string;
}

export interface Database {
  /** Run a statement (INSERT/UPDATE/DELETE/DDL). */
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
  /** Run a query and return rows mapped to objects. */
  select<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  /**
   * Run `fn` inside a single atomic transaction. If `fn` throws, the
   * transaction is rolled back and the error re-thrown. The `tx` passed to
   * `fn` MUST be used for all statements that should be part of the atomic
   * unit. Nested transactions are not supported (single-user app).
   */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Generate a stable unique id. Available in both browser and Node 24. */
export function newId(): string {
  return crypto.randomUUID();
}

/** Boolean -> integer for SQLite storage. */
export function boolToInt(b: boolean): number {
  return b ? 1 : 0;
}

/** Integer/whatever -> boolean when reading from SQLite. */
export function intToBool(v: unknown): boolean {
  return v === 1 || v === true || v === "1";
}
