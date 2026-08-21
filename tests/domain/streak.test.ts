import { describe, it, expect } from "vitest";
import {
  computeCurrentStreak,
  computeLongestStreak,
  goalMet,
  parseWorkDays,
  weekdayMondayBased,
} from "@/domain/streak";
import { addDays } from "@/utils/date";

const TODAY = "2026-08-12";
const noRest = () => false;
function daysBack(n: number): string {
  return addDays(TODAY, -n);
}

describe("goalMet", () => {
  it("TIME goal met by focused seconds", () => {
    expect(goalMet({ mode: "TIME", value: 20 }, 20 * 60, 0)).toBe(true);
    expect(goalMet({ mode: "TIME", value: 20 }, 19 * 60, 0)).toBe(false);
  });
  it("XP goal met by xp earned", () => {
    expect(goalMet({ mode: "XP", value: 50 }, 0, 50)).toBe(true);
    expect(goalMet({ mode: "XP", value: 50 }, 0, 49)).toBe(false);
  });
});

describe("computeCurrentStreak", () => {
  it("counts consecutive met days including today", () => {
    const met = new Set([daysBack(0), daysBack(1), daysBack(2)]);
    expect(computeCurrentStreak({ today: TODAY, metDates: met, isRestDay: noRest, freezeBudget: 0 }).current).toBe(3);
  });

  it("does not break when today is not yet met", () => {
    const met = new Set([daysBack(1), daysBack(2)]);
    expect(computeCurrentStreak({ today: TODAY, metDates: met, isRestDay: noRest, freezeBudget: 0 }).current).toBe(2);
  });

  it("breaks on an unmet, non-rest, unprotected day", () => {
    const met = new Set([daysBack(0), daysBack(1), daysBack(3)]); // gap at day 2
    expect(computeCurrentStreak({ today: TODAY, metDates: met, isRestDay: noRest, freezeBudget: 0 }).current).toBe(2);
  });

  it("rest days neither count nor break", () => {
    const met = new Set([daysBack(0), daysBack(2)]); // day 1 missed but is rest
    const isRest = (d: string) => d === daysBack(1);
    expect(computeCurrentStreak({ today: TODAY, metDates: met, isRestDay: isRest, freezeBudget: 0 }).current).toBe(2);
  });

  it("freeze budget bridges a missed day", () => {
    const met = new Set([daysBack(0), daysBack(2)]); // gap at day 1
    const r = computeCurrentStreak({ today: TODAY, metDates: met, isRestDay: noRest, freezeBudget: 1 });
    expect(r.current).toBe(2);
    expect(r.freezesUsed).toBe(1);
  });

  it("empty history is zero", () => {
    expect(computeCurrentStreak({ today: TODAY, metDates: new Set(), isRestDay: noRest, freezeBudget: 0 }).current).toBe(0);
  });
});

describe("computeLongestStreak", () => {
  it("finds the longest run", () => {
    const met = new Set([
      "2026-08-01", "2026-08-02", "2026-08-03", // run of 3
      "2026-08-10", "2026-08-11", // run of 2
    ]);
    expect(computeLongestStreak(met, noRest)).toBe(3);
  });
});

describe("work days", () => {
  it("weekdayMondayBased: 2026-08-12 is a Wednesday (2)", () => {
    expect(weekdayMondayBased("2026-08-12")).toBe(2);
  });
  it("parseWorkDays defaults to every day when empty", () => {
    expect(parseWorkDays(null).size).toBe(7);
  });
  it("parseWorkDays parses a CSV", () => {
    expect([...parseWorkDays("0,1,2,3,4")]).toEqual([0, 1, 2, 3, 4]);
  });
});
