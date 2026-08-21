import type {
  NewTask,
  StatReward,
  Task,
  TaskStatus,
} from "@/types";
import type { Database } from "@/data/db";
import { newId } from "@/data/db";
import { totalXpFromRewards } from "@/domain/xp";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  difficulty: string;
  estimated_minutes: number | null;
  planned_date: string | null;
  deadline: string | null;
  xp_reward: number;
  parent_task_id: string | null;
  goal_id: string | null;
  project_id: string | null;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
}

function mapTask(r: TaskRow, rewards: StatReward[]): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status as Task["status"],
    priority: r.priority as Task["priority"],
    difficulty: r.difficulty as Task["difficulty"],
    estimatedMinutes: r.estimated_minutes,
    plannedDate: r.planned_date,
    deadline: r.deadline,
    xpReward: r.xp_reward,
    parentTaskId: r.parent_task_id,
    goalId: r.goal_id,
    projectId: r.project_id,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    statRewards: rewards,
  };
}

export interface TaskFilter {
  status?: TaskStatus | TaskStatus[];
  plannedDate?: string;
  projectId?: string;
  goalId?: string;
  parentTaskId?: string | null;
  includeCompleted?: boolean;
}

export function createTaskRepo(db: Database) {
  async function rewardsFor(taskId: string): Promise<StatReward[]> {
    const rows = await db.select<{ stat_id: string; xp: number; name: string }>(
      `SELECT r.stat_id, r.xp, s.name
         FROM task_stat_rewards r
         JOIN stats s ON s.id = r.stat_id
        WHERE r.task_id = ?`,
      [taskId],
    );
    return rows.map((r) => ({ statId: r.stat_id, statName: r.name, xp: r.xp }));
  }

  async function rewardsForMany(
    taskIds: string[],
  ): Promise<Map<string, StatReward[]>> {
    const map = new Map<string, StatReward[]>();
    if (taskIds.length === 0) return map;
    const placeholders = taskIds.map(() => "?").join(", ");
    const rows = await db.select<{
      task_id: string;
      stat_id: string;
      xp: number;
      name: string;
    }>(
      `SELECT r.task_id, r.stat_id, r.xp, s.name
         FROM task_stat_rewards r
         JOIN stats s ON s.id = r.stat_id
        WHERE r.task_id IN (${placeholders})`,
      taskIds,
    );
    for (const r of rows) {
      const list = map.get(r.task_id) ?? [];
      list.push({ statId: r.stat_id, statName: r.name, xp: r.xp });
      map.set(r.task_id, list);
    }
    return map;
  }

  return {
    async getById(id: string): Promise<Task | null> {
      const rows = await db.select<TaskRow>("SELECT * FROM tasks WHERE id = ?", [
        id,
      ]);
      if (!rows[0]) return null;
      return mapTask(rows[0], await rewardsFor(id));
    },

    async list(filter: TaskFilter = {}): Promise<Task[]> {
      const where: string[] = [];
      const params: unknown[] = [];

      if (filter.status) {
        const statuses = Array.isArray(filter.status)
          ? filter.status
          : [filter.status];
        where.push(`status IN (${statuses.map(() => "?").join(", ")})`);
        params.push(...statuses);
      } else if (!filter.includeCompleted) {
        where.push("status NOT IN ('COMPLETED', 'CANCELLED')");
      }
      if (filter.plannedDate) {
        where.push("planned_date = ?");
        params.push(filter.plannedDate);
      }
      if (filter.projectId) {
        where.push("project_id = ?");
        params.push(filter.projectId);
      }
      if (filter.goalId) {
        where.push("goal_id = ?");
        params.push(filter.goalId);
      }
      if (filter.parentTaskId !== undefined) {
        if (filter.parentTaskId === null) {
          where.push("parent_task_id IS NULL");
        } else {
          where.push("parent_task_id = ?");
          params.push(filter.parentTaskId);
        }
      }

      const sql =
        "SELECT * FROM tasks" +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        " ORDER BY sort_order, created_at";
      const rows = await db.select<TaskRow>(sql, params);
      const rewardMap = await rewardsForMany(rows.map((r) => r.id));
      return rows.map((r) => mapTask(r, rewardMap.get(r.id) ?? []));
    },

    async create(input: NewTask): Promise<Task> {
      const id = newId();
      const createdAt = new Date().toISOString();
      const rewards = input.statRewards ?? [];
      const xpReward = totalXpFromRewards(rewards);
      await db.execute(
        `INSERT INTO tasks
          (id, title, description, status, priority, difficulty, estimated_minutes,
           planned_date, deadline, xp_reward, parent_task_id, goal_id, project_id,
           sort_order, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          id,
          input.title,
          input.description ?? null,
          input.status ?? "TODO",
          input.priority ?? "NORMAL",
          input.difficulty ?? "MEDIUM",
          input.estimatedMinutes ?? null,
          input.plannedDate ?? null,
          input.deadline ?? null,
          xpReward,
          input.parentTaskId ?? null,
          input.goalId ?? null,
          input.projectId ?? null,
          0,
          createdAt,
        ],
      );
      for (const reward of rewards) {
        await db.execute(
          "INSERT INTO task_stat_rewards (task_id, stat_id, xp) VALUES (?, ?, ?)",
          [id, reward.statId, reward.xp],
        );
      }
      return (await this.getById(id))!;
    },

    async setStatus(
      id: string,
      status: TaskStatus,
      completedAt: string | null,
    ): Promise<void> {
      await db.execute(
        "UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?",
        [status, completedAt, id],
      );
    },

    async update(
      id: string,
      fields: Partial<{
        title: string;
        description: string | null;
        priority: Task["priority"];
        difficulty: Task["difficulty"];
        estimatedMinutes: number | null;
        plannedDate: string | null;
        deadline: string | null;
        projectId: string | null;
        goalId: string | null;
        parentTaskId: string | null;
        sortOrder: number;
      }>,
    ): Promise<void> {
      const columnMap: Record<string, string> = {
        title: "title",
        description: "description",
        priority: "priority",
        difficulty: "difficulty",
        estimatedMinutes: "estimated_minutes",
        plannedDate: "planned_date",
        deadline: "deadline",
        projectId: "project_id",
        goalId: "goal_id",
        parentTaskId: "parent_task_id",
        sortOrder: "sort_order",
      };
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [key, value] of Object.entries(fields)) {
        const col = columnMap[key];
        if (!col) continue;
        sets.push(`${col} = ?`);
        params.push(value);
      }
      if (sets.length === 0) return;
      params.push(id);
      await db.execute(
        `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`,
        params,
      );
    },

    async setStatRewards(
      taskId: string,
      rewards: StatReward[],
    ): Promise<void> {
      await db.execute("DELETE FROM task_stat_rewards WHERE task_id = ?", [
        taskId,
      ]);
      for (const reward of rewards) {
        await db.execute(
          "INSERT INTO task_stat_rewards (task_id, stat_id, xp) VALUES (?, ?, ?)",
          [taskId, reward.statId, reward.xp],
        );
      }
      await db.execute("UPDATE tasks SET xp_reward = ? WHERE id = ?", [
        totalXpFromRewards(rewards),
        taskId,
      ]);
    },

    async delete(id: string): Promise<void> {
      // xp_transactions.task_id is ON DELETE SET NULL, so XP history is kept.
      await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
    },
  };
}

export type TaskRepo = ReturnType<typeof createTaskRepo>;
