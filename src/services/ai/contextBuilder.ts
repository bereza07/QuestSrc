import type { Repositories } from "@/data/repositories";
import {
  getDailyGoal,
  getWorkDays,
  buildIsRestDay,
} from "@/services/streak/streakService";
import { todayKey, addDays } from "@/utils/date";

// Builds a COMPACT context for the AI — only what's relevant, never the whole DB
// (spec §24, §63). Entities include ids so the AI can reference them in actions.

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekdayMondayBased(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7; // Mon=0 … Sun=6
}

export interface AIContext {
  /** The compact CONTEXT JSON — data the AI reads to plan. */
  contextJson: string;
  /** Rendered "RULES" preamble the user has set. Empty string if none. */
  rulesBlock: string;
}

export async function buildAIContext(repos: Repositories): Promise<AIContext> {
  const today = todayKey();
  const [character, stats, goals, projects, activeTasks, streak, goal, workDays, isRestDay, rules] =
    await Promise.all([
      repos.character.get(),
      repos.stats.list(false),
      repos.goals.list(),
      repos.projects.list(),
      repos.tasks.list({ status: ["TODO", "IN_PROGRESS"] }),
      repos.activity.getStreak(),
      getDailyGoal(repos),
      getWorkDays(repos),
      buildIsRestDay(repos),
      repos.aiRules.list(),
    ]);

  const restWeekdays = WEEKDAY_NAMES.filter((_, i) => !workDays.has(i));

  // How much is ALREADY planned on each day (sum of estimates), so the AI can
  // see existing load and avoid overloading a day (#8).
  const loadByDate = new Map<string, { minutes: number; count: number }>();
  for (const task of activeTasks) {
    if (!task.plannedDate) continue;
    const cur = loadByDate.get(task.plannedDate) ?? { minutes: 0, count: 0 };
    cur.minutes += task.estimatedMinutes ?? 0;
    cur.count += 1;
    loadByDate.set(task.plannedDate, cur);
  }

  // A concrete 14-day calendar with work/rest flags + existing load. The AI
  // schedules by PICKING from here instead of doing date math, so it never lands
  // a task on a day off and can spread work by looking at plannedMinutes.
  const upcomingDays = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i);
    const load = loadByDate.get(date) ?? { minutes: 0, count: 0 };
    return {
      date,
      weekday: WEEKDAY_NAMES[weekdayMondayBased(date)],
      isRestDay: isRestDay(date),
      plannedMinutes: load.minutes,
      plannedTasks: load.count,
    };
  });

  const ctx = {
    today,
    character: character && {
      name: character.name,
      class: character.characterClass,
      level: character.level,
      totalXp: character.totalXp,
    },
    // NOTE for the model: this is the MINIMUM to keep a streak, NOT a daily cap.
    dailyMinimum: { mode: goal.mode, value: goal.value },
    workingWeekdays: WEEKDAY_NAMES.filter((_, i) => workDays.has(i)),
    restWeekdays,
    upcomingDays,
    streak: { current: streak.current, longest: streak.longest },
    stats: stats.map((s) => ({ name: s.name, level: s.level })),
    projects: projects.map((p) => ({ id: p.id, name: p.name, description: p.description })),
    goals: goals.map((g) => ({
      id: g.id,
      title: g.title,
      isMainQuest: g.isMainQuest,
      deadline: g.deadline,
    })),
    // Cap the task list so the prompt stays small.
    activeTasks: activeTasks.slice(0, 40).map((t) => ({
      id: t.id,
      title: t.title,
      difficulty: t.difficulty,
      plannedDate: t.plannedDate,
      estimatedMinutes: t.estimatedMinutes,
      projectId: t.projectId,
      goalId: t.goalId,
    })),
  };

  const rulesBlock = rules.length
    ? "USER RULES (obey these ABOVE all other guidance — the user set them explicitly).\n" +
      "To edit/delete an existing rule, use its id via UPDATE_RULE / DELETE_RULE:\n" +
      rules.map((r) => `- [${r.id}] ${r.text}`).join("\n")
    : "(no user rules yet — if the user asks to remember a preference, propose CREATE_RULE.)";

  return {
    contextJson: `CONTEXT (JSON):\n${JSON.stringify(ctx)}`,
    rulesBlock,
  };
}
