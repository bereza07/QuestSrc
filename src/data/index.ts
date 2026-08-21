// App-side database bootstrap. Chooses the right SQLite adapter for the
// runtime: native tauri-plugin-sql inside the desktop app, sql.js (WebAssembly)
// + IndexedDB when running in a plain browser. This module imports both
// adapters and is only safe to import from browser/app code (never from tests,
// which use the node:sqlite adapter directly).
import type { Database } from "./db";
import { runMigrations } from "./migrations";
import { createRepositories, type Repositories } from "./repositories";

let repositoriesPromise: Promise<Repositories> | null = null;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function openDatabase(): Promise<Database> {
  if (isTauri()) {
    const { createTauriSqlDatabase } = await import("./adapters/tauriSql");
    return createTauriSqlDatabase();
  }
  const { createSqlJsDatabase } = await import("./adapters/sqlJs");
  return createSqlJsDatabase();
}

/**
 * Open the app database, apply migrations, and return the repositories.
 * Cached so repeated calls share one connection.
 */
export function initAppDatabase(): Promise<Repositories> {
  if (!repositoriesPromise) {
    repositoriesPromise = (async () => {
      const db = await openDatabase();
      await runMigrations(db);
      return createRepositories(db);
    })();
  }
  return repositoriesPromise;
}

export type { Repositories } from "./repositories";
