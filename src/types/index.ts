// Shared domain types for QuestForge.
// These describe the shape of data as it flows between layers. The `data`
// layer maps SQLite rows to these; services and UI consume them.

export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export const TASK_STATUSES: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export const TASK_PRIORITIES: TaskPriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "CRITICAL",
];

export type Difficulty = "TRIVIAL" | "EASY" | "MEDIUM" | "HARD" | "EPIC";
export const DIFFICULTIES: Difficulty[] = [
  "TRIVIAL",
  "EASY",
  "MEDIUM",
  "HARD",
  "EPIC",
];

/** XP awarded to a specific stat when a task is completed. */
export interface StatReward {
  statId: string;
  statName?: string; // convenience for UI, not persisted here
  xp: number;
}

export interface Character {
  id: string;
  name: string;
  characterClass: string | null;
  level: number;
  currentXp: number; // XP into the current level
  totalXp: number; // lifetime XP earned
  avatar: string | null; // optional data-URL portrait
  createdAt: string; // ISO
}

export interface Stat {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  level: number;
  currentXp: number; // XP into the current stat level
  totalXp: number; // lifetime XP for this stat
  archived: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  difficulty: Difficulty;
  estimatedMinutes: number | null;
  plannedDate: string | null; // YYYY-MM-DD
  deadline: string | null; // YYYY-MM-DD
  xpReward: number; // = sum of statRewards
  parentTaskId: string | null;
  goalId: string | null;
  projectId: string | null;
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
  statRewards: StatReward[];
}

/** Payload for creating a task; most fields optional with sensible defaults. */
export interface NewTask {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  difficulty?: Difficulty;
  estimatedMinutes?: number | null;
  plannedDate?: string | null;
  deadline?: string | null;
  parentTaskId?: string | null;
  goalId?: string | null;
  projectId?: string | null;
  statRewards?: StatReward[];
}

/** Editable task fields (matches taskRepo.update). */
export interface TaskUpdateFields {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  difficulty?: Difficulty;
  estimatedMinutes?: number | null;
  plannedDate?: string | null;
  deadline?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  sortOrder?: number;
}

export type XpTransactionKind =
  | "TASK_COMPLETION"
  | "MANUAL"
  | "ACHIEVEMENT"
  | "FOCUS_BONUS";

export interface XpTransaction {
  id: string;
  taskId: string | null;
  statId: string | null;
  kind: XpTransactionKind;
  amount: number;
  reason: string;
  createdAt: string;
}

export type TimerMode = "STOPWATCH" | "POMODORO" | "COUNTDOWN";
export type ProgressRating = "NONE" | "SOME" | "COMPLETED";

export interface WorkSession {
  id: string;
  taskId: string | null;
  projectId: string | null;
  mode: TimerMode;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  completedNormally: boolean;
  progressRating: ProgressRating | null;
  difficultyRating: number | null;
  createdAt: string;
}

/** The single persisted active-timer row, if any. */
export interface ActiveTimer {
  taskId: string | null;
  projectId: string | null;
  mode: TimerMode;
  targetSeconds: number | null;
  startedAt: string;
  accumulatedSeconds: number;
  isPaused: boolean;
  updatedAt: string;
}

/** Result returned when a task is completed, so the UI can show feedback. */
export interface CompletionResult {
  awarded: boolean; // false if already completed (idempotent no-op)
  task: Task;
  statXp: { statId: string; statName: string; amount: number }[];
  totalXp: number;
  characterLeveledUp: boolean;
  characterNewLevel: number;
  statLevelUps: { statId: string; statName: string; newLevel: number }[];
}
