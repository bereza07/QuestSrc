import type { Difficulty, TaskPriority } from "./index";

// Structured actions the AI may propose. They are NEVER applied automatically —
// the UI shows a preview and the user must Confirm (spec §27, §50).
// The AI references existing entities by id (given in the context) and creates
// new ones by value. Stat rewards are given by stat *name* and resolved to ids.

export interface AIStatRewardByName {
  statName: string;
  xp: number;
}

export interface AICreateTask {
  type: "CREATE_TASK";
  title: string;
  description?: string | null;
  difficulty?: Difficulty;
  priority?: TaskPriority;
  estimatedMinutes?: number | null;
  plannedDate?: string | null;
  deadline?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  /** Real id of an existing task — makes this a sub-quest of it. */
  parentTaskId?: string | null;
  statRewards?: AIStatRewardByName[];
  definitionOfDone?: string[];
}

export interface AICreateGoal {
  type: "CREATE_GOAL";
  title: string;
  description?: string | null;
  deadline?: string | null;
  isMainQuest?: boolean;
  /** Real project id or "new:<slug>" placeholder matching a create_project call. */
  projectId?: string | null;
}

export interface AICreateProject {
  type: "CREATE_PROJECT";
  name: string;
  description?: string | null;
  color?: string | null;
}

export interface AICreateStat {
  type: "CREATE_STAT";
  name: string;
  description?: string | null;
  icon?: string | null;
}

export interface AIMoveTask {
  type: "MOVE_TASK";
  taskId: string;
  plannedDate: string | null;
}

export interface AIUpdateTask {
  type: "UPDATE_TASK";
  taskId: string;
  fields: {
    title?: string;
    description?: string | null;
    difficulty?: Difficulty;
    priority?: TaskPriority;
    estimatedMinutes?: number | null;
    plannedDate?: string | null;
    deadline?: string | null;
    /** Empty string means "detach"; may also be a "new:<slug>" placeholder. */
    goalId?: string | null;
    projectId?: string | null;
  };
}

export interface AICompleteTask {
  type: "COMPLETE_TASK";
  taskId: string;
}

export interface AIDeleteTask {
  type: "DELETE_TASK";
  taskId: string;
}

// A custom achievement the AI can propose based on the user's story/goals.
// Runtime-created achievements live alongside the built-in ones and can trigger
// automatically when the condition first becomes true.
export interface AICreateAchievement {
  type: "CREATE_ACHIEVEMENT";
  key: string; // stable slug, e.g. "first_boss_slain"
  name: string;
  description: string;
  icon?: string | null; // emoji
  condition: {
    /** Which metric to test — matches AchievementMetrics keys. */
    metric:
      | "completedCount"
      | "currentStreak"
      | "longestStreak"
      | "characterLevel"
      | "focusedSeconds";
    /** Threshold the metric must reach for the achievement to unlock. */
    atLeast: number;
  };
}

// AI-managed persistent rules. These are user-stated preferences ("don't plan more
// than 4h/day", "no work tasks on Sunday") that get injected into every future
// system prompt. The AI can propose add/update/delete; user confirms.
export interface AICreateRule {
  type: "CREATE_RULE";
  text: string;
}
export interface AIUpdateRule {
  type: "UPDATE_RULE";
  ruleId: string;
  text: string;
}
export interface AIDeleteRule {
  type: "DELETE_RULE";
  ruleId: string;
}

// A structured questionnaire the AI can render instead of asking in prose. The
// UI shows a proper form (radio / checkbox / free text) and posts the user's
// answers back as a normal message. This action is NEVER applied; it's a UI-only
// signal — treat it as an "ask" turn.
export interface AIAskChoices {
  type: "ASK_CHOICES";
  questions: {
    /** Short human prompt for this question. */
    prompt: string;
    /** Available choices. If empty, the question is free-text only. */
    options?: string[];
    /** True → checkboxes; false/undefined → single-select radio. */
    allowMultiple?: boolean;
    /** True → include an "Other…" free-text field. Default true. */
    allowCustom?: boolean;
  }[];
}

export type AIAction =
  | AICreateTask
  | AICreateGoal
  | AICreateProject
  | AICreateStat
  | AICreateAchievement
  | AICreateRule
  | AIAskChoices
  | AIUpdateRule
  | AIDeleteRule
  | AIMoveTask
  | AIUpdateTask
  | AICompleteTask
  | AIDeleteTask;

export type AIActionType = AIAction["type"];

/** A raw parsed model response before validation. */
export interface AIResponse {
  message: string;
  actions: AIAction[];
}

/** A validation note, localized in the UI by its `code`. */
export interface AIWarning {
  code: string;
  params?: Record<string, string | number>;
}

/** Result of validating/clamping a response's actions. */
export interface ValidatedActions {
  actions: AIAction[];
  warnings: AIWarning[];
}
