-- Asset Hub PostgreSQL schema (migration 0001).
-- PostgreSQL 16 + pgvector + pg_trgm. JSON columns remain TEXT for the initial
-- port; callers parse them in the application layer (see store.ts parse()).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'personal',
  external_id TEXT,
  owner_subject TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_external_id ON workspaces(external_id);

CREATE TABLE IF NOT EXISTS users (
  subject TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  default_quality TEXT NOT NULL DEFAULT 'balanced',
  default_language TEXT NOT NULL DEFAULT 'zh-CN',
  notify_email BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  subject TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  invited_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, subject)
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  owner_subject TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'normal',
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT 'manual',
  current_version_id TEXT,
  lock_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  published_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_workspace ON assets(workspace_id, deleted_at, updated_at);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(workspace_id, type, deleted_at);
CREATE INDEX IF NOT EXISTS idx_assets_title_trgm ON assets USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS asset_acl (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL,
  UNIQUE (asset_id, principal_type, principal_id)
);
CREATE INDEX IF NOT EXISTS idx_asset_acl_asset ON asset_acl(asset_id);

CREATE TABLE IF NOT EXISTS asset_versions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  sequence INTEGER NOT NULL,
  change_kind TEXT NOT NULL DEFAULT 'edit',
  content_hash TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  media_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (asset_id, sequence)
);
CREATE INDEX IF NOT EXISTS idx_asset_versions_asset ON asset_versions(asset_id, sequence DESC);

CREATE TABLE IF NOT EXISTS asset_blobs (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES asset_versions(id),
  role TEXT NOT NULL,
  object_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  media_type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_relations (
  id TEXT PRIMARY KEY,
  source_asset_id TEXT NOT NULL REFERENCES assets(id),
  target_asset_id TEXT NOT NULL REFERENCES assets(id),
  relation_type TEXT NOT NULL,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (source_asset_id, target_asset_id, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_asset_relations_target ON asset_relations(target_asset_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  owner_subject TEXT NOT NULL,
  type TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_step TEXT NOT NULL DEFAULT '',
  spec_json TEXT NOT NULL DEFAULT '{}',
  plan_json TEXT,
  input_asset_ids TEXT NOT NULL DEFAULT '[]',
  output_asset_ids TEXT NOT NULL DEFAULT '[]',
  credits_used DOUBLE PRECISION NOT NULL DEFAULT 0,
  error TEXT,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  checkpoint_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_goal_trgm ON tasks USING gin (goal gin_trgm_ops);

CREATE TABLE IF NOT EXISTS task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress DOUBLE PRECISION NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '',
  error TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  outputs_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_steps_task ON task_steps(task_id, type);

CREATE TABLE IF NOT EXISTS evidence_items (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  claim TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT,
  source_asset_version_id TEXT,
  locator TEXT,
  excerpt_hash TEXT,
  excerpt TEXT NOT NULL DEFAULT '',
  retrieved_at TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
);
CREATE INDEX IF NOT EXISTS idx_evidence_task ON evidence_items(task_id);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  source_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_workspace ON knowledge_bases(workspace_id);

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL REFERENCES knowledge_bases(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  source_type TEXT NOT NULL,
  asset_version_id TEXT,
  url TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  content_hash TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_sources ON knowledge_sources(kb_id, status);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  kb_id TEXT NOT NULL REFERENCES knowledge_bases(id),
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id),
  ordinal INTEGER NOT NULL,
  heading_path TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  char_start INTEGER NOT NULL DEFAULT 0,
  char_end INTEGER NOT NULL DEFAULT 0,
  embedding vector(1536)
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_source ON knowledge_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb ON knowledge_chunks(kb_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_text_trgm ON knowledge_chunks USING gin (text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  current_version_id TEXT,
  status TEXT NOT NULL DEFAULT 'normal',
  row_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_datasets_workspace ON datasets(workspace_id, updated_at);

CREATE TABLE IF NOT EXISTS dataset_versions (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id),
  version INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  format TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  column_count INTEGER NOT NULL DEFAULT 0,
  schema_json TEXT NOT NULL DEFAULT '[]',
  profile_json TEXT NOT NULL DEFAULT '{}',
  quality_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'processing',
  error TEXT,
  object_key TEXT,
  content_hash TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (dataset_id, version)
);

CREATE TABLE IF NOT EXISTS dataset_saved_views (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  query_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chart_specs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES datasets(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  chart_type TEXT NOT NULL,
  x TEXT,
  y TEXT,
  group_by TEXT,
  aggregation TEXT NOT NULL DEFAULT 'sum',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publishes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  asset_id TEXT NOT NULL REFERENCES assets(id),
  slug TEXT NOT NULL UNIQUE,
  short_slug TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL DEFAULT 'public',
  password_hash TEXT,
  password_salt TEXT,
  expires_at TEXT,
  allow_download BOOLEAN NOT NULL DEFAULT TRUE,
  allow_copy BOOLEAN NOT NULL DEFAULT TRUE,
  active_release_id TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_publishes_asset ON publishes(asset_id);

CREATE TABLE IF NOT EXISTS publish_releases (
  id TEXT PRIMARY KEY,
  publish_id TEXT NOT NULL REFERENCES publishes(id),
  asset_version_id TEXT NOT NULL,
  etag TEXT NOT NULL,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'building',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_publish_releases_publish ON publish_releases(publish_id, created_at DESC);

CREATE TABLE IF NOT EXISTS short_links (
  id TEXT PRIMARY KEY,
  publish_id TEXT NOT NULL REFERENCES publishes(id),
  short_slug TEXT NOT NULL UNIQUE,
  destination TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_access_events (
  id TEXT PRIMARY KEY,
  publish_id TEXT NOT NULL,
  release_id TEXT,
  ts_bucket TEXT NOT NULL,
  referrer_domain TEXT,
  country TEXT,
  device_class TEXT,
  hashed_visitor TEXT,
  status_code INTEGER NOT NULL DEFAULT 200
);
CREATE INDEX IF NOT EXISTS idx_publish_events ON publish_access_events(publish_id, ts_bucket);

CREATE TABLE IF NOT EXISTS publish_daily_stats (
  publish_id TEXT NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  uniques INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (publish_id, day)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_ws ON notifications(workspace_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS credit_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id),
  balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_granted DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_used DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_ledger_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  entry_type TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  task_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_ws ON credit_ledger_entries(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS credit_reservations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  task_id TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (task_id)
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '["read"]',
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_configs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  scope TEXT NOT NULL DEFAULT 'all',
  scope_ids TEXT NOT NULL DEFAULT '[]',
  write_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  server_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS git_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'github',
  repo_url TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  sync_path TEXT NOT NULL DEFAULT '/',
  local_dir TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_sync_at TEXT,
  last_sync_status TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_git_conn_ws ON git_connections(workspace_id);

CREATE TABLE IF NOT EXISTS custom_domains (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  domain TEXT NOT NULL UNIQUE,
  verification_token TEXT NOT NULL,
  verified_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  publish_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_custom_domains_ws ON custom_domains(workspace_id);

CREATE TABLE IF NOT EXISTS task_schedules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'research',
  goal TEXT NOT NULL,
  spec_json TEXT NOT NULL DEFAULT '{}',
  cron TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at TEXT,
  last_run_at TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_schedules_due ON task_schedules(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'success',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_ws ON audit_events(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_version INTEGER NOT NULL DEFAULT 1,
  workspace_id TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  dispatched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at);

CREATE TABLE IF NOT EXISTS inbox_events (
  event_id TEXT NOT NULL,
  consumer TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  PRIMARY KEY (event_id, consumer)
);

CREATE TABLE IF NOT EXISTS idempotency_receipts (
  key TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proposed_patches (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  base_version_id TEXT NOT NULL,
  selection TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  proposed TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT,
  kind TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
