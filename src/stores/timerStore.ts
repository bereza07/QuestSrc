import { create } from "zustand";
import type { ActiveTimer, ProgressRating, TimerMode } from "@/types";
import { useAppStore } from "./appStore";
import { useToastStore } from "./toastStore";
import { translate, useI18nStore } from "@/i18n";
import { soundService } from "@/services/sound/soundService";

// The timer lives OUTSIDE React (a module-level zustand store + a single
// interval), so it keeps running across route changes and component
// re-renders (spec §74). Focused time is checkpointed to the DB every few
// seconds, so an app crash never counts closed-app time as work (spec §75).

const CHECKPOINT_EVERY_MS = 5000;

interface StartOpts {
  taskId: string | null;
  projectId: string | null;
  mode: TimerMode;
  targetSeconds: number | null;
}

interface TimerState {
  active: boolean;
  taskId: string | null;
  projectId: string | null;
  mode: TimerMode;
  targetSeconds: number | null;
  startedAt: string;
  focusedSeconds: number; // authoritative accumulated focused time
  running: boolean;

  /** A persisted timer found on startup, awaiting the user's decision. */
  recovery: ActiveTimer | null;
  /** Last saved session id, so the post-session form can attach ratings. */
  lastSessionId: string | null;
  /** Focused seconds of the just-finished session (for the post-session form). */
  lastSessionSeconds: number;
  /** Task the just-finished session was attached to (for "mark completed"). */
  lastSessionTaskId: string | null;
  /** True immediately after a target-based session hits its goal. */
  justCompletedSession: boolean;

  init: () => Promise<void>;
  start: (opts: StartOpts) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: (progressRating?: ProgressRating, difficultyRating?: number | null) => Promise<void>;
  rateLastSession: (progress: ProgressRating, difficulty: number | null) => Promise<void>;
  clearJustCompleted: () => void;

  recoveryResume: () => Promise<void>;
  recoveryStopSave: () => Promise<void>;
  recoveryDiscard: () => Promise<void>;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastTickMs = 0;
let msSinceCheckpoint = 0;

function repos() {
  return useAppStore.getState().repos;
}

function tr(key: string, vars?: Record<string, string | number>) {
  return translate(useI18nStore.getState().lang, key, vars);
}

export const useTimerStore = create<TimerState>((set, get) => {
  function stopInterval() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function startInterval() {
    stopInterval();
    lastTickMs = Date.now();
    msSinceCheckpoint = 0;
    intervalId = setInterval(() => void tick(), 1000);
  }

  async function checkpoint() {
    const s = get();
    if (!s.active) return;
    await repos()?.workSessions.checkpointTimer(s.focusedSeconds, !s.running);
  }

  async function tick() {
    const s = get();
    if (!s.active || !s.running) return;
    const now = Date.now();
    const delta = Math.floor((now - lastTickMs) / 1000);
    if (delta <= 0) return;
    lastTickMs += delta * 1000;
    msSinceCheckpoint += delta * 1000;

    let focused = s.focusedSeconds + delta;

    // Target-based modes stop themselves on reaching the goal.
    if (s.targetSeconds && focused >= s.targetSeconds) {
      focused = s.targetSeconds;
      set({ focusedSeconds: focused });
      await get().stop();
      set({ justCompletedSession: true });
      useToastStore.getState().push({
        kind: "info",
        title: tr("timer.sessionComplete"),
      });
      return;
    }

    set({ focusedSeconds: focused });
    if (msSinceCheckpoint >= CHECKPOINT_EVERY_MS) {
      msSinceCheckpoint = 0;
      await checkpoint();
    }
  }

  return {
    active: false,
    taskId: null,
    projectId: null,
    mode: "STOPWATCH",
    targetSeconds: null,
    startedAt: "",
    focusedSeconds: 0,
    running: false,
    recovery: null,
    lastSessionId: null,
    lastSessionSeconds: 0,
    lastSessionTaskId: null,
    justCompletedSession: false,

    init: async () => {
      const existing = await repos()?.workSessions.getActiveTimer();
      if (existing) set({ recovery: existing });
    },

    start: async ({ taskId, projectId, mode, targetSeconds }) => {
      soundService.play("focusStart");
      const startedAt = new Date().toISOString();
      set({
        active: true,
        taskId,
        projectId,
        mode,
        targetSeconds,
        startedAt,
        focusedSeconds: 0,
        running: true,
        recovery: null,
        justCompletedSession: false,
      });
      await repos()?.workSessions.startTimer({
        taskId,
        projectId,
        mode,
        targetSeconds,
        startedAt,
        accumulatedSeconds: 0,
        isPaused: false,
      });
      startInterval();
    },

    pause: async () => {
      if (!get().running) return;
      set({ running: false });
      stopInterval();
      await checkpoint();
    },

    resume: async () => {
      if (get().running || !get().active) return;
      set({ running: true });
      startInterval();
      await checkpoint();
    },

    stop: async (progressRating, difficultyRating) => {
      const s = get();
      if (!s.active) return;
      soundService.play("focusEnd");
      stopInterval();
      const endedAt = new Date().toISOString();
      const r = repos();
      let sessionId: string | null = null;
      if (r && s.focusedSeconds > 0) {
        const session = await r.workSessions.createSession({
          taskId: s.taskId,
          projectId: s.projectId,
          mode: s.mode,
          startedAt: s.startedAt,
          endedAt,
          durationSeconds: s.focusedSeconds,
          completedNormally: true,
          progressRating: progressRating ?? null,
          difficultyRating: difficultyRating ?? null,
        });
        sessionId = session.id;
      }
      await r?.workSessions.clearTimer();
      set({
        active: false,
        running: false,
        taskId: null,
        projectId: null,
        targetSeconds: null,
        focusedSeconds: 0,
        lastSessionId: sessionId,
        lastSessionSeconds: s.focusedSeconds,
        lastSessionTaskId: s.taskId,
      });
      await useAppStore.getState().refresh();
    },

    rateLastSession: async (progress, difficulty) => {
      const id = get().lastSessionId;
      if (!id) return;
      await repos()?.workSessions.rateSession(id, progress, difficulty);
      set({ lastSessionId: null });
    },

    // Dismissing the post-session form must also drop lastSessionId, otherwise
    // the render-time trigger (`!active && lastSessionId`) instantly reopens it.
    clearJustCompleted: () =>
      set({ justCompletedSession: false, lastSessionId: null }),

    recoveryResume: async () => {
      const rec = get().recovery;
      if (!rec) return;
      // Adopt the persisted timer as PAUSED — the user decides when to resume,
      // and time spent with the app closed is never counted.
      set({
        active: true,
        taskId: rec.taskId,
        projectId: rec.projectId,
        mode: rec.mode,
        targetSeconds: rec.targetSeconds,
        startedAt: rec.startedAt,
        focusedSeconds: rec.accumulatedSeconds,
        running: false,
        recovery: null,
      });
      await repos()?.workSessions.checkpointTimer(rec.accumulatedSeconds, true);
    },

    recoveryStopSave: async () => {
      const rec = get().recovery;
      const r = repos();
      if (!rec || !r) {
        set({ recovery: null });
        return;
      }
      if (rec.accumulatedSeconds > 0) {
        await r.workSessions.createSession({
          taskId: rec.taskId,
          projectId: rec.projectId,
          mode: rec.mode,
          startedAt: rec.startedAt,
          endedAt: new Date().toISOString(),
          durationSeconds: rec.accumulatedSeconds,
          completedNormally: false,
        });
      }
      await r.workSessions.clearTimer();
      set({ recovery: null });
      await useAppStore.getState().refresh();
    },

    recoveryDiscard: async () => {
      await repos()?.workSessions.clearTimer();
      set({ recovery: null });
    },
  };
});

/** Live focused seconds including the in-flight second (for smooth display). */
export function displaySeconds(s: TimerState): number {
  return s.focusedSeconds;
}
