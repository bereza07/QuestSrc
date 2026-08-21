import type { Character } from "@/types";
import type { Repositories } from "@/data/repositories";

export interface StartingStatInput {
  name: string;
  description?: string | null;
  icon?: string | null;
}

export interface CreateCharacterInput {
  name: string;
  characterClass?: string | null;
  mainQuest?: string | null;
  startingStats: StartingStatInput[];
}

/**
 * First-run character creation: create the character, its starting stats, and
 * (optionally) the Main Quest goal. Skips duplicate stat names gracefully.
 */
export async function createCharacter(
  repos: Repositories,
  input: CreateCharacterInput,
): Promise<Character> {
  const name = input.name.trim();
  if (!name) throw new Error("Character name is required.");

  const existing = await repos.character.get();
  if (existing) throw new Error("A character already exists.");

  const character = await repos.character.create(
    name,
    input.characterClass?.trim() || null,
  );

  let order = 0;
  for (const stat of input.startingStats) {
    const statName = stat.name.trim();
    if (!statName) continue;
    const dupe = await repos.stats.findByName(statName);
    if (dupe) continue;
    await repos.stats.create({
      name: statName,
      description: stat.description ?? null,
      icon: stat.icon ?? null,
      sortOrder: order++,
    });
  }

  const mainQuest = input.mainQuest?.trim();
  if (mainQuest) {
    await repos.goals.create({ title: mainQuest, isMainQuest: true });
  }

  return character;
}

export function getCharacter(repos: Repositories): Promise<Character | null> {
  return repos.character.get();
}
