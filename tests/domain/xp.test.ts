import { describe, it, expect } from "vitest";
import {
  clampXpToBand,
  normalizeStatRewards,
  totalXpFromRewards,
  XP_BANDS,
} from "@/domain/xp";

describe("xp economy", () => {
  it("clamps XP into the difficulty band", () => {
    expect(clampXpToBand(1000, "EASY")).toBe(XP_BANDS.EASY.max);
    expect(clampXpToBand(1, "EASY")).toBe(XP_BANDS.EASY.min);
    expect(clampXpToBand(18, "EASY")).toBe(18);
  });

  it("sums rewards ignoring non-positive values", () => {
    expect(
      totalXpFromRewards([
        { statId: "a", xp: 20 },
        { statId: "b", xp: 0 },
        { statId: "c", xp: -5 },
      ]),
    ).toBe(20);
  });

  it("drops non-positive rewards on normalize", () => {
    const out = normalizeStatRewards(
      [
        { statId: "a", xp: 10 },
        { statId: "b", xp: 0 },
      ],
      "MEDIUM",
    );
    expect(out).toHaveLength(1);
    expect(out[0].statId).toBe("a");
  });

  it("scales rewards down so the total never exceeds the band max", () => {
    // MEDIUM max is 60; propose 100 total across two stats.
    const out = normalizeStatRewards(
      [
        { statId: "a", xp: 60 },
        { statId: "b", xp: 40 },
      ],
      "MEDIUM",
    );
    expect(totalXpFromRewards(out)).toBeLessThanOrEqual(XP_BANDS.MEDIUM.max);
    // proportions roughly preserved, each at least 1
    expect(out.every((r) => r.xp >= 1)).toBe(true);
  });

  it("does not inflate rewards that are below the band minimum", () => {
    const out = normalizeStatRewards([{ statId: "a", xp: 3 }], "HARD");
    expect(out[0].xp).toBe(3);
  });
});
