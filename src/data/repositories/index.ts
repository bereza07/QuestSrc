import type { Database } from "@/data/db";
import { createSettingsRepo } from "./settingsRepo";
import { createCharacterRepo } from "./characterRepo";
import { createStatRepo } from "./statRepo";
import { createTaskRepo } from "./taskRepo";
import { createGoalRepo } from "./goalRepo";
import { createProjectRepo } from "./projectRepo";
import { createCriteriaRepo } from "./criteriaRepo";
import { createWorkSessionRepo } from "./workSessionRepo";
import { createActivityRepo } from "./activityRepo";
import { createChatRepo } from "./chatRepo";
import { createAchievementRepo } from "./achievementRepo";
import { createTaskImageRepo } from "./taskImageRepo";
import { createAIRuleRepo } from "./aiRuleRepo";
import { createXpRepo } from "./xpRepo";

/** Bundle every repository over a single Database connection. */
export function createRepositories(db: Database) {
  return {
    db,
    settings: createSettingsRepo(db),
    character: createCharacterRepo(db),
    stats: createStatRepo(db),
    tasks: createTaskRepo(db),
    goals: createGoalRepo(db),
    projects: createProjectRepo(db),
    criteria: createCriteriaRepo(db),
    workSessions: createWorkSessionRepo(db),
    activity: createActivityRepo(db),
    chat: createChatRepo(db),
    achievements: createAchievementRepo(db),
    taskImages: createTaskImageRepo(db),
    aiRules: createAIRuleRepo(db),
    xp: createXpRepo(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
