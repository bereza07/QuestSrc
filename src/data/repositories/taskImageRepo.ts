import type { Database } from "@/data/db";
import { newId } from "@/data/db";

export interface TaskImage {
  id: string;
  taskId: string;
  kind: "DATA" | "URL";
  /** The image src — data: URL (pasted/uploaded) or https:// URL (linked). */
  url: string;
  createdAt: string;
}

interface Row {
  id: string;
  task_id: string;
  kind: "DATA" | "URL";
  data: string;
  created_at: string;
}

const map = (r: Row): TaskImage => ({
  id: r.id,
  taskId: r.task_id,
  kind: r.kind,
  url: r.data,
  createdAt: r.created_at,
});

export function createTaskImageRepo(db: Database) {
  return {
    async listForTask(taskId: string): Promise<TaskImage[]> {
      const rows = await db.select<Row>(
        "SELECT * FROM task_images WHERE task_id = ? ORDER BY created_at, id",
        [taskId],
      );
      return rows.map(map);
    },

    /**
     * Add an image. Infers kind from the URL: a data: URL becomes DATA, an
     * http(s) URL becomes URL. Any other string is rejected as invalid.
     */
    async add(taskId: string, url: string): Promise<TaskImage> {
      const kind: "DATA" | "URL" = url.startsWith("data:") ? "DATA" : "URL";
      if (kind === "URL" && !/^https?:\/\//i.test(url)) {
        throw new Error("Invalid image URL");
      }
      const id = newId();
      const createdAt = new Date().toISOString();
      await db.execute(
        "INSERT INTO task_images (id, task_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?)",
        [id, taskId, kind, url, createdAt],
      );
      return { id, taskId, kind, url, createdAt };
    },

    async remove(id: string): Promise<void> {
      await db.execute("DELETE FROM task_images WHERE id = ?", [id]);
    },

    async removeAllForTask(taskId: string): Promise<void> {
      await db.execute("DELETE FROM task_images WHERE task_id = ?", [taskId]);
    },
  };
}

export type TaskImageRepo = ReturnType<typeof createTaskImageRepo>;
