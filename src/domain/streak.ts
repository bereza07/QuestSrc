// Pure streak logic — no I/O, fully unit-tested.
//
// Philosophy (spec §21, §36): supportive, not punitive.
//  - A day counts toward the streak if the daily goal was met.
//  - Rest days never break the streak and never need to be "met".
//  - A limited freeze budget can bridge a small number of missed non-rest days.
//  - Today not being met yet does NOT break the streak — the day isn't over.

import { addDays, todayKey } from "@/utils/date";

export interface DailyGoal {
  mode: "TIME" | "XP";
  /** minutes (TIME) or XP points (XP). */
  value: number;
}

export const DEFAULT_DAILY_GOAL: DailyGoal = { mode: "TIME", value: 20 };

/** Did a day's activity meet the goal? */
export function goalMet(
  goal: DailyGoal,
  focusedSeconds: number,
  xpEarned: number,
): boolean {
  if (goal.mode === "TIME") return focusedSeconds >= goal.value * 60;
  return xpEarned >= goal.value;
}

export interface StreakInputs {
  today: string;
  /** Dates (YYYY-MM-DD) whose daily goal was met. */
  metDates: Set<string>;
  /** True if a date is a rest day (recurring or one-off). */
  isRestDay: (date: string) => boolean;
  /** Max number of missed non-rest days the freeze budget can bridge. */
  freezeBudget: number;
  /** Safety bound on how far back to walk. */
  maxLookback?: number;
}

export interface StreakResult {
  current: number;
  freezesUsed: number;
}

/**
 * Walk backwards from today counting consecutive met days, skipping rest days
 * and bridging up to `freezeBudget` missed days.
 */
export function computeCurrentStreak(input: StreakInputs): StreakResult {
  const { today, metDates, isRestDay, freezeBudget } = input;
  const maxLookback = input.maxLookback ?? 1000;

  let streak = 0;
  let freezesUsed = 0;
  let cursor = today;

  // Today: count it if met; if not met, it's simply neutral (day isn't over).
  if (metDates.has(today)) streak++;
  cursor = addDays(cursor, -1);

  for (let i = 0; i < maxLookback; i++) {
    if (metDates.has(cursor)) {
      streak++;
    } else if (isRestDay(cursor)) {
      // neutral — neither counts nor breaks
    } else if (freezesUsed < freezeBudget) {
      freezesUsed++; // bridge this missed day
    } else {
      break;
    }
    cursor = addDays(cursor, -1);
  }

  return { current: streak, freezesUsed };
}

/** Longest run of met/rest/bridged days across a set of dates, ending anywhere. */
export function computeLongestStreak(
  metDates: Set<string>,
  isRestDay: (date: string) => boolean,
): number {
  if (metDates.size === 0) return 0;
  const sorted = [...metDates].sort();
  let longest = 0;
  for (const end of sorted) {
    const { current } = computeCurrentStreak({
      today: end,
      metDates,
      isRestDay,
      freezeBudget: 0,
    });
    longest = Math.max(longest, current);
  }
  return longest;
}

/** Weekday helper: 0=Mon … 6=Sun for a date key. */
export function weekdayMondayBased(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

/** Parse a work-days CSV like "0,1,2,3,4" (Mon-based) into a Set. */
export function parseWorkDays(csv: string | undefined | null): Set<number> {
  if (!csv) return new Set([0, 1, 2, 3, 4, 5, 6]);
  return new Set(
    csv
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
  );
}

export { todayKey };
