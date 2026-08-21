import type { Character } from "@/types";
import type { Database } from "@/data/db";
import { newId } from "@/data/db";

interface CharacterRow {
  id: string;
  name: string;
  character_class: string | null;
  level: number;
  current_xp: number;
  total_xp: number;
  avatar: string | null;
  created_at: string;
}

function mapCharacter(r: CharacterRow): Character {
  return {
    id: r.id,
    name: r.name,
    characterClass: r.character_class,
    level: r.level,
    currentXp: r.current_xp,
    totalXp: r.total_xp,
    avatar: r.avatar ?? null,
    createdAt: r.created_at,
  };
}

// There is exactly one character (single-user app).
export function createCharacterRepo(db: Database) {
  return {
    async get(): Promise<Character | null> {
      const rows = await db.select<CharacterRow>(
        "SELECT * FROM character LIMIT 1",
      );
      return rows[0] ? mapCharacter(rows[0]) : null;
    },

    async create(name: string, characterClass: string | null): Promise<Character> {
      const id = newId();
      const createdAt = new Date().toISOString();
      await db.execute(
        `INSERT INTO character (id, name, character_class, level, current_xp, total_xp, created_at)
         VALUES (?, ?, ?, 1, 0, 0, ?)`,
        [id, name, characterClass, createdAt],
      );
      return {
        id,
        name,
        characterClass,
        level: 1,
        currentXp: 0,
        totalXp: 0,
        avatar: null,
        createdAt,
      };
    },

    async setAvatar(id: string, avatar: string | null): Promise<void> {
      await db.execute("UPDATE character SET avatar = ? WHERE id = ?", [avatar, id]);
    },

    /** Update the cached level/xp fields (recomputed from the XP ledger). */
    async updateProgress(
      id: string,
      level: number,
      currentXp: number,
      totalXp: number,
    ): Promise<void> {
      await db.execute(
        "UPDATE character SET level = ?, current_xp = ?, total_xp = ? WHERE id = ?",
        [level, currentXp, totalXp, id],
      );
    },
  };
}

export type CharacterRepo = ReturnType<typeof createCharacterRepo>;
