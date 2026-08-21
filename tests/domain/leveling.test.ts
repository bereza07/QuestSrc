import { describe, it, expect } from "vitest";
import {
  xpForLevel,
  cumulativeXpForLevel,
  levelFromTotalXp,
  levelProgressFraction,
  BASE_XP,
} from "@/domain/leveling";

describe("leveling", () => {
  it("level 1 -> 2 costs BASE_XP", () => {
    expect(xpForLevel(1)).toBe(BASE_XP);
  });

  it("xp per level increases with level", () => {
    expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(5));
  });

  it("guards level < 1", () => {
    expect(xpForLevel(0)).toBe(BASE_XP);
    expect(xpForLevel(-3)).toBe(BASE_XP);
  });

  it("cumulative XP is the running sum of per-level costs", () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(cumulativeXpForLevel(3)).toBe(xpForLevel(1) + xpForLevel(2));
  });

  it("levelFromTotalXp is the inverse of cumulative XP", () => {
    for (let level = 1; level <= 25; level++) {
      const atStart = cumulativeXpForLevel(level);
      expect(levelFromTotalXp(atStart).level).toBe(level);
      // One XP short of the next level stays on the same level.
      const beforeNext = cumulativeXpForLevel(level + 1) - 1;
      expect(levelFromTotalXp(beforeNext).level).toBe(level);
    }
  });

  it("computes progress within the current level", () => {
    const start = cumulativeXpForLevel(5);
    const p = levelFromTotalXp(start + 10);
    expect(p.level).toBe(5);
    expect(p.currentXp).toBe(10);
    expect(p.requiredXp).toBe(xpForLevel(5));
  });

  it("clamps negative total XP to level 1 / 0 progress", () => {
    const p = levelFromTotalXp(-500);
    expect(p.level).toBe(1);
    expect(p.currentXp).toBe(0);
    expect(levelProgressFraction(p)).toBe(0);
  });

  it("progress fraction is bounded to [0,1]", () => {
    const p = levelFromTotalXp(cumulativeXpForLevel(3) + xpForLevel(3) / 2);
    const f = levelProgressFraction(p);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
});
