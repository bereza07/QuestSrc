import type { Migration } from "./types";

// Phase 4 — Focus Timer.
//   work_sessions: one row per completed focus session (append-only history).
//   timer_state:   at most one row (id = 'active'), the live/persisted timer so
//                  it survives navigation and app restarts. `accumulated_seconds`
//                  is checkpointed periodically while running, so a crash never
//                  counts closed-app time as focused work.
export const migration0002: Migration = {
  version: 2,
  name: "timer",
  statements: [
    `CREATE TABLE work_sessions (
      id                 TEXT PRIMARY KEY,
      task_id            TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      project_id         TEXT REFERENCES projects(id) ON DELETE SET NULL,
      mode               TEXT NOT NULL,
      started_at         TEXT NOT NULL,
      ended_at           TEXT NOT NULL,
      duration_seconds   INTEGER NOT NULL,
      completed_normally INTEGER NOT NULL DEFAULT 1,
      progress_rating    TEXT,
      difficulty_rating  INTEGER,
      created_at         TEXT NOT NULL
    )`,
    `CREATE INDEX idx_ws_task ON work_sessions (task_id)`,
    `CREATE INDEX idx_ws_project ON work_sessions (project_id)`,
    `CREATE INDEX idx_ws_started ON work_sessions (started_at)`,

    `CREATE TABLE timer_state (
      id                 TEXT PRIMARY KEY,
      task_id            TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      project_id         TEXT REFERENCES projects(id) ON DELETE SET NULL,
      mode               TEXT NOT NULL,
      target_seconds     INTEGER,
      started_at         TEXT NOT NULL,
      accumulated_seconds INTEGER NOT NULL DEFAULT 0,
      is_paused          INTEGER NOT NULL DEFAULT 0,
      updated_at         TEXT NOT NULL
    )`,
  ],
};
