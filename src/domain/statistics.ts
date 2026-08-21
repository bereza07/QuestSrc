// Pure statistics helpers (spec §34, feedback #7/#8/#14). No I/O — unit-tested.

import type { TaskStatus } from "@/types";
import { addDays, toDateKey } from "@/utils/date";

// How a planned quest turned out, for completion-rate reporting (#8):
//  - completed : done
//  - missed    : still open and its planned day is in the past (not rescheduled)
//  - cancelled : explicitly cancelled → EXCLUDED from completion rate
//  - pending   : open and planned today/future, or unscheduled → not yet due
export type TaskOutcome = "completed" | "missed" | "cancelled" | "pending";

export function classifyTask(
  task: { status: TaskStatus; plannedDate: string | null },
  today: string,
): TaskOutcome {
  if (task.status === "COMPLETED") return "completed";
  if (task.status === "CANCELLED") return "cancelled";
  if (task.plannedDate && task.plannedDate < today) return "missed";
  return "pending";
}

/**
 * Percentage the actual focused time was over (+) or under (−) the estimate.
 * null when there's no estimate or no logged focus time.
 */
export function estimateDeltaPct(
  estimatedMinutes: number | null | undefined,
  actualSeconds: number,
): number | null {
  if (!estimatedMinutes || estimatedMinutes <= 0) return null;
  if (!actualSeconds || actualSeconds <= 0) return null;
  const actualMinutes = actualSeconds / 60;
  return Math.round(((actualMinutes - estimatedMinutes) / estimatedMinutes) * 100);
}

export type StatPeriod = "week" | "month" | "all";

/** Monday-based start of the week containing `key`. */
export function startOfWeek(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // Mon=0
  return addDays(key, -dow);
}

/** Inclusive [from, to] date-key range for a period around an anchor day. */
export function rangeFor(
  period: StatPeriod,
  anchor: string,
): { from: string | null; to: string | null } {
  if (period === "all") return { from: null, to: null };
  if (period === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  const [y, m] = anchor.split("-").map(Number);
  return {
    from: toDateKey(new Date(y, m - 1, 1)),
    to: toDateKey(new Date(y, m, 0)), // day 0 of next month = last day of this
  };
}

/** All date keys from `from` to `to` inclusive. */
export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** True if a date key falls in [from, to], with open-ended nulls meaning ∞. */
export function inRange(key: string, from: string | null, to: string | null): boolean {
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}
