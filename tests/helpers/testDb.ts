import { createNodeSqliteDatabase } from "@/data/adapters/nodeSqlite";
import { runMigrations } from "@/data/migrations";
import { createRepositories, type Repositories } from "@/data/repositories";

/** Spin up a fresh migrated in-memory database with repositories for a test. */
export async function makeTestRepos(path = ":memory:"): Promise<Repositories> {
  const db = createNodeSqliteDatabase(path);
  await runMigrations(db);
  return createRepositories(db);
}
