// XP economy rules (req #17). AI *proposes* XP; these functions *enforce*
// difficulty bands so the economy can't be broken ("fix a button = 1000 XP").

import type { Difficulty, StatReward } from "@/types";

export interface XpBand {
  min: number;
  max: number;
  /** A sensible default when only a difficulty is known. */
  suggested: number;
}

export const XP_BANDS: Record<Difficulty, XpBand> = {
  TRIVIAL: { min: 5, max: 10, suggested: 8 },
  EASY: { min: 10, max: 25, suggested: 18 },
  MEDIUM: { min: 25, max: 60, suggested: 40 },
  HARD: { min: 60, max: 120, suggested: 90 },
  EPIC: { min: 120, max: 300, suggested: 200 },
};

/** Clamp a single XP value into the band for a difficulty. */
export function clampXpToBand(xp: number, difficulty: Difficulty): number {
  const band = XP_BANDS[difficulty];
  const v = Math.round(xp);
  if (v < band.min) return band.min;
  if (v > band.max) return band.max;
  return v;
}

/** Total XP for a task = sum of its stat rewards (single source of truth). */
export function totalXpFromRewards(rewards: StatReward[]): number {
  return rewards.reduce((sum, r) => sum + Math.max(0, Math.round(r.xp)), 0);
}

/**
 * Validate & normalize a set of stat rewards against a difficulty band.
 * - drops non-positive rewards
 * - if the total exceeds the band max, scales rewards down proportionally
 * - if the total is below the band min, does NOT inflate (user may intend low)
 * Returns normalized rewards whose total is within [.. , band.max].
 */
export function normalizeStatRewards(
  rewards: StatReward[],
  difficulty: Difficulty,
): StatReward[] {
  const cleaned = rewards
    .map((r) => ({ ...r, xp: Math.round(r.xp) }))
    .filter((r) => r.xp > 0);
  if (cleaned.length === 0) return cleaned;

  const band = XP_BANDS[difficulty];
  const total = totalXpFromRewards(cleaned);
  if (total <= band.max) return cleaned;

  // Scale down proportionally, guaranteeing each stays >= 1.
  const scale = band.max / total;
  const scaled = cleaned.map((r) => ({
    ...r,
    xp: Math.max(1, Math.round(r.xp * scale)),
  }));
  // Re-trim if rounding pushed us back over the max.
  let over = totalXpFromRewards(scaled) - band.max;
  for (let i = 0; over > 0 && i < scaled.length; i++) {
    const reducible = scaled[i].xp - 1;
    const take = Math.min(reducible, over);
    scaled[i].xp -= take;
    over -= take;
  }
  return scaled;
}

/** Default reward suggestion for a difficulty against a single stat. */
export function defaultRewardForDifficulty(
  statId: string,
  difficulty: Difficulty,
): StatReward {
  return { statId, xp: XP_BANDS[difficulty].suggested };
}
