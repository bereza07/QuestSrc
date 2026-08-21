import type { Database } from "@/data/db";
import { newId, boolToInt, intToBool } from "@/data/db";

export interface Project {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  archived: boolean;
  createdAt: string;
}

interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  archived: number;
  created_at: string;
}

function mapProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    description: r.description,
    archived: intToBool(r.archived),
    createdAt: r.created_at,
  };
}

export interface NewProject {
  name: string;
  color?: string | null;
  description?: string | null;
}

export function createProjectRepo(db: Database) {
  return {
    async create(input: NewProject): Promise<Project> {
      const id = newId();
      const createdAt = new Date().toISOString();
      await db.execute(
        `INSERT INTO projects (id, name, color, description, archived, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
        [id, input.name, input.color ?? null, input.description ?? null, createdAt],
      );
      return {
        id,
        name: input.name,
        color: input.color ?? null,
        description: input.description ?? null,
        archived: false,
        createdAt,
      };
    },

    async list(includeArchived = false): Promise<Project[]> {
      const rows = await db.select<ProjectRow>(
        `SELECT * FROM projects${includeArchived ? "" : " WHERE archived = 0"}
         ORDER BY created_at`,
      );
      return rows.map(mapProject);
    },

    async update(
      id: string,
      fields: Partial<{ name: string; color: string | null; description: string | null; archived: boolean }>,
    ): Promise<void> {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (fields.name !== undefined) {
        sets.push("name = ?");
        params.push(fields.name);
      }
      if (fields.color !== undefined) {
        sets.push("color = ?");
        params.push(fields.color);
      }
      if (fields.description !== undefined) {
        sets.push("description = ?");
        params.push(fields.description);
      }
      if (fields.archived !== undefined) {
        sets.push("archived = ?");
        params.push(boolToInt(fields.archived));
      }
      if (sets.length === 0) return;
      params.push(id);
      await db.execute(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, params);
    },

    async delete(id: string): Promise<void> {
      // tasks.project_id / goals.project_id are ON DELETE SET NULL.
      await db.execute("DELETE FROM projects WHERE id = ?", [id]);
    },
  };
}

export type ProjectRepo = ReturnType<typeof createProjectRepo>;
