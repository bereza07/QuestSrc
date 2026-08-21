import type { Database } from "@/data/db";

// Key/value settings (non-secret). The AI API key is NOT stored here — it goes
// to OS secure storage (added in Phase 5).
export function createSettingsRepo(db: Database) {
  return {
    async get(key: string): Promise<string | null> {
      const rows = await db.select<{ value: string }>(
        "SELECT value FROM settings WHERE key = ?",
        [key],
      );
      return rows[0]?.value ?? null;
    },

    async getAll(): Promise<Record<string, string>> {
      const rows = await db.select<{ key: string; value: string }>(
        "SELECT key, value FROM settings",
      );
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },

    async set(key: string, value: string): Promise<void> {
      await db.execute(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
      );
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
