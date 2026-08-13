import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nextId } from "@shiguang/contracts";

const SCHEMA_VERSION = 1;

const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'personal',
  owner_subject TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  subject TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  default_quality TEXT NOT NULL DEFAULT 'balanced',
  default_language TEXT NOT NULL DEFAULT 'zh-CN',
  notify_email INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
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
  progress REAL NOT NULL DEFAULT 0,
  current_step TEXT NOT NULL DEFAULT '',
  spec_json TEXT NOT NULL DEFAULT '{}',
  plan_json TEXT,
  input_asset_ids TEXT NOT NULL DEFAULT '[]',
  output_asset_ids TEXT NOT NULL DEFAULT '[]',
  credits_used REAL NOT NULL DEFAULT 0,
  error TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  checkpoint_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, updated_at);

CREATE TABLE IF NOT EXISTS task_steps (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress REAL NOT NULL DEFAULT 0,
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
  confidence REAL NOT NULL DEFAULT 0.5,
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
  char_end INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_source ON knowledge_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb ON knowledge_chunks(kb_id);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
  text,
  heading_path,
  content='',
  tokenize='unicode61'
);

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
  published INTEGER NOT NULL DEFAULT 0,
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
  allow_download INTEGER NOT NULL DEFAULT 1,
  allow_copy INTEGER NOT NULL DEFAULT 1,
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
  balance REAL NOT NULL DEFAULT 0,
  total_granted REAL NOT NULL DEFAULT 0,
  total_used REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_ledger_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  entry_type TEXT NOT NULL,
  amount REAL NOT NULL,
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
  amount REAL NOT NULL,
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
  enabled INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT 'all',
  scope_ids TEXT NOT NULL DEFAULT '[]',
  write_enabled INTEGER NOT NULL DEFAULT 0,
  server_url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

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
  amount REAL NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`;

export interface OpenDatabaseOptions {
  path: string;
  seedDemo?: boolean;
  demoSubject?: string;
  demoWorkspaceName?: string;
}

export function openDatabase(options: OpenDatabaseOptions): DatabaseSync {
  if (options.path !== ":memory:") {
    mkdirSync(dirname(options.path), { recursive: true });
  }
  const db = new DatabaseSync(options.path);
  db.exec(DDL);
  const row = db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO schema_meta (key, value) VALUES (?, ?)").run(
      "schema_version",
      String(SCHEMA_VERSION),
    );
  }
  if (options.seedDemo !== false) {
    seedDemo(db, options.demoSubject ?? "dev-user", options.demoWorkspaceName ?? "个人空间");
  }
  return db;
}

export function seedDemo(db: DatabaseSync, subject: string, workspaceName: string): void {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT id FROM workspaces WHERE owner_subject = ?").get(subject);
  if (existing) return;

  const workspaceId = nextId("wsp");
  db.prepare(
    "INSERT INTO workspaces (id, type, owner_subject, name, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(workspaceId, "personal", subject, workspaceName, now);
  db.prepare(
    "INSERT INTO users (subject, workspace_id, name, email, default_quality, default_language, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(subject, workspaceId, "演示用户", "demo@shiguang.local", "balanced", "zh-CN", now);
  db.prepare(
    "INSERT INTO credit_accounts (id, workspace_id, balance, total_granted, total_used, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(nextId("acc"), workspaceId, 10_000, 10_000, 0, now);
  db.prepare(
    "INSERT INTO credit_ledger_entries (id, workspace_id, entry_type, amount, operation_id, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    nextId("led"),
    workspaceId,
    "grant",
    10_000,
    `op_seed_${subject}`,
    "新用户初始 Credits",
    now,
  );
  db.prepare(
    "INSERT INTO mcp_configs (id, workspace_id, enabled, scope, scope_ids, write_enabled, server_url, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(nextId("mcp"), workspaceId, 0, "all", "[]", 0, "http://localhost:3001/mcp", now);

  seedTemplates(db, workspaceId, now);
}

function seedTemplates(db: DatabaseSync, workspaceId: string, now: string): void {
  const research = {
    scope: [
      { id: "market", label: "市场规模与增长", enabled: true },
      { id: "players", label: "主要公司与产品", enabled: true },
      { id: "competition", label: "竞争格局", enabled: true },
      { id: "trends", label: "趋势与机会", enabled: true },
    ],
    depth: "standard",
    quality: "balanced",
    outputs: ["report", "sources"],
  };
  const presentation = {
    theme: "light",
    aspectRatio: "16:9",
    slides: [
      {
        id: "s1",
        layout: "title",
        title: "{{title}}",
        blocks: [{ id: "b1", type: "heading", content: "{{title}}" }],
      },
      {
        id: "s2",
        layout: "content",
        title: "核心要点",
        blocks: [
          { id: "b2", type: "heading", content: "核心要点" },
          {
            id: "b3",
            type: "bullet",
            content: "背景与现状\n关键数据\n结论与建议",
          },
        ],
      },
      {
        id: "s3",
        layout: "closing",
        title: "总结",
        blocks: [{ id: "b4", type: "heading", content: "总结与展望" }],
      },
    ],
  };
  const insert = db.prepare(
    "INSERT INTO templates (id, workspace_id, type, name, description, content_json, version, published, usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    nextId("tpl"),
    workspaceId,
    "research",
    "行业研究标准模板",
    "市场、玩家、竞争、趋势四段式行业调研。",
    JSON.stringify(research),
    1,
    1,
    0,
    now,
    now,
  );
  insert.run(
    nextId("tpl"),
    workspaceId,
    "research",
    "竞品分析模板",
    "聚焦竞品功能、定价、渠道与用户评价。",
    JSON.stringify({
      ...research,
      scope: [
        { id: "product", label: "产品与功能对比", enabled: true },
        { id: "pricing", label: "定价与商业化", enabled: true },
        { id: "channel", label: "渠道与增长", enabled: true },
        { id: "reviews", label: "用户评价与口碑", enabled: true },
      ],
    }),
    1,
    1,
    0,
    now,
    now,
  );
  insert.run(
    nextId("tpl"),
    workspaceId,
    "presentation",
    "商务汇报模板",
    "标题、核心要点、总结的三段式演示模板。",
    JSON.stringify(presentation),
    1,
    1,
    0,
    now,
    now,
  );
  insert.run(
    nextId("tpl"),
    workspaceId,
    "presentation",
    "数据演示模板",
    "突出数据与图表的演示模板。",
    JSON.stringify({
      ...presentation,
      theme: "dark",
      slides: [
        presentation.slides[0],
        {
          id: "s2",
          layout: "data",
          title: "关键数据",
          blocks: [
            { id: "b2", type: "heading", content: "关键数据一览" },
            { id: "b3", type: "text", content: "趋势 · 对比 · 份额" },
          ],
        },
        presentation.slides[2],
      ],
    }),
    1,
    1,
    0,
    now,
    now,
  );
}

export type Db = DatabaseSync;
