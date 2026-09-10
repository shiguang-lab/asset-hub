-- Persist document folders independently from assets so empty folders can exist.
-- The path remains the stable tree identity and uses the same normalization rules
-- as assets.path.

CREATE TABLE IF NOT EXISTS document_folders (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  path TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, path),
  CHECK (path <> '')
);

CREATE INDEX IF NOT EXISTS idx_document_folders_workspace_path
  ON document_folders (workspace_id, path text_pattern_ops);
