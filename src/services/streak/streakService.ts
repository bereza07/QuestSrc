import type { Repositories } from "@/data/repositories";
import {
  computeCurrentStreak,
  computeLongestStreak,
  goalMet as goalMetFn,
  parseWorkDays,
  weekdayMondayBased,
  type DailyGoal,
  DEFAULT_DAILY_GOAL,
} from "@/domain/streak";
import { todayKey } from "@/utils/date";

const SETTING_MODE = "goal.mode";
const SETTING_VALUE = "goal.value";
const SETTING_WORKDAYS = "goal.workdays";

function startOfDayIso(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toISOString();
}

export async function getDailyGoal(repos: Repositories): Promise<DailyGoal> {
  const all = await repos.settings.getAll();
  const mode = all[SETTING_MODE] === "XP" ? "XP" : "TIME";
  const value = Number(all[SETTING_VALUE]);
  return {
    mode,
    value: Number.isFinite(value) && value > 0 ? value : DEFAULT_DAILY_GOAL.value,
  };
}

export async function setDailyGoal(repos: Repositories, goal: DailyGoal): Promise<void> {
  await repos.settings.set(SETTING_MODE, goal.mode);
  await repos.settings.set(SETTING_VALUE, String(goal.value));
}

export async function getWorkDays(repos: Repositories): Promise<Set<number>> {
  const all = await repos.settings.getAll();
  return parseWorkDays(all[SETTING_WORKDAYS]);
}

export async function setWorkDays(repos: Repositories, days: Set<number>): Promise<void> {
  await repos.settings.set(SETTING_WORKDAYS, [...days].sort().join(","));
}

/** Build an isRestDay predicate from recurring work-days + one-off rest days. */
export async function buildIsRestDay(repos: Repositories): Promise<(d: string) => boolean> {
  const workDays = await getWorkDays(repos);
  const oneOff = new Set(await repos.activity.listRestDays());
  return (date: string) =>
    oneOff.has(date) || !workDays.has(weekdayMondayBased(date));
}

/**
 * Recompute today's activity row from the ledgers, then recompute the streak.
 * Safe to call after any XP/focus change.
 */
export async function refreshStreak(repos: Repositories): Promise<StreakSummary> {
  const today = todayKey();
  const goal = await getDailyGoal(repos);
  const sinceIso = startOfDayIso(today);

  const [focusedSeconds, xpEarned, isRestDay] = await Promise.all([
    repos.workSessions.focusedSecondsSince(sinceIso),
    repos.xp.sumSince(sinceIso),
    buildIsRestDay(repos),
  ]);

  const todayTasks = await repos.tasks.list({
    plannedDate: today,
    includeCompleted: true,
  });
  const tasksCompleted = todayTasks.filter((t) => t.status === "COMPLETED").length;

  const met = goalMetFn(goal, focusedSeconds, xpEarned);
  await repos.activity.upsertDay({
    date: today,
    focusedSeconds,
    xpEarned,
    tasksCompleted,
    goalMet: met,
    isRestDay: isRestDay(today),
  });

  const metDates = new Set(await repos.activity.listMetDates());
  const streakRow = await repos.activity.getStreak();
  const { current } = computeCurrentStreak({
    today,
    metDates,
    isRestDay,
    freezeBudget: streakRow.freezesRemaining,
  });
  const longest = Math.max(streakRow.longest, current, computeLongestStreak(metDates, isRestDay));
  await repos.activity.setStreak({ current, longest, lastActiveDate: met ? today : streakRow.lastActiveDate });

  return {
    current,
    longest,
    freezesRemaining: streakRow.freezesRemaining,
    focusedSeconds,
    xpEarned,
    tasksCompleted,
    goal,
    goalMet: met,
    isRestDay: isRestDay(today),
  };
}

export async function getStreakSummary(repos: Repositories): Promise<StreakSummary> {
  return refreshStreak(repos);
}

export async function toggleRestDay(
  repos: Repositories,
  date: string,
  rest: boolean,
): Promise<void> {
  await repos.activity.setRestDay(date, rest);
}

export interface StreakSummary {
  current: number;
  longest: number;
  freezesRemaining: number;
  focusedSeconds: number;
  xpEarned: number;
  tasksCompleted: number;
  goal: DailyGoal;
  goalMet: boolean;
  isRestDay: boolean;
}
