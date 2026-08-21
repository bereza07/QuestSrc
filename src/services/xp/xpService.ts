// The XP service — the reliability-critical core (reqs #43, #60).
//
// Design that makes task completion idempotent and self-healing:
//   * XP lives in the append-only `xp_transactions` ledger.
//   * A UNIQUE(task_id, stat_id, kind) index means the SAME task can never
//     award XP to the SAME stat twice — enforced by the database itself.
//   * `character`/`stats` totals are CACHES recomputed from the ledger, so
//     they can never drift into an inconsistent state; a partial failure just
//     re-heals on the next run.
//
// Therefore calling completeTask twice awards XP exactly once, regardless of
// transaction guarantees on the underlying adapter.

import type { CompletionResult, Stat, Task } from "@/types";
import { levelFromTotalXp } from "@/domain/leveling";
import type { Database } from "@/data/db";
import { createRepositories, type Repositories } from "@/data/repositories";

// Serialize XP mutations so two rapid completions can't interleave.
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn);
  lock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Recompute a stat's cached level/xp from the ledger. Returns level-up info. */
export async function recomputeStat(
  repos: Repositories,
  stat: Stat,
): Promise<{ leveledUp: boolean; newLevel: number; totalXp: number }> {
  const totalXp = await repos.xp.sumForStat(stat.id);
  const progress = levelFromTotalXp(totalXp);
  await repos.stats.updateProgress(
    stat.id,
    progress.level,
    progress.currentXp,
    progress.totalXp,
  );
  return {
    leveledUp: progress.level > stat.level,
    newLevel: progress.level,
    totalXp,
  };
}

/** Recompute the character's cached level/xp from the whole ledger. */
export async function recomputeCharacter(
  repos: Repositories,
): Promise<{ leveledUp: boolean; newLevel: number }> {
  const character = await repos.character.get();
  if (!character) return { leveledUp: false, newLevel: 1 };
  const totalXp = await repos.xp.sumForCharacter();
  const progress = levelFromTotalXp(totalXp);
  await repos.character.updateProgress(
    character.id,
    progress.level,
    progress.currentXp,
    progress.totalXp,
  );
  return {
    leveledUp: progress.level > character.level,
    newLevel: progress.level,
  };
}

async function completeTaskInner(
  repos: Repositories,
  task: Task,
): Promise<CompletionResult> {
  // Guard: already completed => idempotent no-op (no XP re-award).
  if (task.status === "COMPLETED") {
    const fresh = (await repos.tasks.getById(task.id)) ?? task;
    const character = await repos.character.get();
    return {
      awarded: false,
      task: fresh,
      statXp: [],
      totalXp: 0,
      characterLeveledUp: false,
      characterNewLevel: character?.level ?? 1,
      statLevelUps: [],
    };
  }

  // 1) Append XP ledger rows (idempotent via UNIQUE index + INSERT OR IGNORE).
  const rewards = task.statRewards.filter((r) => r.xp > 0);
  await repos.xp.insertMany(
    rewards.map((r) => ({
      taskId: task.id,
      statId: r.statId,
      kind: "TASK_COMPLETION" as const,
      amount: r.xp,
      reason: `Completed: ${task.title}`,
    })),
  );

  // 2) Recompute affected stats (detect stat level-ups).
  const statLevelUps: CompletionResult["statLevelUps"] = [];
  const statXp: CompletionResult["statXp"] = [];
  for (const reward of rewards) {
    const stat = await repos.stats.getById(reward.statId);
    if (!stat) continue;
    const result = await recomputeStat(repos, stat);
    statXp.push({ statId: stat.id, statName: stat.name, amount: reward.xp });
    if (result.leveledUp) {
      statLevelUps.push({
        statId: stat.id,
        statName: stat.name,
        newLevel: result.newLevel,
      });
    }
  }

  // 3) Recompute the character (detect character level-up).
  const characterResult = await recomputeCharacter(repos);

  // 4) Mark the task completed.
  await repos.tasks.setStatus(task.id, "COMPLETED", new Date().toISOString());
  const updated = (await repos.tasks.getById(task.id))!;

  return {
    awarded: true,
    task: updated,
    statXp,
    totalXp: rewards.reduce((sum, r) => sum + r.xp, 0),
    characterLeveledUp: characterResult.leveledUp,
    characterNewLevel: characterResult.newLevel,
    statLevelUps,
  };
}

/**
 * Complete a task and award XP exactly once. Safe to call repeatedly.
 * Runs inside a DB transaction (real atomicity on the test adapter; inline on
 * the Tauri adapter, where the append-only design provides correctness).
 */
export function completeTask(
  repos: Repositories,
  taskId: string,
): Promise<CompletionResult> {
  return withLock(async () => {
    const task = await repos.tasks.getById(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    return repos.db.transaction((tx: Database) =>
      completeTaskInner(createRepositories(tx), task),
    );
  });
}

async function uncompleteTaskInner(
  repos: Repositories,
  task: Task,
): Promise<void> {
  if (task.status !== "COMPLETED") return;
  // Remove the completion XP from the ledger, then re-heal the caches.
  const affectedStatIds = await repos.xp.deleteForTask(task.id, "TASK_COMPLETION");
  for (const statId of affectedStatIds) {
    const stat = await repos.stats.getById(statId);
    if (stat) await recomputeStat(repos, stat);
  }
  await recomputeCharacter(repos);
  await repos.tasks.setStatus(task.id, "TODO", null);
}

/**
 * Reverse a completion (Undo): revoke the awarded XP and reopen the task.
 * Because totals are recomputed from the ledger, this is exact and safe.
 */
export function uncompleteTask(
  repos: Repositories,
  taskId: string,
): Promise<void> {
  return withLock(async () => {
    const task = await repos.tasks.getById(taskId);
    if (!task) return;
    return repos.db.transaction((tx: Database) =>
      uncompleteTaskInner(createRepositories(tx), task),
    );
  });
}
