import type { Stat } from "@/types";
import type { Database } from "@/data/db";
import { newId, boolToInt, intToBool } from "@/data/db";

interface StatRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  level: number;
  current_xp: number;
  total_xp: number;
  archived: number;
  sort_order: number;
  created_at: string;
}

function mapStat(r: StatRow): Stat {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    icon: r.icon,
    level: r.level,
    currentXp: r.current_xp,
    totalXp: r.total_xp,
    archived: intToBool(r.archived),
    createdAt: r.created_at,
  };
}

export interface NewStat {
  name: string;
  description?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export function createStatRepo(db: Database) {
  return {
    async list(includeArchived = false): Promise<Stat[]> {
      const sql = includeArchived
        ? "SELECT * FROM stats ORDER BY sort_order, name"
        : "SELECT * FROM stats WHERE archived = 0 ORDER BY sort_order, name";
      const rows = await db.select<StatRow>(sql);
      return rows.map(mapStat);
    },

    async getById(id: string): Promise<Stat | null> {
      const rows = await db.select<StatRow>("SELECT * FROM stats WHERE id = ?", [
        id,
      ]);
      return rows[0] ? mapStat(rows[0]) : null;
    },

    async findByName(name: string): Promise<Stat | null> {
      const rows = await db.select<StatRow>(
        "SELECT * FROM stats WHERE name = ? COLLATE NOCASE LIMIT 1",
        [name],
      );
      return rows[0] ? mapStat(rows[0]) : null;
    },

    async create(input: NewStat): Promise<Stat> {
      const id = newId();
      const createdAt = new Date().toISOString();
      await db.execute(
        `INSERT INTO stats (id, name, description, icon, level, current_xp, total_xp, archived, sort_order, created_at)
         VALUES (?, ?, ?, ?, 1, 0, 0, 0, ?, ?)`,
        [
          id,
          input.name,
          input.description ?? null,
          input.icon ?? null,
          input.sortOrder ?? 0,
          createdAt,
        ],
      );
      return {
        id,
        name: input.name,
        description: input.description ?? null,
        icon: input.icon ?? null,
        level: 1,
        currentXp: 0,
        totalXp: 0,
        archived: false,
        createdAt,
      };
    },

    async updateProgress(
      id: string,
      level: number,
      currentXp: number,
      totalXp: number,
    ): Promise<void> {
      await db.execute(
        "UPDATE stats SET level = ?, current_xp = ?, total_xp = ? WHERE id = ?",
        [level, currentXp, totalXp, id],
      );
    },

    async setArchived(id: string, archived: boolean): Promise<void> {
      await db.execute("UPDATE stats SET archived = ? WHERE id = ?", [
        boolToInt(archived),
        id,
      ]);
    },
  };
}

export type StatRepo = ReturnType<typeof createStatRepo>;
