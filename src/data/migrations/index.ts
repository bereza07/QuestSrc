import type { Database } from "@/data/db";
import type { Migration } from "./types";
import { migration0001 } from "./0001_init";
import { migration0002 } from "./0002_timer";
import { migration0003 } from "./0003_streak";
import { migration0004 } from "./0004_chat";
import { migration0005 } from "./0005_achievements";
import { migration0006 } from "./0006_avatar";
import { migration0007 } from "./0007_chat_applied";
import { migration0008 } from "./0008_task_images";
import { migration0009 } from "./0009_custom_achievements";
import { migration0010 } from "./0010_ai_rules";

// Ordered list of all migrations. Append new ones with the next version number.
export const MIGRATIONS: Migration[] = [
  migration0001,
  migration0002,
  migration0003,
  migration0004,
  migration0005,
  migration0006,
  migration0007,
  migration0008,
  migration0009,
  migration0010,
];

/**
 * Apply any migrations not yet recorded. Idempotent: running twice is a no-op.
 * Each migration's statements are applied and then the version is recorded in
 * `schema_migrations`.
 */
export async function runMigrations(db: Database): Promise<number> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = await db.select<{ version: number }>(
    "SELECT version FROM schema_migrations",
  );
  const appliedVersions = new Set(applied.map((r) => r.version));

  const pending = MIGRATIONS.filter(
    (m) => !appliedVersions.has(m.version),
  ).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.transaction(async (tx) => {
      for (const stmt of migration.statements) {
        await tx.execute(stmt);
      }
      await tx.execute(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        [migration.version, migration.name, new Date().toISOString()],
      );
    });
  }

  return pending.length;
}
