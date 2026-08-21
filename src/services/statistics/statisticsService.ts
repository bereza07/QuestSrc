import type { Repositories } from "@/data/repositories";
import type { ProgressRating, Task } from "@/types";
import { getWorkDays } from "@/services/streak/streakService";
import { toDateKey, todayKey, addDays } from "@/utils/date";
import {
  classifyTask,
  datesInRange,
  estimateDeltaPct,
  inRange,
  rangeFor,
  type StatPeriod,
} from "@/domain/statistics";

export interface StatFilter {
  period: StatPeriod;
  anchor: string;
  projectId: string | null;
  goalId: string | null;
}

export interface StatisticsResult {
  focusedSeconds: number;
  focusByDay: { date: string; seconds: number }[];
  avgPerWorkingDaySeconds: number;
  workingDaysCount: number;
  completed: number;
  missed: number;
  cancelled: number;
  pending: number;
  completionRate: number | null;
  estimate: {
    count: number;
    avgDeltaPct: number | null;
    over: number;
    under: number;
    accurate: number;
  };
  sessions: {
    count: number;
    avgSeconds: number;
    longestSeconds: number;
    progress: Record<ProgressRating, number>;
    avgDifficulty: number | null;
  };
  focusByProject: { projectId: string | null; name: string; seconds: number }[];
}

const CHART_WINDOW_ALL = 30; // days of daily chart when period = "all"

export async function computeStatistics(
  repos: Repositories,
  filter: StatFilter,
): Promise<StatisticsResult> {
  const today = todayKey();
  const { from, to } = rangeFor(filter.period, filter.anchor);

  const [allTasks, sessions, workDays, restDays, projects] = await Promise.all([
    repos.tasks.list({
      status: ["TODO", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      includeCompleted: true,
    }),
    repos.workSessions.list(from ? { since: `${from}T00:00:00.000Z` } : {}),
    getWorkDays(repos),
    repos.activity.listRestDays(),
    repos.projects.list(),
  ]);

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const taskById = new Map(allTasks.map((t) => [t.id, t]));

  // ---- Completion / lifecycle (#8): top-level quests only ----
  const relevant = allTasks.filter((t) => {
    if (t.parentTaskId) return false;
    if (filter.projectId && t.projectId !== filter.projectId) return false;
    if (filter.goalId && t.goalId !== filter.goalId) return false;
    // week/month: only quests planned within the range.
    if (from && to) return t.plannedDate != null && inRange(t.plannedDate, from, to);
    return true;
  });

  let completed = 0;
  let missed = 0;
  let cancelled = 0;
  let pending = 0;
  for (const task of relevant) {
    switch (classifyTask(task, today)) {
      case "completed": completed++; break;
      case "missed": missed++; break;
      case "cancelled": cancelled++; break;
      default: pending++;
    }
  }
  const decided = completed + missed;
  const completionRate = decided > 0 ? Math.round((completed / decided) * 100) : null;

  // ---- Estimate accuracy (#7): completed quests with an estimate + focus ----
  const est = { count: 0, sum: 0, over: 0, under: 0, accurate: 0 };
  for (const task of relevant.filter((t) => t.status === "COMPLETED")) {
    const actual = await repos.workSessions.focusedSecondsForTask(task.id);
    const delta = estimateDeltaPct(task.estimatedMinutes, actual);
    if (delta == null) continue;
    est.count++;
    est.sum += delta;
    if (delta > 10) est.over++;
    else if (delta < -10) est.under++;
    else est.accurate++;
  }

  // ---- Focus sessions (#7 + #14 questionnaire data) ----
  const inSession = (s: (typeof sessions)[number]) => {
    const dateKey = toDateKey(new Date(s.startedAt));
    if (from && to && !inRange(dateKey, from, to)) return false;
    if (filter.projectId && s.projectId !== filter.projectId) return false;
    if (filter.goalId) {
      const owner = s.taskId ? taskById.get(s.taskId) : undefined;
      if (!owner || owner.goalId !== filter.goalId) return false;
    }
    return true;
  };
  const fsessions = sessions.filter(inSession);

  const focusedSeconds = fsessions.reduce((a, s) => a + s.durationSeconds, 0);
  const longestSeconds = fsessions.reduce((a, s) => Math.max(a, s.durationSeconds), 0);
  const progress: Record<ProgressRating, number> = { NONE: 0, SOME: 0, COMPLETED: 0 };
  let diffSum = 0;
  let diffCount = 0;
  for (const s of fsessions) {
    if (s.progressRating) progress[s.progressRating]++;
    if (s.difficultyRating != null) {
      diffSum += s.difficultyRating;
      diffCount++;
    }
  }

  // Focus by day (for the chart) + focus by project.
  const perDay = new Map<string, number>();
  for (const s of fsessions) {
    const k = toDateKey(new Date(s.startedAt));
    perDay.set(k, (perDay.get(k) ?? 0) + s.durationSeconds);
  }
  const chartDays =
    from && to
      ? datesInRange(from, to)
      : datesInRange(addDays(today, -(CHART_WINDOW_ALL - 1)), today);
  const focusByDay = chartDays.map((date) => ({ date, seconds: perDay.get(date) ?? 0 }));

  const perProject = new Map<string | null, number>();
  for (const s of fsessions) {
    perProject.set(s.projectId, (perProject.get(s.projectId) ?? 0) + s.durationSeconds);
  }
  const focusByProject = [...perProject.entries()]
    .map(([projectId, seconds]) => ({
      projectId,
      name: projectId ? (projectName.get(projectId) ?? "—") : "—",
      seconds,
    }))
    .sort((a, b) => b.seconds - a.seconds);

  // ---- Average per WORKING day (exclude weekends & rest days) (#7) ----
  const restSet = new Set(restDays);
  const workingDays = chartDays.filter((d) => {
    if (d > today) return false; // don't average against the future
    if (restSet.has(d)) return false;
    const [y, m, dd] = d.split("-").map(Number);
    const dow = (new Date(y, m - 1, dd).getDay() + 6) % 7; // Mon=0
    return workDays.has(dow);
  });
  const avgPerWorkingDaySeconds =
    workingDays.length > 0 ? Math.round(focusedSeconds / workingDays.length) : 0;

  return {
    focusedSeconds,
    focusByDay,
    avgPerWorkingDaySeconds,
    workingDaysCount: workingDays.length,
    completed,
    missed,
    cancelled,
    pending,
    completionRate,
    estimate: {
      count: est.count,
      avgDeltaPct: est.count > 0 ? Math.round(est.sum / est.count) : null,
      over: est.over,
      under: est.under,
      accurate: est.accurate,
    },
    sessions: {
      count: fsessions.length,
      avgSeconds: fsessions.length ? Math.round(focusedSeconds / fsessions.length) : 0,
      longestSeconds,
      progress,
      avgDifficulty: diffCount > 0 ? Math.round((diffSum / diffCount) * 10) / 10 : null,
    },
    focusByProject,
  };
}

/** Open quests whose planned day is in the past — the "missed/overdue" list (#8). */
export function overdueTasks(tasks: Task[], today = todayKey()): Task[] {
  return tasks.filter(
    (t) =>
      !t.parentTaskId &&
      (t.status === "TODO" || t.status === "IN_PROGRESS") &&
      t.plannedDate != null &&
      t.plannedDate < today,
  );
}
