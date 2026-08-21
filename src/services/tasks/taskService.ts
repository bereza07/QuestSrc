import type {
  CompletionResult,
  Difficulty,
  NewTask,
  StatReward,
  Task,
} from "@/types";
import type { Repositories } from "@/data/repositories";
import type { TaskFilter } from "@/data/repositories/taskRepo";
import { completeTask, uncompleteTask } from "@/services/xp/xpService";
import { normalizeStatRewards } from "@/domain/xp";
import { todayKey } from "@/utils/date";

/** Create a task, enforcing the XP economy on its stat rewards. */
export async function createTask(
  repos: Repositories,
  input: NewTask,
): Promise<Task> {
  const title = input.title.trim();
  if (!title) throw new Error("Task title is required.");
  const difficulty: Difficulty = input.difficulty ?? "MEDIUM";
  const rewards = normalizeStatRewards(input.statRewards ?? [], difficulty);
  return repos.tasks.create({ ...input, title, difficulty, statRewards: rewards });
}

export function listTasks(
  repos: Repositories,
  filter: TaskFilter = {},
): Promise<Task[]> {
  return repos.tasks.list(filter);
}

export function listToday(repos: Repositories): Promise<Task[]> {
  return repos.tasks.list({ plannedDate: todayKey(), includeCompleted: true });
}

export function listActive(repos: Repositories): Promise<Task[]> {
  return repos.tasks.list({ status: ["TODO", "IN_PROGRESS"] });
}

export function getTask(repos: Repositories, id: string): Promise<Task | null> {
  return repos.tasks.getById(id);
}

/** Complete a task (idempotent — safe to call twice). */
export function complete(
  repos: Repositories,
  id: string,
): Promise<CompletionResult> {
  return completeTask(repos, id);
}

/** Undo a completion: revoke XP and reopen the task. */
export function uncomplete(repos: Repositories, id: string): Promise<void> {
  return uncompleteTask(repos, id);
}

export async function cancel(repos: Repositories, id: string): Promise<void> {
  await repos.tasks.setStatus(id, "CANCELLED", null);
}

export async function reschedule(
  repos: Repositories,
  id: string,
  plannedDate: string | null,
): Promise<void> {
  await repos.tasks.update(id, { plannedDate });
}

export async function setStatRewards(
  repos: Repositories,
  id: string,
  rewards: StatReward[],
  difficulty: Difficulty,
): Promise<void> {
  await repos.tasks.setStatRewards(id, normalizeStatRewards(rewards, difficulty));
}

export async function deleteTask(repos: Repositories, id: string): Promise<void> {
  await repos.taskImages.removeAllForTask(id);
  await repos.tasks.delete(id);
}
