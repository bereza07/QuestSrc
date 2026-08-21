import type { Migration } from "./types";

// Initial schema. Phase 1 actively uses character/stats/tasks/xp; projects and
// goals tables are created now so task foreign keys are valid from the start
// (Phase 2 begins using them). XP is append-only in `xp_transactions`; the
// totals on `character`/`stats` are caches recomputed from those rows.

export const migration0001: Migration = {
  version: 1,
  name: "init",
  statements: [
    `CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    )`,

    `CREATE TABLE character (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      character_class TEXT,
      level           INTEGER NOT NULL DEFAULT 1,
      current_xp      INTEGER NOT NULL DEFAULT 0,
      total_xp        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL
    )`,

    `CREATE TABLE stats (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      icon        TEXT,
      level       INTEGER NOT NULL DEFAULT 1,
      current_xp  INTEGER NOT NULL DEFAULT 0,
      total_xp    INTEGER NOT NULL DEFAULT 0,
      archived    INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX idx_stats_name ON stats (name COLLATE NOCASE)`,

    `CREATE TABLE projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      color       TEXT,
      description TEXT,
      archived    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL
    )`,

    `CREATE TABLE goals (
      id           TEXT PRIMARY KEY,
      title        TEXT NOT NULL,
      description  TEXT,
      deadline     TEXT,
      is_main_quest INTEGER NOT NULL DEFAULT 0,
      project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at   TEXT NOT NULL,
      completed_at TEXT
    )`,

    `CREATE TABLE tasks (
      id                TEXT PRIMARY KEY,
      title             TEXT NOT NULL,
      description       TEXT,
      status            TEXT NOT NULL DEFAULT 'TODO',
      priority          TEXT NOT NULL DEFAULT 'NORMAL',
      difficulty        TEXT NOT NULL DEFAULT 'MEDIUM',
      estimated_minutes INTEGER,
      planned_date      TEXT,
      deadline          TEXT,
      xp_reward         INTEGER NOT NULL DEFAULT 0,
      parent_task_id    TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      goal_id           TEXT REFERENCES goals(id) ON DELETE SET NULL,
      project_id        TEXT REFERENCES projects(id) ON DELETE SET NULL,
      sort_order        INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL,
      completed_at      TEXT
    )`,
    `CREATE INDEX idx_tasks_planned_date ON tasks (planned_date)`,
    `CREATE INDEX idx_tasks_status ON tasks (status)`,
    `CREATE INDEX idx_tasks_parent ON tasks (parent_task_id)`,

    `CREATE TABLE task_stat_rewards (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      stat_id TEXT NOT NULL REFERENCES stats(id) ON DELETE CASCADE,
      xp      INTEGER NOT NULL,
      PRIMARY KEY (task_id, stat_id)
    )`,

    `CREATE TABLE task_criteria (
      id         TEXT PRIMARY KEY,
      task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      text       TEXT NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,

    // Append-only XP ledger. The UNIQUE index below is the hard idempotency
    // guarantee: a task can never award XP to the same stat under the same
    // kind twice, no matter how many times completeTask runs.
    `CREATE TABLE xp_transactions (
      id         TEXT PRIMARY KEY,
      task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      stat_id    TEXT REFERENCES stats(id) ON DELETE SET NULL,
      kind       TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      reason     TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX idx_xp_idempotent
       ON xp_transactions (task_id, stat_id, kind)
       WHERE task_id IS NOT NULL`,
    `CREATE INDEX idx_xp_stat ON xp_transactions (stat_id)`,
    `CREATE INDEX idx_xp_task ON xp_transactions (task_id)`,
  ],
};
