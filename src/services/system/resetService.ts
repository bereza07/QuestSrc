import type { Repositories } from "@/data/repositories";

// Deletes all gameplay data (character, stats, tasks, goals, XP history) while
// keeping app settings such as the AI configuration. Destructive — callers must
// confirm with the user first (req #46).
const TABLES_IN_DELETE_ORDER = [
  "xp_transactions",
  "task_stat_rewards",
  "task_criteria",
  "tasks",
  "goals",
  "projects",
  "stats",
  "character",
];

export async function resetProgress(repos: Repositories): Promise<void> {
  await repos.db.transaction(async (tx) => {
    for (const table of TABLES_IN_DELETE_ORDER) {
      await tx.execute(`DELETE FROM ${table}`);
    }
  });
}
