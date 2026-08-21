import type { Repositories } from "@/data/repositories";

// Full-database JSON backup / restore (spec §45). Tables are dumped and restored
// generically; schema_migrations and the live timer_state are intentionally
// excluded (migrations re-run on open; an in-flight timer shouldn't travel).

const TABLES = [
  "settings",
  "character",
  "stats",
  "projects",
  "goals",
  "tasks",
  "task_stat_rewards",
  "task_criteria",
  "xp_transactions",
  "work_sessions",
  "daily_activity",
  "streak",
  "rest_days",
  "chats",
  "chat_messages",
  "achievements",
  "task_images",
  "custom_achievements",
  "ai_rules",
] as const;

export interface BackupFile {
  app: "questforge";
  version: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function exportData(repos: Repositories): Promise<BackupFile> {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of TABLES) {
    try {
      tables[table] = await repos.db.select<Record<string, unknown>>(
        `SELECT * FROM ${table}`,
      );
    } catch {
      // A table that doesn't exist in this build shouldn't abort the backup.
      tables[table] = [];
    }
  }
  return {
    app: "questforge",
    version: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function isBackupFile(obj: unknown): obj is BackupFile {
  return (
    !!obj &&
    typeof obj === "object" &&
    (obj as BackupFile).app === "questforge" &&
    typeof (obj as BackupFile).tables === "object"
  );
}

/** Replace ALL data with the backup's contents (destructive; caller confirms). */
export async function importData(
  repos: Repositories,
  backup: BackupFile,
): Promise<void> {
  await repos.db.transaction(async (tx) => {
    // Delete children before parents isn't required (FKs are permissive), but
    // clear everything first, then repopulate.
    for (const table of [...TABLES].reverse()) {
      await tx.execute(`DELETE FROM ${table}`);
    }
    for (const table of TABLES) {
      const rows = backup.tables[table] ?? [];
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => "?").join(", ");
        await tx.execute(
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
          cols.map((c) => row[c]),
        );
      }
    }
  });
}
