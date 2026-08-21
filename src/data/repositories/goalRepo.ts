import type { Database } from "@/data/db";
import { newId, boolToInt, intToBool } from "@/data/db";

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  isMainQuest: boolean;
  projectId: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface GoalRow {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  is_main_quest: number;
  project_id: string | null;
  created_at: string;
  completed_at: string | null;
}

function mapGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    deadline: r.deadline,
    isMainQuest: intToBool(r.is_main_quest),
    projectId: r.project_id,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

export interface NewGoal {
  title: string;
  description?: string | null;
  deadline?: string | null;
  isMainQuest?: boolean;
  projectId?: string | null;
}

export function createGoalRepo(db: Database) {
  return {
    async create(input: NewGoal): Promise<Goal> {
      const id = newId();
      const createdAt = new Date().toISOString();
      // Only one main quest at a time: demote any existing one.
      if (input.isMainQuest) {
        await db.execute("UPDATE goals SET is_main_quest = 0 WHERE is_main_quest = 1");
      }
      await db.execute(
        `INSERT INTO goals (id, title, description, deadline, is_main_quest, project_id, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          id,
          input.title,
          input.description ?? null,
          input.deadline ?? null,
          boolToInt(input.isMainQuest ?? false),
          input.projectId ?? null,
          createdAt,
        ],
      );
      return {
        id,
        title: input.title,
        description: input.description ?? null,
        deadline: input.deadline ?? null,
        isMainQuest: input.isMainQuest ?? false,
        projectId: input.projectId ?? null,
        createdAt,
        completedAt: null,
      };
    },

    async getById(id: string): Promise<Goal | null> {
      const rows = await db.select<GoalRow>("SELECT * FROM goals WHERE id = ?", [id]);
      return rows[0] ? mapGoal(rows[0]) : null;
    },

    async getMainQuest(): Promise<Goal | null> {
      // A completed main quest shouldn't dominate the dashboard forever —
      // treat it as absent so the "Current main quest" panel goes empty.
      const rows = await db.select<GoalRow>(
        "SELECT * FROM goals WHERE is_main_quest = 1 AND completed_at IS NULL LIMIT 1",
      );
      return rows[0] ? mapGoal(rows[0]) : null;
    },

    async list(): Promise<Goal[]> {
      const rows = await db.select<GoalRow>(
        "SELECT * FROM goals ORDER BY is_main_quest DESC, created_at DESC",
      );
      return rows.map(mapGoal);
    },

    async update(
      id: string,
      fields: Partial<{
        title: string;
        description: string | null;
        deadline: string | null;
        projectId: string | null;
      }>,
    ): Promise<void> {
      const columnMap: Record<string, string> = {
        title: "title",
        description: "description",
        deadline: "deadline",
        projectId: "project_id",
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
      await db.execute(`UPDATE goals SET ${sets.join(", ")} WHERE id = ?`, params);
    },

    async setMainQuest(id: string): Promise<void> {
      await db.execute("UPDATE goals SET is_main_quest = 0 WHERE is_main_quest = 1");
      await db.execute("UPDATE goals SET is_main_quest = 1 WHERE id = ?", [id]);
    },

    async setCompleted(id: string, completed: boolean): Promise<void> {
      await db.execute("UPDATE goals SET completed_at = ? WHERE id = ?", [
        completed ? new Date().toISOString() : null,
        id,
      ]);
    },

    async delete(id: string): Promise<void> {
      // tasks.goal_id is ON DELETE SET NULL, so quests survive the goal.
      await db.execute("DELETE FROM goals WHERE id = ?", [id]);
    },

    /** Completed vs total top-level (non-cancelled) tasks per goal, for progress bars. */
    async progressByGoal(): Promise<Map<string, { done: number; total: number }>> {
      const rows = await db.select<{
        goal_id: string;
        done: number;
        total: number;
      }>(
        `SELECT goal_id,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN status != 'CANCELLED' THEN 1 ELSE 0 END) AS total
           FROM tasks
          WHERE goal_id IS NOT NULL
          GROUP BY goal_id`,
      );
      const map = new Map<string, { done: number; total: number }>();
      for (const r of rows) map.set(r.goal_id, { done: r.done, total: r.total });
      return map;
    },
  };
}

export type GoalRepo = ReturnType<typeof createGoalRepo>;
