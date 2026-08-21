import type {
  ActiveTimer,
  ProgressRating,
  TimerMode,
  WorkSession,
} from "@/types";
import type { Database } from "@/data/db";
import { newId, boolToInt, intToBool } from "@/data/db";

interface SessionRow {
  id: string;
  task_id: string | null;
  project_id: string | null;
  mode: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  completed_normally: number;
  progress_rating: string | null;
  difficulty_rating: number | null;
  created_at: string;
}

function mapSession(r: SessionRow): WorkSession {
  return {
    id: r.id,
    taskId: r.task_id,
    projectId: r.project_id,
    mode: r.mode as TimerMode,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    completedNormally: intToBool(r.completed_normally),
    progressRating: (r.progress_rating as ProgressRating | null) ?? null,
    difficultyRating: r.difficulty_rating,
    createdAt: r.created_at,
  };
}

interface TimerRow {
  id: string;
  task_id: string | null;
  project_id: string | null;
  mode: string;
  target_seconds: number | null;
  started_at: string;
  accumulated_seconds: number;
  is_paused: number;
  updated_at: string;
}

export interface NewWorkSession {
  taskId: string | null;
  projectId: string | null;
  mode: TimerMode;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  completedNormally: boolean;
  progressRating?: ProgressRating | null;
  difficultyRating?: number | null;
}

export interface SessionFilter {
  taskId?: string;
  projectId?: string;
  since?: string; // ISO lower bound on started_at
}

export function createWorkSessionRepo(db: Database) {
  return {
    async createSession(input: NewWorkSession): Promise<WorkSession> {
      const id = newId();
      const createdAt = new Date().toISOString();
      await db.execute(
        `INSERT INTO work_sessions
          (id, task_id, project_id, mode, started_at, ended_at, duration_seconds,
           completed_normally, progress_rating, difficulty_rating, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.taskId,
          input.projectId,
          input.mode,
          input.startedAt,
          input.endedAt,
          input.durationSeconds,
          boolToInt(input.completedNormally),
          input.progressRating ?? null,
          input.difficultyRating ?? null,
          createdAt,
        ],
      );
      return { id, ...input, progressRating: input.progressRating ?? null, difficultyRating: input.difficultyRating ?? null, createdAt };
    },

    /** Update the rating fields on the most recent session (post-session form). */
    async rateSession(
      id: string,
      progressRating: ProgressRating,
      difficultyRating: number | null,
    ): Promise<void> {
      await db.execute(
        "UPDATE work_sessions SET progress_rating = ?, difficulty_rating = ? WHERE id = ?",
        [progressRating, difficultyRating, id],
      );
    },

    async list(filter: SessionFilter = {}): Promise<WorkSession[]> {
      const where: string[] = [];
      const params: unknown[] = [];
      if (filter.taskId) {
        where.push("task_id = ?");
        params.push(filter.taskId);
      }
      if (filter.projectId) {
        where.push("project_id = ?");
        params.push(filter.projectId);
      }
      if (filter.since) {
        where.push("started_at >= ?");
        params.push(filter.since);
      }
      const sql =
        "SELECT * FROM work_sessions" +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        " ORDER BY started_at DESC";
      const rows = await db.select<SessionRow>(sql, params);
      return rows.map(mapSession);
    },

    /** Total focused seconds since an ISO timestamp (for daily goal / streak). */
    async focusedSecondsSince(sinceIso: string): Promise<number> {
      const rows = await db.select<{ total: number | null }>(
        "SELECT SUM(duration_seconds) AS total FROM work_sessions WHERE started_at >= ?",
        [sinceIso],
      );
      return rows[0]?.total ?? 0;
    },

    /** Total actual focused seconds recorded against a task, across sessions. */
    async focusedSecondsForTask(taskId: string): Promise<number> {
      const rows = await db.select<{ total: number | null }>(
        "SELECT SUM(duration_seconds) AS total FROM work_sessions WHERE task_id = ?",
        [taskId],
      );
      return rows[0]?.total ?? 0;
    },

    // --- active timer persistence (single row, id = 'active') ---

    async getActiveTimer(): Promise<ActiveTimer | null> {
      const rows = await db.select<TimerRow>(
        "SELECT * FROM timer_state WHERE id = 'active'",
      );
      const r = rows[0];
      if (!r) return null;
      return {
        taskId: r.task_id,
        projectId: r.project_id,
        mode: r.mode as TimerMode,
        targetSeconds: r.target_seconds,
        startedAt: r.started_at,
        accumulatedSeconds: r.accumulated_seconds,
        isPaused: intToBool(r.is_paused),
        updatedAt: r.updated_at,
      };
    },

    async startTimer(t: Omit<ActiveTimer, "updatedAt">): Promise<void> {
      const now = new Date().toISOString();
      await db.execute("DELETE FROM timer_state WHERE id = 'active'");
      await db.execute(
        `INSERT INTO timer_state
          (id, task_id, project_id, mode, target_seconds, started_at,
           accumulated_seconds, is_paused, updated_at)
         VALUES ('active', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.taskId,
          t.projectId,
          t.mode,
          t.targetSeconds,
          t.startedAt,
          t.accumulatedSeconds,
          boolToInt(t.isPaused),
          now,
        ],
      );
    },

    async checkpointTimer(accumulatedSeconds: number, isPaused: boolean): Promise<void> {
      await db.execute(
        "UPDATE timer_state SET accumulated_seconds = ?, is_paused = ?, updated_at = ? WHERE id = 'active'",
        [accumulatedSeconds, boolToInt(isPaused), new Date().toISOString()],
      );
    },

    async clearTimer(): Promise<void> {
      await db.execute("DELETE FROM timer_state WHERE id = 'active'");
    },
  };
}

export type WorkSessionRepo = ReturnType<typeof createWorkSessionRepo>;
