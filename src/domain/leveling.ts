// Pure leveling math. No I/O — fully unit-testable and the single source of
// truth for how XP maps to levels. UI and services must import from here
// rather than re-deriving the formula anywhere.

export const BASE_XP = 100;
export const LEVEL_EXPONENT = 1.5;

/**
 * XP required to advance FROM `level` to `level + 1`.
 * Formula: baseXP * level^1.5, rounded to a clean multiple of 5.
 * Level is 1-based; level 1 -> 2 costs `BASE_XP`.
 */
export function xpForLevel(level: number): number {
  if (level < 1) return BASE_XP;
  const raw = BASE_XP * Math.pow(level, LEVEL_EXPONENT);
  return Math.round(raw / 5) * 5;
}

/** Total cumulative XP needed to have reached the START of `level`. */
export function cumulativeXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}

export interface LevelProgress {
  level: number;
  currentXp: number; // XP into the current level
  requiredXp: number; // XP needed to finish the current level
  totalXp: number; // lifetime XP (echoed back)
}

/**
 * Given lifetime `totalXp`, compute current level and progress within it.
 * Guards against negative input (clamped to 0).
 */
export function levelFromTotalXp(totalXp: number): LevelProgress {
  const total = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let remaining = total;
  // Advance while we can afford the next level.
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return {
    level,
    currentXp: remaining,
    requiredXp: xpForLevel(level),
    totalXp: total,
  };
}

/** Fraction [0,1] of the current level completed — for progress bars. */
export function levelProgressFraction(p: LevelProgress): number {
  if (p.requiredXp <= 0) return 0;
  return Math.min(1, Math.max(0, p.currentXp / p.requiredXp));
}
