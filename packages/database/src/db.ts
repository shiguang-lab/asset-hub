import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nextId } from "@shiguang/contracts";
import { Pool } from "pg";
import { hashBuffer, type ObjectStore } from "./storage.js";

const SCHEMA_VERSION = 1;
export type Row = Record<string, unknown>;

function toPg(sql: string): string {
  let out = "";
  let n = 0;
  let q = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") {
      if (q && sql[i + 1] === "'") {
        out += "''";
        i++;
        continue;
      }
      q = !q;
      out += c;
    } else if (c === "?" && !q) {
      n++;
      out += "$" + n;
    } else out += c;
  }
  return out;
}

export class Db {
  constructor(readonly pool: Pool) {}
  prepare(sql: string) {
    const s = toPg(sql);
    return {
      get: async (...p: unknown[]): Promise<Row | undefined> =>
        (await this.pool.query(s, p)).rows[0] as Row | undefined,
      all: async (...p: unknown[]): Promise<Row[]> => (await this.pool.query(s, p)).rows as Row[],
      run: async (...p: unknown[]): Promise<void> => {
        await this.pool.query(s, p);
      },
    };
  }
  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }
}

export interface OpenDatabaseOptions {
  url: string;
  seedDemo?: boolean;
  demoSubject?: string;
  demoWorkspaceName?: string;
  storage?: ObjectStore;
}

export function migrationsDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");
}

/**
 * 按文件名顺序执行 `migrations/*.sql`，已执行的跳过。
 *
 * `0001_init.sql` 全文使用 `IF NOT EXISTS`，对既有库重复执行是安全的，因此它同样
 * 纳入本机制而无需特殊分支；首次运行时 `schema_migrations` 尚不存在，故先单独建表。
 *
 * 每个迁移在独立事务内执行，失败即回滚，避免留下半应用的 schema。
 */
export async function applyMigrations(pool: Pool, dir = migrationsDir()): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const done = await client.query("SELECT name FROM schema_migrations WHERE name = $1", [file]);
      if (done.rowCount === 0) {
        await client.query(await readFile(resolve(dir, file), "utf8"));
        await client.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)", [
          file,
          new Date().toISOString(),
        ]);
        applied.push(file);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new Error(`迁移 ${file} 执行失败: ${(error as Error).message}`, { cause: error });
    } finally {
      client.release();
    }
  }
  return applied;
}

export async function openDatabase(o: OpenDatabaseOptions): Promise<Db> {
  const pool = new Pool({ connectionString: o.url });
  await applyMigrations(pool);
  const db = new Db(pool);
  const row = await db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get();
  if (!row)
    await db
      .prepare("INSERT INTO schema_meta (key, value) VALUES (?, ?)")
      .run("schema_version", String(SCHEMA_VERSION));
  if (o.seedDemo !== false) {
    const subject = o.demoSubject ?? "dev-user";
    await seedDemo(db, subject, o.demoWorkspaceName ?? "个人空间");
    if (o.storage) await seedDemoAssets(db, o.storage, subject);
  }
  return db;
}

export async function seedDemo(db: Db, subject: string, workspaceName: string): Promise<void> {
  const now = new Date().toISOString();
  if (await db.prepare("SELECT id FROM workspaces WHERE owner_subject = ?").get(subject)) return;
  const ws = nextId("wsp");
  await db
    .prepare(
      "INSERT INTO workspaces (id, type, owner_subject, name, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(ws, "personal", subject, workspaceName, now);
  await db
    .prepare(
      "INSERT INTO users (subject, workspace_id, name, email, default_quality, default_language, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(subject, ws, "演示用户", "demo@shiguang.local", "balanced", "zh-CN", now);
  await db
    .prepare(
      "INSERT INTO mcp_configs (id, workspace_id, enabled, scope, scope_ids, write_enabled, server_url, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(nextId("mcp"), ws, false, "all", "[]", false, "", now);
  const r = {
    type: "research",
    name: "标准研究报告",
    description: "适合大多数研究任务的默认模板。",
    content: { document: { sections: ["背景", "方法", "关键发现", "结论与建议"] } },
  };
  await db
    .prepare(
      "INSERT INTO templates (id, workspace_id, type, name, description, content_json, version, published, usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      nextId("tpl"),
      ws,
      "research",
      r.name,
      r.description,
      JSON.stringify(r),
      1,
      true,
      0,
      now,
      now,
    );
  const pres = {
    theme: "default",
    slides: [
      { id: "s1", layout: "title", title: "标题页", blocks: [] },
      { id: "s2", layout: "content", title: "核心要点", blocks: [] },
      { id: "s3", layout: "closing", title: "总结与展望", blocks: [] },
    ],
  };
  await db
    .prepare(
      "INSERT INTO templates (id, workspace_id, type, name, description, content_json, version, published, usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      nextId("tpl"),
      ws,
      "presentation",
      "数据演示模板",
      "突出数据与图表的演示模板。",
      JSON.stringify(pres),
      1,
      true,
      0,
      now,
      now,
    );
}

/**
 * Seed demo assets (documents, presentation, knowledge base, publishes, tasks)
 * so the workspace opens with realistic content. Idempotent: skips when the
 * demo documents already exist.
 */
export async function seedDemoAssets(db: Db, storage: ObjectStore, subject: string): Promise<void> {
  const wsRow = await db.prepare("SELECT id FROM workspaces WHERE owner_subject = ?").get(subject);
  if (!wsRow) return;
  const workspaceId = String(wsRow.id);
  const seeded = await db
    .prepare(
      "SELECT id FROM assets WHERE workspace_id = ? AND title = '2024 新能源汽车行业研究报告'",
    )
    .get(workspaceId);
  if (seeded) return;

  // Remove accidental empty documents auto-created by the editor's new-doc flow.
  await cleanupUntitledDocs(db, workspaceId);

  const now = Date.now();
  const H = 3600_000;
  const D = 24 * H;
  const ago = (ms: number) => new Date(now - ms).toISOString();

  interface DemoDoc {
    title: string;
    description: string;
    visibility: "private" | "link" | "public";
    publishedUrl: string | null;
    updatedAgo: number;
    createdAgo: number;
    content: string;
  }

  const docs: DemoDoc[] = [
    {
      title: "2024 新能源汽车行业研究报告",
      description: "深入分析全球新能源汽车市场趋势、竞争格局与技术演进",
      visibility: "public",
      publishedUrl: "http://localhost:3004/p/nev-2024",
      updatedAgo: 1 * D + 6 * H,
      createdAgo: 30 * D,
      content: `# 2024 新能源汽车行业研究报告

## 一、市场概览

2024 年全球新能源汽车销量持续增长，渗透率稳步提升。

## 二、竞争格局

- 中国市场保持领先
- 欧洲市场加速转型
- 东南亚成为新兴增长极

## 三、技术演进

电池技术、智能驾驶与补能网络是三大主线。

## 四、结论与建议

建议关注东南亚市场的政策红利与本土化供应链机会。`,
    },
    {
      title: "越南消费金融市场分析",
      description: "聚焦越南消费金融市场现状与未来机遇，包含市场规模、主要玩家与增长驱动",
      visibility: "link",
      publishedUrl: "http://localhost:3004/p/vietnam-fintech",
      updatedAgo: 6 * H,
      createdAgo: 12 * D,
      content: `# 越南消费金融市场分析

## 市场规模

越南消费金融渗透率快速提升，年轻人口结构是核心驱动。

## 主要玩家

- FE Credit
- Home Credit
- 本地银行系消费金融公司

## 增长驱动

电商、摩托车分期与无抵押现金贷是主要场景。`,
    },
    {
      title: "AI Agent 产品设计规范",
      description: "定义 AI Agent 产品的设计原则、功能模块与交互规范",
      visibility: "link",
      publishedUrl: null,
      updatedAgo: 2 * D + 4 * H,
      createdAgo: 45 * D,
      content: `# AI Agent 产品设计规范

## 设计原则

1. 目标可理解
2. 过程可观察
3. 结果可验证
4. 失败可恢复

## 功能模块

规划、工具调用、记忆、检查点与重试。`,
    },
    {
      title: "Shiguang Lab 产品需求文档",
      description: "Shiguang Lab 核心功能需求、用户场景与验收标准",
      visibility: "link",
      publishedUrl: null,
      updatedAgo: 95 * D,
      createdAgo: 120 * D,
      content: `# Shiguang Lab 产品需求文档

## 产品定位

AI 原生知识与数字资产工作空间。

## 核心模块

文档、知识库、调研、任务、数据集、在线演示。

## 验收标准

首次用户无需帮助即可完成「建文档 / 做调研 / 生成演示 / 发布」至少一种路径。`,
    },
    {
      title: "行业数据 Dashboard",
      description: "可视化展示行业关键指标与趋势数据，支持多维度下钻分析",
      visibility: "public",
      publishedUrl: "http://localhost:3004/p/industry-dashboard",
      updatedAgo: 97 * D,
      createdAgo: 130 * D,
      content: `# 行业数据 Dashboard

## 核心指标

- 市场规模
- 增长率
- 集中度
- 融资热度

## 维度下钻

按地区、公司、产品、时间多维度下钻。`,
    },
  ];

  const docIds: Array<{ id: string; versionId: string }> = [];
  for (const doc of docs) {
    docIds.push(await insertDoc(db, storage, workspaceId, subject, doc));
  }
  const nevDoc = docIds[0]!;
  const vietnamDoc = docIds[1]!;
  const aiAgentDoc = docIds[2]!;
  const dashboardDoc = docIds[4]!;

  // Presentation generated from the first document.
  const presId = nextId("ast");
  const presVersionId = nextId("av");
  const presUpdated = ago(3 * D);
  const presManifest = JSON.stringify({
    theme: "default",
    slides: [
      { id: "s1", layout: "title", title: "2024 新能源汽车行业研究报告", blocks: [] },
      { id: "s2", layout: "content", title: "市场概览", blocks: [] },
      { id: "s3", layout: "content", title: "竞争格局", blocks: [] },
      { id: "s4", layout: "closing", title: "结论与建议", blocks: [] },
    ],
  });
  await db
    .prepare(
      `INSERT INTO assets (id, workspace_id, owner_subject, type, title, description, visibility, status, source_type, current_version_id, lock_version, created_at, updated_at)
       VALUES (?, ?, ?, 'presentation', '新能源汽车行业研究报告演示', '由文档生成的在线演示', 'link', 'normal', 'template', ?, 1, ?, ?)`,
    )
    .run(presId, workspaceId, subject, presVersionId, presUpdated, presUpdated);
  await db
    .prepare(
      `INSERT INTO asset_versions (id, asset_id, sequence, change_kind, content_hash, size, media_type, metadata_json, created_at)
       VALUES (?, ?, 1, 'create', ?, ?, 'application/json', '{}', ?)`,
    )
    .run(
      presVersionId,
      presId,
      hashBuffer(Buffer.from(presManifest)),
      Buffer.byteLength(presManifest),
      presUpdated,
    );
  const presKey = `assets/${presId}/versions/${presVersionId}/content`;
  await storage.put(presKey, Buffer.from(presManifest), "application/json");
  await db
    .prepare(
      `INSERT INTO asset_blobs (id, version_id, role, object_key, content_hash, size, media_type)
       VALUES (?, ?, 'content', ?, ?, ?, 'application/json')`,
    )
    .run(
      nextId("blob"),
      presVersionId,
      presKey,
      hashBuffer(Buffer.from(presManifest)),
      Buffer.byteLength(presManifest),
    );

  // Relations matching the design's "关联" column:
  // doc1/doc5 -> presentation (generated_from); doc2/doc3 -> knowledge (knowledge_source_of).
  await db
    .prepare(
      `INSERT INTO asset_relations (id, source_asset_id, target_asset_id, relation_type, provenance_json, created_at)
       VALUES (?, ?, ?, 'generated_from', '{"via":"demo"}', ?)`,
    )
    .run(nextId("rel"), nevDoc.id, presId, ago(2 * D));
  await db
    .prepare(
      `INSERT INTO asset_relations (id, source_asset_id, target_asset_id, relation_type, provenance_json, created_at)
       VALUES (?, ?, ?, 'knowledge_source_of', '{"via":"demo"}', ?)`,
    )
    .run(nextId("rel"), vietnamDoc.id, presId, ago(5 * H));
  await db
    .prepare(
      `INSERT INTO asset_relations (id, source_asset_id, target_asset_id, relation_type, provenance_json, created_at)
       VALUES (?, ?, ?, 'knowledge_source_of', '{"via":"demo"}', ?)`,
    )
    .run(nextId("rel"), aiAgentDoc.id, presId, ago(7 * D));
  await db
    .prepare(
      `INSERT INTO asset_relations (id, source_asset_id, target_asset_id, relation_type, provenance_json, created_at)
       VALUES (?, ?, ?, 'generated_from', '{"via":"demo"}', ?)`,
    )
    .run(nextId("rel"), dashboardDoc.id, presId, ago(2 * D));

  // Knowledge base with two sources.
  const kbId = nextId("kb");
  await db
    .prepare(
      `INSERT INTO knowledge_bases (id, workspace_id, name, description, source_count, chunk_count, created_at, updated_at)
       VALUES (?, ?, '越南消费金融资料库', '越南消费金融市场研究资料与行业数据', 2, 38, ?, ?)`,
    )
    .run(kbId, workspaceId, ago(8 * D), ago(5 * H));
  for (const s of [
    { versionId: vietnamDoc.versionId, title: docs[1]!.title },
    { versionId: aiAgentDoc.versionId, title: docs[2]!.title },
  ]) {
    await db
      .prepare(
        `INSERT INTO knowledge_sources (id, kb_id, workspace_id, source_type, asset_version_id, url, title, status, content_hash, created_at, updated_at)
         VALUES (?, ?, ?, 'asset', ?, NULL, ?, 'ready', ?, ?, ?)`,
      )
      .run(nextId("src"), kbId, workspaceId, s.versionId, s.title, "", ago(8 * D), ago(8 * D));
  }

  // Publishes for the three published documents.
  for (const [i, doc] of docs.entries()) {
    if (!doc.publishedUrl) continue;
    await db
      .prepare(
        `INSERT INTO publishes (id, workspace_id, asset_id, slug, short_slug, visibility, allow_download, allow_copy, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'public', true, true, 'active', ?, ?)`,
      )
      .run(
        nextId("pub"),
        workspaceId,
        docIds[i]!.id,
        `doc-${i + 1}`,
        `d${i + 1}`,
        ago(2 * D),
        ago(2 * D),
      );
  }

  // A running task and a completed task for the home/task pages.
  await db
    .prepare(
      `INSERT INTO tasks (id, workspace_id, owner_subject, type, goal, status, progress, current_step, spec_json, input_asset_ids, output_asset_ids, credits_used, cancel_requested, started_at, created_at, updated_at)
       VALUES (?, ?, ?, 'research', '调研东南亚电动车充电基础设施与政策环境', 'running', 62, '分析竞品与政策', '{"depth":"standard"}', '[]', '[]', 184, false, ?, ?, ?)`,
    )
    .run(nextId("tsk"), workspaceId, subject, ago(1 * H), ago(1 * H), ago(6 * H));
  await db
    .prepare(
      `INSERT INTO tasks (id, workspace_id, owner_subject, type, goal, status, progress, current_step, spec_json, input_asset_ids, output_asset_ids, credits_used, cancel_requested, started_at, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'research', '2024 全球半导体行业竞争格局分析', 'completed', 100, '完成', '{"depth":"deep"}', '[]', '[]', 1280, false, ?, ?, ?, ?)`,
    )
    .run(nextId("tsk"), workspaceId, subject, ago(12 * D), ago(11 * D), ago(12 * D), ago(11 * D));
}

async function insertDoc(
  db: Db,
  storage: ObjectStore,
  workspaceId: string,
  subject: string,
  doc: {
    title: string;
    description: string;
    visibility: string;
    publishedUrl: string | null;
    updatedAgo: number;
    createdAgo: number;
    content: string;
  },
): Promise<{ id: string; versionId: string }> {
  const id = nextId("ast");
  const versionId = nextId("av");
  const createdAt = new Date(Date.now() - doc.createdAgo).toISOString();
  const updatedAt = new Date(Date.now() - doc.updatedAgo).toISOString();
  await db
    .prepare(
      `INSERT INTO assets (id, workspace_id, owner_subject, type, title, description, visibility, status, source_type, current_version_id, lock_version, published_url, created_at, updated_at)
       VALUES (?, ?, ?, 'document', ?, ?, ?, 'normal', 'manual', ?, 1, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      subject,
      doc.title,
      doc.description,
      doc.visibility,
      versionId,
      doc.publishedUrl,
      createdAt,
      updatedAt,
    );
  const data = Buffer.from(doc.content, "utf8");
  await db
    .prepare(
      `INSERT INTO asset_versions (id, asset_id, sequence, change_kind, content_hash, size, media_type, metadata_json, created_at)
       VALUES (?, ?, 1, 'create', ?, ?, 'text/markdown', '{}', ?)`,
    )
    .run(versionId, id, hashBuffer(data), data.byteLength, createdAt);
  const objectKey = `assets/${id}/versions/${versionId}/content`;
  await storage.put(objectKey, data, "text/plain");
  await db
    .prepare(
      `INSERT INTO asset_blobs (id, version_id, role, object_key, content_hash, size, media_type)
       VALUES (?, ?, 'content', ?, ?, ?, 'text/markdown')`,
    )
    .run(nextId("blob"), versionId, objectKey, hashBuffer(data), data.byteLength);
  return { id, versionId };
}

/** Delete empty "未命名文档" assets auto-created by the editor's new-doc flow. */
async function cleanupUntitledDocs(db: Db, workspaceId: string): Promise<void> {
  const ids = (
    (await db
      .prepare("SELECT id FROM assets WHERE workspace_id = ? AND title = '未命名文档'")
      .all(workspaceId)) as Row[]
  ).map((r) => String(r.id));
  for (const id of ids) {
    await db
      .prepare(
        "DELETE FROM asset_blobs WHERE version_id IN (SELECT id FROM asset_versions WHERE asset_id = ?)",
      )
      .run(id);
    await db.prepare("DELETE FROM asset_versions WHERE asset_id = ?").run(id);
    await db
      .prepare("DELETE FROM asset_relations WHERE source_asset_id = ? OR target_asset_id = ?")
      .run(id, id);
    await db.prepare("DELETE FROM publishes WHERE asset_id = ?").run(id);
    await db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  }
}
