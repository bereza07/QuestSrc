import type { Stat, XpTransaction } from "@/types";
import type { Repositories } from "@/data/repositories";

export interface CreateStatInput {
  name: string;
  description?: string | null;
  icon?: string | null;
}

/** Soft cap: warn (don't block) once the user has this many active stats (req #8). */
export const STAT_SOFT_CAP = 12;

export function listStats(
  repos: Repositories,
  includeArchived = false,
): Promise<Stat[]> {
  return repos.stats.list(includeArchived);
}

export async function createStat(
  repos: Repositories,
  input: CreateStatInput,
): Promise<Stat> {
  const name = input.name.trim();
  if (!name) throw new Error("Stat name is required.");
  const existing = await repos.stats.findByName(name);
  if (existing) throw new Error(`A stat named "${name}" already exists.`);
  return repos.stats.create({
    name,
    description: input.description?.trim() || null,
    icon: input.icon ?? null,
    sortOrder: (await repos.stats.list(true)).length,
  });
}

export function recentStatXp(
  repos: Repositories,
  statId: string,
  limit = 10,
): Promise<XpTransaction[]> {
  return repos.xp.listForStat(statId, limit);
}

/** True once the active stat count reaches the soft cap (UX warning only). */
export async function isOverStatSoftCap(repos: Repositories): Promise<boolean> {
  const stats = await repos.stats.list(false);
  return stats.length >= STAT_SOFT_CAP;
}
