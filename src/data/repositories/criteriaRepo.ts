import type { Database } from "@/data/db";
import { newId, boolToInt, intToBool } from "@/data/db";

/** A single Definition-of-Done checklist item on a task. */
export interface Criterion {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
  sortOrder: number;
}

interface CriterionRow {
  id: string;
  task_id: string;
  text: string;
  done: number;
  sort_order: number;
}

function mapCriterion(r: CriterionRow): Criterion {
  return {
    id: r.id,
    taskId: r.task_id,
    text: r.text,
    done: intToBool(r.done),
    sortOrder: r.sort_order,
  };
}

export function createCriteriaRepo(db: Database) {
  return {
    async listForTask(taskId: string): Promise<Criterion[]> {
      const rows = await db.select<CriterionRow>(
        "SELECT * FROM task_criteria WHERE task_id = ? ORDER BY sort_order, id",
        [taskId],
      );
      return rows.map(mapCriterion);
    },

    async add(taskId: string, text: string): Promise<Criterion> {
      const id = newId();
      const rows = await db.select<{ n: number }>(
        "SELECT COUNT(*) AS n FROM task_criteria WHERE task_id = ?",
        [taskId],
      );
      const sortOrder = rows[0]?.n ?? 0;
      await db.execute(
        "INSERT INTO task_criteria (id, task_id, text, done, sort_order) VALUES (?, ?, ?, 0, ?)",
        [id, taskId, text, sortOrder],
      );
      return { id, taskId, text, done: false, sortOrder };
    },

    async setDone(id: string, done: boolean): Promise<void> {
      await db.execute("UPDATE task_criteria SET done = ? WHERE id = ?", [
        boolToInt(done),
        id,
      ]);
    },

    async updateText(id: string, text: string): Promise<void> {
      await db.execute("UPDATE task_criteria SET text = ? WHERE id = ?", [text, id]);
    },

    async remove(id: string): Promise<void> {
      await db.execute("DELETE FROM task_criteria WHERE id = ?", [id]);
    },
  };
}

export type CriteriaRepo = ReturnType<typeof createCriteriaRepo>;
