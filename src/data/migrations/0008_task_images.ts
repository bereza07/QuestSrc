import type { Migration } from "./types";

// Attach images to tasks. Content is stored as a data: URL (paste from clipboard)
// or an https URL (reference to a web image). Small images fit fine in SQLite;
// we hard-cap size at the service layer.
export const migration0008: Migration = {
  version: 8,
  name: "task_images",
  statements: [
    `CREATE TABLE task_images (
      id         TEXT PRIMARY KEY,
      task_id    TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('DATA', 'URL')),
      data       TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX idx_task_images_task ON task_images (task_id, created_at)`,
  ],
};
