import { create } from "zustand";
import type { Character, NewTask, Stat, Task, XpTransaction } from "@/types";
import type { Repositories } from "@/data/repositories";
import type { Goal } from "@/data/repositories/goalRepo";
import type { Project } from "@/data/repositories/projectRepo";
import type { Difficulty, StatReward, TaskUpdateFields } from "@/types";
import { initAppDatabase } from "@/data";
import { initSecretStore } from "@/services/ai/secretStore";
import {
  createCharacter as svcCreateCharacter,
  type CreateCharacterInput,
} from "@/services/character/characterService";
import { createStat as svcCreateStat } from "@/services/character/statService";
import { resetProgress as svcResetProgress } from "@/services/system/resetService";
import * as taskService from "@/services/tasks/taskService";
import { refreshStreak, type StreakSummary } from "@/services/streak/streakService";
import { evaluateAndUnlock } from "@/services/achievements/achievementsService";
import { soundService } from "@/services/sound/soundService";
import type { UnlockedAchievement, CustomAchievement } from "@/data/repositories/achievementRepo";
import { translate, useI18nStore } from "@/i18n";
import { useToastStore } from "./toastStore";
import { useSyncStore, scheduleAutoPush } from "./syncStore";

export type AppStatus = "loading" | "needs-onboarding" | "ready" | "error";

interface AppState {
  status: AppStatus;
  error: string | null;
  repos: Repositories | null;

  character: Character | null;
  stats: Stat[];
  mainQuest: Goal | null;
  goals: Goal[];
  projects: Project[];
  todayTasks: Task[];
  activeTasks: Task[];
  recentXp: XpTransaction[];
  streak: StreakSummary | null;
  achievements: UnlockedAchievement[];
  customAchievements: CustomAchievement[];

  init: () => Promise<void>;
  completeOnboardingFromSync: () => Promise<boolean>;
  refresh: () => Promise<void>;

  createCharacter: (input: CreateCharacterInput) => Promise<void>;
  createTask: (input: NewTask) => Promise<Task>;
  updateTask: (id: string, fields: TaskUpdateFields) => Promise<void>;
  setStatRewards: (id: string, rewards: StatReward[], difficulty: Difficulty) => Promise<void>;
  completeTask: (id: string) => Promise<void>;
  undoComplete: (id: string) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  rescheduleTask: (id: string, date: string | null) => Promise<void>;
  createStat: (name: string, description?: string, icon?: string) => Promise<void>;
  resetProgress: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  status: "loading",
  error: null,
  repos: null,
  character: null,
  stats: [],
  mainQuest: null,
  goals: [],
  projects: [],
  todayTasks: [],
  activeTasks: [],
  recentXp: [],
  streak: null,
  achievements: [],
  customAchievements: [],

  init: async () => {
    try {
      // Decrypt any stored API key BEFORE the AI feature checks visibility.
      await initSecretStore();
      const repos = await initAppDatabase();
      set({ repos });

      // If signed in with auto-sync on, hydrate from the server first so a fresh
      // device adopts the shared state before we decide onboarding vs ready.
      const sync = useSyncStore.getState();
      if (sync.token && sync.autoSync) {
        try {
          await sync.pull(repos);
        } catch {
          /* offline / server down — carry on with the local DB */
        }
      }

      const character = await repos.character.get();
      if (!character) {
        set({ status: "needs-onboarding", character: null });
        return;
      }
      set({ status: "ready", character });
      await get().refresh();
    } catch (err) {
      set({
        status: "error",
        error:
          err instanceof Error
            ? err.message
            : "Failed to open the local database.",
      });
    }
  },

  refresh: async () => {
    const { repos } = get();
    if (!repos) return;
    const [character, stats, mainQuest, goals, projects, todayTasks, activeTasks, recentXp] =
      await Promise.all([
        repos.character.get(),
        repos.stats.list(false),
        repos.goals.getMainQuest(),
        repos.goals.list(),
        repos.projects.list(),
        taskService.listToday(repos),
        taskService.listActive(repos),
        repos.xp.listRecent(20),
      ]);
    const streak = await refreshStreak(repos);

    // Achievements: unlock any newly-earned and notify.
    const newly = await evaluateAndUnlock(repos);
    const [achievements, customAchievements] = await Promise.all([
      repos.achievements.listUnlocked(),
      repos.achievements.listCustom(),
    ]);
    if (newly.length) {
      soundService.play("achievement");
      const lang = useI18nStore.getState().lang;
      const push = useToastStore.getState().push;
      const customByKey = new Map(customAchievements.map((c) => [c.key, c]));
      for (const key of newly) {
        const custom = customByKey.get(key);
        push({
          kind: "achievement",
          title: translate(lang, "toast.achievementUnlocked"),
          detail: custom ? custom.name : translate(lang, `ach.${key}_name`),
        });
      }
    }

    set({
      character, stats, mainQuest, goals, projects,
      todayTasks, activeTasks, recentXp, streak,
      achievements, customAchievements,
    });

    // If signed in with auto-sync, upload the new state (debounced).
    scheduleAutoPush(repos);
  },

  createCharacter: async (input) => {
    const { repos } = get();
    if (!repos) return;
    await svcCreateCharacter(repos, input);
    set({ status: "ready" });
    await get().refresh();
  },

  // Onboarding "sign in & sync" path: pull the account's data from the server.
  // Returns true if the server had a character (device is now hydrated & ready);
  // false means the account is empty, so the user should create a character.
  completeOnboardingFromSync: async () => {
    const { repos } = get();
    if (!repos) return false;
    const sync = useSyncStore.getState();
    const had = await sync.pull(repos);
    if (!had) return false;
    const character = await repos.character.get();
    if (!character) return false;
    sync.setAutoSync(true); // keep this device in sync from now on
    set({ status: "ready", character });
    await get().refresh();
    return true;
  },

  createTask: async (input) => {
    const { repos } = get();
    if (!repos) throw new Error("Not ready");
    const task = await taskService.createTask(repos, input);
    await get().refresh();
    return task;
  },

  completeTask: async (id) => {
    const { repos } = get();
    if (!repos) return;
    const result = await taskService.complete(repos, id);
    const toast = useToastStore.getState().push;
    const lang = useI18nStore.getState().lang;
    const tr = (key: string, vars?: Record<string, string | number>) =>
      translate(lang, key, vars);
    if (result.awarded) {
      soundService.play("questComplete");
      const undoAction = {
        label: tr("common.undo"),
        run: () => get().undoComplete(id),
      };
      if (result.totalXp > 0) {
        toast({
          kind: "xp",
          title: tr("toast.questComplete", { xp: result.totalXp }),
          detail: result.statXp
            .map((s) => `+${s.amount} ${s.statName}`)
            .join("  ·  "),
          action: undoAction,
        });
      } else {
        toast({ kind: "info", title: tr("toast.questCompleteNoXp"), action: undoAction });
      }
      for (const lvl of result.statLevelUps) {
        toast({
          kind: "level-up",
          title: tr("toast.statReached", {
            stat: lvl.statName,
            level: lvl.newLevel,
          }),
        });
      }
      if (result.characterLeveledUp) {
        soundService.play("levelUp");
        toast({
          kind: "level-up",
          title: tr("toast.levelUp"),
          detail: tr("toast.nowLevel", { level: result.characterNewLevel }),
        });
      }
    }
    await get().refresh();
  },

  updateTask: async (id, fields) => {
    const { repos } = get();
    if (!repos) return;
    await repos.tasks.update(id, fields);
    await get().refresh();
  },

  setStatRewards: async (id, rewards, difficulty) => {
    const { repos } = get();
    if (!repos) return;
    await taskService.setStatRewards(repos, id, rewards, difficulty);
    await get().refresh();
  },

  undoComplete: async (id) => {
    const { repos } = get();
    if (!repos) return;
    await taskService.uncomplete(repos, id);
    useToastStore.getState().push({
      kind: "info",
      title: translate(useI18nStore.getState().lang, "toast.undone"),
    });
    await get().refresh();
  },

  cancelTask: async (id) => {
    const { repos } = get();
    if (!repos) return;
    await taskService.cancel(repos, id);
    await get().refresh();
  },

  reopenTask: async (id) => {
    const { repos } = get();
    if (!repos) return;
    await repos.tasks.setStatus(id, "TODO", null);
    await get().refresh();
  },

  deleteTask: async (id) => {
    const { repos } = get();
    if (!repos) return;
    // Snapshot the task + its checklist so a delete can be undone.
    const snap = await repos.tasks.getById(id);
    const criteria = snap ? await repos.criteria.listForTask(id) : [];
    await taskService.deleteTask(repos, id);
    await get().refresh();
    if (snap) {
      const lang = useI18nStore.getState().lang;
      useToastStore.getState().push({
        kind: "info",
        title: translate(lang, "toast.questDeleted"),
        detail: snap.title,
        action: {
          label: translate(lang, "common.undo"),
          run: async () => {
            const restored = await taskService.createTask(repos, {
              title: snap.title,
              description: snap.description,
              difficulty: snap.difficulty,
              priority: snap.priority,
              estimatedMinutes: snap.estimatedMinutes,
              plannedDate: snap.plannedDate,
              deadline: snap.deadline,
              projectId: snap.projectId,
              goalId: snap.goalId,
              statRewards: snap.statRewards,
            });
            for (const c of criteria) await repos.criteria.add(restored.id, c.text);
            useToastStore.getState().push({
              kind: "info",
              title: translate(lang, "toast.restored"),
              detail: snap.title,
            });
            await get().refresh();
          },
        },
      });
    }
  },

  rescheduleTask: async (id, date) => {
    const { repos } = get();
    if (!repos) return;
    await taskService.reschedule(repos, id, date);
    await get().refresh();
  },

  createStat: async (name, description, icon) => {
    const { repos } = get();
    if (!repos) return;
    await svcCreateStat(repos, { name, description, icon });
    await get().refresh();
  },

  resetProgress: async () => {
    const { repos } = get();
    if (!repos) return;
    await svcResetProgress(repos);
    // If signed in with sync, wipe the server dataset too — otherwise the
    // very next pull would re-download the state we just reset (#3).
    try {
      await useSyncStore.getState().wipeServerData();
    } catch {
      /* ignore */
    }
    set({
      status: "needs-onboarding",
      character: null,
      stats: [],
      mainQuest: null,
      goals: [],
      projects: [],
      todayTasks: [],
      activeTasks: [],
      recentXp: [],
      streak: null,
      achievements: [],
      customAchievements: [],
    });
  },
}));
