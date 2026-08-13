import { createHash } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  type ActorContext,
  type ApiToken,
  type Asset,
  type AssetContent,
  type AssetRelation,
  type AssetType,
  type AssetVersion,
  type AuditEvent,
  type ChartSpec,
  type CreditAccount,
  type CreditLedgerEntry,
  type Dataset,
  type DatasetQuery,
  type DatasetQueryResult,
  type DatasetVersion,
  type KnowledgeBase,
  type KnowledgeChunk,
  type KnowledgeSource,
  type McpConfig,
  type Notification,
  nextId,
  nowIso,
  type OutboxEvent,
  type Paginated,
  type PresentationDocument,
  type Publish,
  type PublishRelease,
  type ResearchSpec,
  type SavedView,
  type ShortLink,
  type SourceStatus,
  type Task,
  type TaskStatus,
  type TaskStep,
  type Template,
  type UserProfile,
  type Workspace,
} from "@shiguang/contracts";
import type { ObjectStore } from "./storage.js";
import { hashBuffer } from "./storage.js";

type Row = Record<string, unknown>;

function json<T>(value: T): string {
  return JSON.stringify(value);
}

function parse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === "number" ? v : fallback);
const bool = (v: unknown): boolean => v === 1 || v === true;

function mapAsset(r: Row): Asset {
  return {
    id: str(r.id),
    workspaceId: str(r.workspace_id),
    ownerSubject: str(r.owner_subject),
    type: str(r.type) as AssetType,
    title: str(r.title),
    description: str(r.description),
    visibility: str(r.visibility) as Asset["visibility"],
    status: str(r.status) as Asset["status"],
    tags: parse<string[]>(r.tags_json, []),
    sourceType: str(r.source_type) as Asset["sourceType"],
    currentVersionId: r.current_version_id === null ? null : str(r.current_version_id),
    lockVersion: num(r.lock_version, 1),
    deletedAt: r.deleted_at === null ? null : str(r.deleted_at),
    publishedUrl: r.published_url === null ? null : str(r.published_url),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

function mapVersion(r: Row): AssetVersion {
  return {
    id: str(r.id),
    assetId: str(r.asset_id),
    sequence: num(r.sequence),
    changeKind: str(r.change_kind) as AssetVersion["changeKind"],
    contentHash: str(r.content_hash),
    size: num(r.size),
    mediaType: str(r.media_type),
    metadata: parse<Record<string, unknown>>(r.metadata_json, {}),
    createdAt: str(r.created_at),
  };
}

function mapTask(r: Row): Task {
  return {
    id: str(r.id),
    workspaceId: str(r.workspace_id),
    ownerSubject: str(r.owner_subject),
    type: str(r.type) as Task["type"],
    goal: str(r.goal),
    status: str(r.status) as TaskStatus,
    progress: num(r.progress),
    currentStep: str(r.current_step),
    spec: parse<Record<string, unknown>>(r.spec_json, {}),
    plan: r.plan_json === null ? null : parse<Record<string, unknown>>(r.plan_json, {}),
    inputAssetIds: parse<string[]>(r.input_asset_ids, []),
    outputAssetIds: parse<string[]>(r.output_asset_ids, []),
    creditsUsed: num(r.credits_used),
    error: r.error === null ? null : str(r.error),
    cancelRequested: bool(r.cancel_requested),
    checkpoint:
      r.checkpoint_json === null ? null : parse<Record<string, unknown>>(r.checkpoint_json, {}),
    startedAt: r.started_at === null ? null : str(r.started_at),
    completedAt: r.completed_at === null ? null : str(r.completed_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

function mapStep(r: Row): TaskStep {
  return {
    id: str(r.id),
    taskId: str(r.task_id),
    type: str(r.type),
    status: str(r.status) as TaskStep["status"],
    progress: num(r.progress),
    detail: str(r.detail),
    error: r.error === null ? null : str(r.error),
    attempt: num(r.attempt, 1),
    outputs: parse<Record<string, unknown>>(r.outputs_json, {}),
    startedAt: r.started_at === null ? null : str(r.started_at),
    completedAt: r.completed_at === null ? null : str(r.completed_at),
  };
}

export interface CursorPage {
  limit: number;
  after?: string;
}

export class Store {
  constructor(
    private readonly db: DatabaseSync,
    private readonly storage: ObjectStore,
  ) {}

  /* ---------------- workspaces & users ---------------- */

  getWorkspaceBySubject(subject: string): Workspace | null {
    const row = this.db
      .prepare("SELECT * FROM workspaces WHERE owner_subject = ? LIMIT 1")
      .get(subject) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row.id),
      type: str(row.type) as Workspace["type"],
      ownerSubject: str(row.owner_subject),
      name: str(row.name),
      createdAt: str(row.created_at),
    };
  }

  getWorkspaceOwnerSubject(workspaceId: string): string | null {
    const row = this.db
      .prepare("SELECT owner_subject FROM workspaces WHERE id = ?")
      .get(workspaceId) as { owner_subject: string } | undefined;
    return row?.owner_subject ?? null;
  }

  ensureUser(actor: { subject: string; workspaceId: string }): UserProfile {
    const now = nowIso();
    const existing = this.db.prepare("SELECT * FROM users WHERE subject = ?").get(actor.subject) as
      | Row
      | undefined;
    if (existing) {
      return {
        subject: str(existing.subject),
        name: str(existing.name),
        email: existing.email === null ? null : str(existing.email),
        avatarUrl: existing.avatar_url === null ? null : str(existing.avatar_url),
        defaultQuality: str(existing.default_quality) as UserProfile["defaultQuality"],
        defaultLanguage: str(existing.default_language),
        notifyEmail: bool(existing.notify_email),
        workspaceId: str(existing.workspace_id),
        createdAt: str(existing.created_at),
      };
    }
    this.db
      .prepare("INSERT INTO users (subject, workspace_id, name, created_at) VALUES (?, ?, ?, ?)")
      .run(actor.subject, actor.workspaceId, "新用户", now);
    const profile = this.ensureUser(actor);
    return profile;
  }

  getUserProfile(subject: string): UserProfile | null {
    const row = this.db.prepare("SELECT * FROM users WHERE subject = ?").get(subject) as
      | Row
      | undefined;
    if (!row) return null;
    return {
      subject: str(row.subject),
      name: str(row.name),
      email: row.email === null ? null : str(row.email),
      avatarUrl: row.avatar_url === null ? null : str(row.avatar_url),
      defaultQuality: str(row.default_quality) as UserProfile["defaultQuality"],
      defaultLanguage: str(row.default_language),
      notifyEmail: bool(row.notify_email),
      workspaceId: str(row.workspace_id),
      createdAt: str(row.created_at),
    };
  }

  updateUserProfile(
    subject: string,
    patch: Partial<
      Pick<UserProfile, "name" | "defaultQuality" | "defaultLanguage" | "notifyEmail" | "avatarUrl">
    >,
  ): UserProfile {
    const current = this.getUserProfile(subject);
    if (!current) throw new Error("user not found");
    this.db
      .prepare(
        "UPDATE users SET name = ?, default_quality = ?, default_language = ?, notify_email = ? WHERE subject = ?",
      )
      .run(
        patch.name ?? current.name,
        patch.defaultQuality ?? current.defaultQuality,
        patch.defaultLanguage ?? current.defaultLanguage,
        (patch.notifyEmail ?? current.notifyEmail) ? 1 : 0,
        subject,
      );
    return this.getUserProfile(subject) as UserProfile;
  }

  /* ---------------- assets ---------------- */

  listAssets(
    workspaceId: string,
    opts: {
      type?: AssetType;
      q?: string;
      tag?: string;
      status?: string;
      visibility?: string;
      includeDeleted?: boolean;
      limit: number;
      after?: string;
    },
  ): Paginated<Asset> {
    const clauses = ["a.workspace_id = ?"];
    const params: unknown[] = [workspaceId];
    if (opts.includeDeleted) {
      clauses.push("a.deleted_at IS NOT NULL");
    } else {
      clauses.push("a.deleted_at IS NULL");
      if (opts.status && opts.status !== "all") {
        clauses.push("a.status = ?");
        params.push(opts.status);
      }
    }
    if (opts.type) {
      clauses.push("a.type = ?");
      params.push(opts.type);
    }
    if (opts.visibility && opts.visibility !== "all") {
      clauses.push("a.visibility = ?");
      params.push(opts.visibility);
    }
    if (opts.q) {
      clauses.push("(a.title LIKE ? OR a.description LIKE ?)");
      const like = `%${opts.q}%`;
      params.push(like, like);
    }
    if (opts.tag) {
      clauses.push("a.tags_json LIKE ?");
      params.push(`%"${opts.tag}"%`);
    }
    if (opts.after) {
      clauses.push("(a.updated_at < ? OR (a.updated_at = ? AND a.id < ?))");
      const [afterAt, afterId] = decodeCursor(opts.after);
      params.push(afterAt, afterAt, afterId);
    }
    const where = clauses.join(" AND ");
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) AS n FROM assets a WHERE ${where}`)
      .get(...(params as SQLInputValue[])) as { n: number };
    const rows = this.db
      .prepare(
        `SELECT a.* FROM assets a WHERE ${where} ORDER BY a.updated_at DESC, a.id DESC LIMIT ?`,
      )
      .all(...(params as SQLInputValue[]), opts.limit + 1) as Row[];
    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map(mapAsset);
    const last = items.at(-1);
    return {
      items,
      total: totalRow.n,
      nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
    };
  }

  getAsset(workspaceId: string, assetId: string): Asset | null {
    const row = this.db
      .prepare("SELECT * FROM assets WHERE id = ? AND workspace_id = ?")
      .get(assetId, workspaceId) as Row | undefined;
    return row ? mapAsset(row) : null;
  }

  getAssetAny(assetId: string): Asset | null {
    const row = this.db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as
      | Row
      | undefined;
    return row ? mapAsset(row) : null;
  }

  searchAssets(workspaceId: string, query: string, limit = 20): Asset[] {
    const rows = this.db
      .prepare(
        `SELECT a.* FROM assets a
         WHERE a.workspace_id = ? AND a.deleted_at IS NULL
           AND (a.title LIKE ? OR a.description LIKE ? OR a.tags_json LIKE ?)
         ORDER BY a.updated_at DESC LIMIT ?`,
      )
      .all(workspaceId, `%${query}%`, `%${query}%`, `%${query}%`, limit) as Row[];
    return rows.map(mapAsset);
  }

  createAsset(
    actor: ActorContext,
    input: {
      type: AssetType;
      title: string;
      description?: string;
      tags?: string[];
      visibility?: Asset["visibility"];
      sourceType?: Asset["sourceType"];
      content?: AssetContent;
      metadata?: Record<string, unknown>;
    },
  ): Asset {
    const now = nowIso();
    const id = nextId("ast");
    const versionId = nextId("av");
    this.db
      .prepare(
        `INSERT INTO assets (id, workspace_id, owner_subject, type, title, description, visibility, status, tags_json, source_type, current_version_id, lock_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'normal', ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        actor.workspaceId,
        actor.subject,
        input.type,
        input.title,
        input.description ?? "",
        input.visibility ?? "private",
        json(input.tags ?? []),
        input.sourceType ?? "manual",
        versionId,
        now,
        now,
      );
    this.db
      .prepare(
        `INSERT INTO asset_versions (id, asset_id, sequence, change_kind, content_hash, size, media_type, metadata_json, created_at)
         VALUES (?, ?, 1, 'create', ?, ?, ?, ?, ?)`,
      )
      .run(
        versionId,
        id,
        input.content?.text ? hashBuffer(Buffer.from(input.content.text)) : "sha256:empty",
        input.content?.text ? Buffer.byteLength(input.content.text, "utf8") : 0,
        input.content?.text ? "text/markdown" : "application/json",
        json(input.metadata ?? {}),
        now,
      );
    if (input.content) {
      this.persistContent(id, versionId, input.content);
    }
    return this.getAsset(actor.workspaceId, id) as Asset;
  }

  createAssetWithVersion(
    actor: ActorContext,
    input: {
      type: AssetType;
      title: string;
      description?: string;
      tags?: string[];
      visibility?: Asset["visibility"];
      sourceType?: Asset["sourceType"];
      content?: AssetContent;
      metadata?: Record<string, unknown>;
      relation?: { sourceAssetId: string; relationType: string };
    },
  ): { asset: Asset; versionId: string } {
    const asset = this.createAsset(actor, input);
    if (input.relation) {
      this.addRelation(
        actor.workspaceId,
        input.relation.sourceAssetId,
        asset.id,
        input.relation.relationType as AssetRelation["relationType"],
        {},
      );
    }
    return { asset, versionId: asset.currentVersionId ?? "" };
  }

  saveContent(
    actor: ActorContext,
    assetId: string,
    content: AssetContent,
    opts: {
      changeKind?: AssetVersion["changeKind"];
      metadata?: Record<string, unknown>;
      title?: string;
      expectedLockVersion?: number;
    } = {},
  ): { asset: Asset; version: AssetVersion } {
    const asset = this.getAsset(actor.workspaceId, assetId);
    if (!asset) throw new Error("asset not found");
    if (opts.expectedLockVersion !== undefined && asset.lockVersion !== opts.expectedLockVersion) {
      const err = new Error("版本冲突：文档已被其他会话修改") as Error & { code?: string };
      err.code = "ASSET_VERSION_CONFLICT";
      throw err;
    }
    const now = nowIso();
    const versionId = nextId("av");
    const sequence = this.nextVersionSequence(assetId);
    const text = content.text ?? "";
    const contentHash = text ? hashBuffer(Buffer.from(text, "utf8")) : "sha256:empty";
    this.db
      .prepare(
        `INSERT INTO asset_versions (id, asset_id, sequence, change_kind, content_hash, size, media_type, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        versionId,
        assetId,
        sequence,
        opts.changeKind ?? "edit",
        contentHash,
        text ? Buffer.byteLength(text, "utf8") : 0,
        content.text
          ? content.kind === "html"
            ? "text/html"
            : content.kind === "markdown"
              ? "text/markdown"
              : "application/json"
          : "application/json",
        json(opts.metadata ?? {}),
        now,
      );
    this.persistContent(assetId, versionId, content);
    this.db
      .prepare(
        `UPDATE assets SET current_version_id = ?, lock_version = lock_version + 1, updated_at = ?, title = ?, status = CASE WHEN status = 'error' THEN 'normal' ELSE status END WHERE id = ?`,
      )
      .run(versionId, now, opts.title ?? asset.title, assetId);
    const updated = this.getAsset(actor.workspaceId, assetId) as Asset;
    const version = this.getVersion(versionId) as AssetVersion;
    return { asset: updated, version };
  }

  updateAssetMeta(
    actor: ActorContext,
    assetId: string,
    patch: Partial<Pick<Asset, "title" | "description" | "tags" | "visibility" | "status">>,
    expectedLockVersion?: number,
  ): Asset | null {
    const asset = this.getAsset(actor.workspaceId, assetId);
    if (!asset) return null;
    if (expectedLockVersion !== undefined && asset.lockVersion !== expectedLockVersion) {
      const err = new Error("版本冲突：资源已被其他会话修改") as Error & { code?: string };
      err.code = "ASSET_VERSION_CONFLICT";
      throw err;
    }
    const now = nowIso();
    this.db
      .prepare(
        `UPDATE assets SET title = ?, description = ?, tags_json = ?, visibility = ?, status = ?, lock_version = lock_version + 1, updated_at = ? WHERE id = ?`,
      )
      .run(
        patch.title ?? asset.title,
        patch.description ?? asset.description,
        json(patch.tags ?? asset.tags),
        patch.visibility ?? asset.visibility,
        patch.status ?? asset.status,
        now,
        assetId,
      );
    return this.getAsset(actor.workspaceId, assetId);
  }

  batchUpdateAssets(
    actor: ActorContext,
    ids: string[],
    action: "delete" | "restore" | "tag",
    tags?: string[],
  ): number {
    const now = nowIso();
    let changed = 0;
    for (const id of ids) {
      const asset = this.getAsset(actor.workspaceId, id);
      if (!asset) continue;
      if (action === "delete") this.softDelete(actor, id);
      if (action === "restore") this.restore(actor, id);
      if (action === "tag") {
        this.db
          .prepare("UPDATE assets SET tags_json = ?, updated_at = ? WHERE id = ?")
          .run(json(Array.from(new Set([...(tags ?? []), ...asset.tags]))), now, id);
      }
      changed += 1;
    }
    return changed;
  }

  private nextVersionSequence(assetId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM asset_versions WHERE asset_id = ?")
      .get(assetId) as { n: number };
    return row.n;
  }

  private persistContent(assetId: string, versionId: string, content: AssetContent): void {
    const objectKey = `assets/${assetId}/versions/${versionId}/content`;
    const data = content.text
      ? Buffer.from(content.text, "utf8")
      : Buffer.from(json(content.manifest ?? {}), "utf8");
    this.storage.put(objectKey, data, content.text ? "text/plain" : "application/json");
    const mediaType = content.text
      ? content.kind === "html"
        ? "text/html"
        : "text/markdown"
      : "application/json";
    this.db
      .prepare(
        `INSERT INTO asset_blobs (id, version_id, role, object_key, content_hash, size, media_type)
         VALUES (?, ?, 'content', ?, ?, ?, ?)`,
      )
      .run(nextId("blob"), versionId, objectKey, hashBuffer(data), data.byteLength, mediaType);
  }

  getVersion(versionId: string): AssetVersion | null {
    const row = this.db.prepare("SELECT * FROM asset_versions WHERE id = ?").get(versionId) as
      | Row
      | undefined;
    return row ? mapVersion(row) : null;
  }

  listVersions(assetId: string): AssetVersion[] {
    const rows = this.db
      .prepare("SELECT * FROM asset_versions WHERE asset_id = ? ORDER BY sequence DESC")
      .all(assetId) as Row[];
    return rows.map(mapVersion);
  }

  async readContent(assetId: string, versionId?: string): Promise<AssetContent | null> {
    const asset = this.getAssetAny(assetId);
    if (!asset) return null;
    const vid = versionId ?? asset.currentVersionId;
    if (!vid) return null;
    const row = this.db
      .prepare("SELECT * FROM asset_blobs WHERE version_id = ? AND role = 'content' LIMIT 1")
      .get(vid) as Row | undefined;
    if (!row) return null;
    const data = await this.storage.get(str(row.object_key));
    if (!data) return null;
    const kind =
      str(row.media_type) === "text/markdown"
        ? "markdown"
        : str(row.media_type) === "text/html"
          ? "html"
          : "manifest";
    if (kind === "manifest") {
      return {
        kind,
        text: null,
        manifest: parse<Record<string, unknown>>(data.toString("utf8"), {}),
        refs: [],
      };
    }
    return { kind, text: data.toString("utf8"), manifest: null, refs: [] };
  }

  softDelete(actor: ActorContext, assetId: string): void {
    const now = nowIso();
    this.db
      .prepare(
        "UPDATE assets SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, now, assetId, actor.workspaceId);
  }

  restore(actor: ActorContext, assetId: string): void {
    const now = nowIso();
    this.db
      .prepare(
        "UPDATE assets SET status = 'normal', deleted_at = NULL, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, assetId, actor.workspaceId);
  }

  permanentDelete(actor: ActorContext, assetId: string): void {
    this.db
      .prepare("DELETE FROM asset_relations WHERE source_asset_id = ? OR target_asset_id = ?")
      .run(assetId, assetId);
    this.db.prepare("DELETE FROM asset_versions WHERE asset_id = ?").run(assetId);
    this.db
      .prepare("DELETE FROM assets WHERE id = ? AND workspace_id = ?")
      .run(assetId, actor.workspaceId);
  }

  addRelation(
    _workspaceId: string,
    sourceAssetId: string,
    targetAssetId: string,
    relationType: AssetRelation["relationType"],
    provenance: Record<string, unknown>,
  ): AssetRelation | null {
    const existing = this.db
      .prepare(
        "SELECT * FROM asset_relations WHERE source_asset_id = ? AND target_asset_id = ? AND relation_type = ?",
      )
      .get(sourceAssetId, targetAssetId, relationType) as Row | undefined;
    if (existing) {
      return {
        id: str(existing.id),
        sourceAssetId,
        targetAssetId,
        relationType,
        provenance: parse(existing.provenance_json, {}),
        createdAt: str(existing.created_at),
      };
    }
    const id = nextId("rel");
    this.db
      .prepare(
        "INSERT INTO asset_relations (id, source_asset_id, target_asset_id, relation_type, provenance_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, sourceAssetId, targetAssetId, relationType, json(provenance), nowIso());
    return { id, sourceAssetId, targetAssetId, relationType, provenance, createdAt: nowIso() };
  }

  listRelations(
    assetId: string,
  ): Array<{ relation: AssetRelation; asset: Asset | null; direction: "in" | "out" }> {
    const rows = this.db
      .prepare(
        `SELECT r.*, a.title AS target_title, a.type AS target_type, a.workspace_id AS target_workspace
         FROM asset_relations r
         LEFT JOIN assets a ON a.id = r.target_asset_id
         WHERE r.source_asset_id = ? OR r.target_asset_id = ?
         ORDER BY r.created_at DESC`,
      )
      .all(assetId, assetId) as Row[];
    return rows.map((r) => {
      const outgoing = str(r.source_asset_id) === assetId;
      const otherId = outgoing ? str(r.target_asset_id) : str(r.source_asset_id);
      const other = this.getAssetAny(otherId);
      return {
        relation: {
          id: str(r.id),
          sourceAssetId: str(r.source_asset_id),
          targetAssetId: str(r.target_asset_id),
          relationType: str(r.relation_type) as AssetRelation["relationType"],
          provenance: parse(r.provenance_json, {}),
          createdAt: str(r.created_at),
        },
        direction: outgoing ? ("out" as const) : ("in" as const),
        asset: other,
      };
    });
  }

  /* ---------------- tasks ---------------- */

  createTask(
    actor: ActorContext,
    input: {
      type: Task["type"];
      goal: string;
      spec: Record<string, unknown>;
      inputAssetIds?: string[] | undefined;
    },
  ): Task {
    const now = nowIso();
    const id = nextId("tsk");
    this.db
      .prepare(
        `INSERT INTO tasks (id, workspace_id, owner_subject, type, goal, status, spec_json, input_asset_ids, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
      )
      .run(
        id,
        actor.workspaceId,
        actor.subject,
        input.type,
        input.goal,
        json(input.spec),
        json(input.inputAssetIds ?? []),
        now,
        now,
      );
    return this.getTask(actor.workspaceId, id) as Task;
  }

  listTasks(
    workspaceId: string,
    opts: { status?: string; limit: number; after?: string },
  ): Paginated<Task> {
    const clauses = ["workspace_id = ?"];
    const params: unknown[] = [workspaceId];
    if (opts.status && opts.status !== "all") {
      clauses.push("status = ?");
      params.push(opts.status);
    }
    if (opts.after) {
      const [afterAt, afterId] = decodeCursor(opts.after);
      clauses.push("(created_at < ? OR (created_at = ? AND id < ?))");
      params.push(afterAt, afterAt, afterId);
    }
    const where = clauses.join(" AND ");
    const total = this.db
      .prepare(`SELECT COUNT(*) n FROM tasks WHERE ${where}`)
      .get(...(params as SQLInputValue[])) as { n: number };
    const rows = this.db
      .prepare(`SELECT * FROM tasks WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(...(params as SQLInputValue[]), opts.limit + 1) as Row[];
    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map(mapTask);
    const last = items.at(-1);
    return {
      items,
      total: total.n,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  getTask(workspaceId: string, taskId: string): Task | null {
    const row = this.db
      .prepare("SELECT * FROM tasks WHERE id = ? AND workspace_id = ?")
      .get(taskId, workspaceId) as Row | undefined;
    return row ? mapTask(row) : null;
  }

  getTaskAny(taskId: string): Task | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Row | undefined;
    return row ? mapTask(row) : null;
  }

  updateTask(
    workspaceId: string,
    taskId: string,
    patch: Partial<
      Pick<
        Task,
        | "status"
        | "progress"
        | "currentStep"
        | "plan"
        | "checkpoint"
        | "error"
        | "creditsUsed"
        | "cancelRequested"
      >
    >,
  ): Task | null {
    const current = this.getTask(workspaceId, taskId);
    if (!current) return null;
    const now = nowIso();
    const completedAt =
      patch.status &&
      ["completed", "partial_completed", "failed", "cancelled"].includes(patch.status)
        ? (current.completedAt ?? now)
        : current.completedAt;
    this.db
      .prepare(
        `UPDATE tasks SET status = ?, progress = ?, current_step = ?, plan_json = ?, checkpoint_json = ?, error = ?, credits_used = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        patch.status ?? current.status,
        patch.progress ?? current.progress,
        patch.currentStep ?? current.currentStep,
        patch.plan !== undefined ? json(patch.plan) : current.plan ? json(current.plan) : null,
        patch.checkpoint !== undefined
          ? json(patch.checkpoint)
          : current.checkpoint
            ? json(current.checkpoint)
            : null,
        patch.error !== undefined ? patch.error : current.error,
        patch.creditsUsed ?? current.creditsUsed,
        completedAt,
        now,
        taskId,
      );
    if (patch.cancelRequested !== undefined) {
      this.db
        .prepare("UPDATE tasks SET cancel_requested = ?, updated_at = ? WHERE id = ?")
        .run(patch.cancelRequested ? 1 : 0, nowIso(), taskId);
    }
    return this.getTask(workspaceId, taskId);
  }

  markTaskStarted(workspaceId: string, taskId: string): Task | null {
    const now = nowIso();
    this.db
      .prepare(
        "UPDATE tasks SET status = 'running', started_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, now, taskId, workspaceId);
    return this.getTask(workspaceId, taskId);
  }

  requestCancel(workspaceId: string, taskId: string): Task | null {
    const now = nowIso();
    this.db
      .prepare(
        "UPDATE tasks SET cancel_requested = 1, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, taskId, workspaceId);
    return this.getTask(workspaceId, taskId);
  }

  addOutput(workspaceId: string, taskId: string, assetId: string): void {
    const task = this.getTask(workspaceId, taskId);
    if (!task) return;
    const outputs = [...task.outputAssetIds];
    if (!outputs.includes(assetId)) outputs.push(assetId);
    this.db
      .prepare("UPDATE tasks SET output_asset_ids = ?, updated_at = ? WHERE id = ?")
      .run(json(outputs), nowIso(), taskId);
  }

  upsertStep(step: Omit<TaskStep, "id" | "taskId"> & { id?: string; taskId: string }): TaskStep {
    const existing = step.id
      ? (this.db.prepare("SELECT * FROM task_steps WHERE id = ?").get(step.id) as Row | undefined)
      : undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE task_steps SET status = ?, progress = ?, detail = ?, error = ?, attempt = ?, outputs_json = ?, started_at = ?, completed_at = ? WHERE id = ?`,
        )
        .run(
          step.status,
          step.progress,
          step.detail,
          step.error ?? null,
          step.attempt,
          json(step.outputs),
          step.startedAt ?? null,
          step.completedAt ?? null,
          step.id ?? "",
        );
      const row = this.db
        .prepare("SELECT * FROM task_steps WHERE id = ?")
        .get(step.id ?? "") as Row;
      return mapStep(row);
    }
    const id = step.id ?? nextId("tst");
    this.db
      .prepare(
        `INSERT INTO task_steps (id, task_id, type, status, progress, detail, error, attempt, outputs_json, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        step.taskId,
        step.type,
        step.status,
        step.progress,
        step.detail,
        step.error ?? null,
        step.attempt,
        json(step.outputs),
        step.startedAt ?? null,
        step.completedAt ?? null,
      );
    return { ...step, id, taskId: step.taskId, outputs: step.outputs };
  }

  listSteps(taskId: string): TaskStep[] {
    const rows = this.db
      .prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY started_at, id")
      .all(taskId) as Row[];
    return rows.map(mapStep);
  }

  createEvidence(
    _workspaceId: string,
    taskId: string,
    input: Omit<import("@shiguang/contracts").EvidenceItem, "id" | "taskId" | "retrievedAt">,
  ): void {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO evidence_items (id, task_id, claim, source_title, source_url, source_asset_version_id, locator, excerpt_hash, excerpt, retrieved_at, confidence, verification_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nextId("evi"),
        taskId,
        input.claim,
        input.sourceTitle,
        input.sourceUrl,
        input.sourceAssetVersionId,
        input.locator,
        input.excerptHash,
        input.excerpt,
        now,
        input.confidence,
        input.verificationStatus,
      );
  }

  listEvidence(taskId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM evidence_items WHERE task_id = ? ORDER BY retrieved_at")
      .all(taskId) as Array<Record<string, unknown>>;
  }

  /* ---------------- knowledge ---------------- */

  createKnowledgeBase(
    actor: ActorContext,
    input: { name: string; description?: string },
  ): KnowledgeBase {
    const now = nowIso();
    const id = nextId("kb");
    this.db
      .prepare(
        "INSERT INTO knowledge_bases (id, workspace_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, actor.workspaceId, input.name, input.description ?? "", now, now);
    return this.getKnowledgeBase(actor.workspaceId, id) as KnowledgeBase;
  }

  listKnowledgeBases(workspaceId: string): KnowledgeBase[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM knowledge_bases WHERE workspace_id = ? AND status = 'active' ORDER BY updated_at DESC",
      )
      .all(workspaceId) as Row[];
    return rows.map((r) => this.mapKb(r));
  }

  getKnowledgeBase(workspaceId: string, kbId: string): KnowledgeBase | null {
    const row = this.db
      .prepare("SELECT * FROM knowledge_bases WHERE id = ? AND workspace_id = ?")
      .get(kbId, workspaceId) as Row | undefined;
    return row ? this.mapKb(row) : null;
  }

  private mapKb(r: Row): KnowledgeBase {
    return {
      id: str(r.id),
      workspaceId: str(r.workspace_id),
      name: str(r.name),
      description: str(r.description),
      status: str(r.status) as KnowledgeBase["status"],
      sourceCount: num(r.source_count),
      chunkCount: num(r.chunk_count),
      createdAt: str(r.created_at),
      updatedAt: str(r.updated_at),
    };
  }

  addKnowledgeSource(
    workspaceId: string,
    kbId: string,
    input: {
      sourceType: KnowledgeSource["sourceType"];
      assetVersionId?: string | null;
      url?: string | null;
      title: string;
      contentHash?: string | null;
    },
  ): KnowledgeSource {
    const now = nowIso();
    const id = nextId("src");
    this.db
      .prepare(
        `INSERT INTO knowledge_sources (id, kb_id, workspace_id, source_type, asset_version_id, url, title, status, content_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        id,
        kbId,
        workspaceId,
        input.sourceType,
        input.assetVersionId ?? null,
        input.url ?? null,
        input.title,
        input.contentHash ?? null,
        now,
        now,
      );
    this.db
      .prepare(
        "UPDATE knowledge_bases SET source_count = source_count + 1, updated_at = ? WHERE id = ?",
      )
      .run(now, kbId);
    return this.getKnowledgeSource(kbId, id) as KnowledgeSource;
  }

  getKnowledgeSource(kbId: string, sourceId: string): KnowledgeSource | null {
    const row = this.db
      .prepare("SELECT * FROM knowledge_sources WHERE id = ? AND kb_id = ?")
      .get(sourceId, kbId) as Row | undefined;
    return row ? this.mapSource(row) : null;
  }

  listKnowledgeSources(kbId: string): KnowledgeSource[] {
    const rows = this.db
      .prepare("SELECT * FROM knowledge_sources WHERE kb_id = ? ORDER BY created_at DESC")
      .all(kbId) as Row[];
    return rows.map((r) => this.mapSource(r));
  }

  private mapSource(r: Row): KnowledgeSource {
    return {
      id: str(r.id),
      kbId: str(r.kb_id),
      workspaceId: str(r.workspace_id),
      sourceType: str(r.source_type) as KnowledgeSource["sourceType"],
      assetVersionId: r.asset_version_id === null ? null : str(r.asset_version_id),
      url: r.url === null ? null : str(r.url),
      title: str(r.title),
      status: str(r.status) as SourceStatus,
      error: r.error === null ? null : str(r.error),
      contentHash: r.content_hash === null ? null : str(r.content_hash),
      chunkCount: num(r.chunk_count),
      retryCount: num(r.retry_count),
      createdAt: str(r.created_at),
      updatedAt: str(r.updated_at),
    };
  }

  updateKnowledgeSource(
    kbId: string,
    sourceId: string,
    patch: Partial<Pick<KnowledgeSource, "status" | "error" | "contentHash" | "chunkCount">>,
  ): KnowledgeSource | null {
    const current = this.getKnowledgeSource(kbId, sourceId);
    if (!current) return null;
    this.db
      .prepare(
        "UPDATE knowledge_sources SET status = ?, error = ?, content_hash = ?, chunk_count = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        patch.status ?? current.status,
        patch.error !== undefined ? patch.error : current.error,
        patch.contentHash !== undefined ? patch.contentHash : current.contentHash,
        patch.chunkCount ?? current.chunkCount,
        nowIso(),
        sourceId,
      );
    return this.getKnowledgeSource(kbId, sourceId);
  }

  removeKnowledgeSource(kbId: string, sourceId: string): void {
    this.db.prepare("DELETE FROM knowledge_chunks WHERE source_id = ?").run(sourceId);
    this.db.prepare("DELETE FROM knowledge_sources WHERE id = ? AND kb_id = ?").run(sourceId, kbId);
    this.refreshKbCounts(kbId);
  }

  retryKnowledgeSource(kbId: string, sourceId: string): KnowledgeSource | null {
    const current = this.getKnowledgeSource(kbId, sourceId);
    if (!current) return null;
    this.db
      .prepare(
        "UPDATE knowledge_sources SET status = 'pending', error = NULL, retry_count = retry_count + 1, updated_at = ? WHERE id = ?",
      )
      .run(nowIso(), sourceId);
    return this.getKnowledgeSource(kbId, sourceId);
  }

  replaceChunks(
    kbId: string,
    sourceId: string,
    chunks: Array<
      Pick<KnowledgeChunk, "ordinal" | "headingPath" | "text" | "charStart" | "charEnd">
    >,
  ): void {
    const tx = this.db;
    tx.exec("BEGIN");
    try {
      tx.prepare("DELETE FROM knowledge_chunks WHERE source_id = ?").run(sourceId);
      const insert = tx.prepare(
        `INSERT INTO knowledge_chunks (id, kb_id, source_id, ordinal, heading_path, text, text_hash, char_start, char_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const ftsInsert = tx.prepare(
        "INSERT INTO knowledge_chunks_fts (rowid, text, heading_path) VALUES (?, ?, ?)",
      );
      for (const [i, chunk] of chunks.entries()) {
        const id = nextId("chnk");
        const hash = hashBuffer(Buffer.from(chunk.text, "utf8"));
        const info = insert.run(
          id,
          kbId,
          sourceId,
          chunk.ordinal,
          chunk.headingPath,
          chunk.text,
          hash,
          chunk.charStart,
          chunk.charEnd,
        );
        ftsInsert.run(info.lastInsertRowid, chunk.text, chunk.headingPath);
        void i;
      }
      tx.prepare(
        "UPDATE knowledge_sources SET chunk_count = ?, status = 'ready', error = NULL, updated_at = ? WHERE id = ?",
      ).run(chunks.length, nowIso(), sourceId);
      tx.exec("COMMIT");
    } catch (err) {
      tx.exec("ROLLBACK");
      throw err;
    }
    this.refreshKbCounts(kbId);
  }

  refreshKbCounts(kbId: string): void {
    const counts = this.db
      .prepare(
        "SELECT COUNT(*) AS s, COALESCE(SUM(chunk_count), 0) AS c FROM knowledge_sources WHERE kb_id = ?",
      )
      .get(kbId) as { s: number; c: number };
    this.db
      .prepare(
        "UPDATE knowledge_bases SET source_count = ?, chunk_count = ?, updated_at = ? WHERE id = ?",
      )
      .run(counts.s, counts.c, nowIso(), kbId);
  }

  searchChunks(
    kbId: string,
    query: string,
    limit = 10,
  ): Array<{ chunk: KnowledgeChunk; score: number; source: KnowledgeSource }> {
    const match = query
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t.replaceAll('"', "")}"`)
      .join(" OR ");
    let rows: Row[] = [];
    if (match) {
      rows = this.db
        .prepare(
          `SELECT k.*, bm25(knowledge_chunks_fts, 1.0, 1.0) AS score
           FROM knowledge_chunks_fts f
           JOIN knowledge_chunks k ON k.id = (SELECT id FROM knowledge_chunks WHERE rowid = f.rowid LIMIT 1)
           WHERE knowledge_chunks_fts MATCH ? AND k.kb_id = ?
           ORDER BY score LIMIT ?`,
        )
        .all(match, kbId, limit) as Row[];
    }
    if (rows.length === 0) {
      rows = this.db
        .prepare(
          "SELECT *, 0 AS score FROM knowledge_chunks WHERE kb_id = ? AND (text LIKE ? OR heading_path LIKE ?) LIMIT ?",
        )
        .all(kbId, `%${query}%`, `%${query}%`, limit) as Row[];
    }
    return rows.map((r) => {
      const source = this.getKnowledgeSource(kbId, str(r.source_id));
      return {
        chunk: {
          id: str(r.id),
          kbId,
          sourceId: str(r.source_id),
          ordinal: num(r.ordinal),
          headingPath: str(r.heading_path),
          text: str(r.text),
          textHash: str(r.text_hash),
          charStart: num(r.char_start),
          charEnd: num(r.char_end),
        },
        score: num(r.score, 0),
        source:
          source ??
          ({
            id: str(r.source_id),
            kbId,
            workspaceId: "",
            sourceType: "upload",
            title: "未知来源",
            status: "ready",
            chunkCount: 0,
            createdAt: "",
            updatedAt: "",
          } as KnowledgeSource),
      };
    });
  }

  listChunksBySource(kbId: string, sourceId: string): KnowledgeChunk[] {
    const rows = this.db
      .prepare("SELECT * FROM knowledge_chunks WHERE kb_id = ? AND source_id = ? ORDER BY ordinal")
      .all(kbId, sourceId) as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      kbId: str(r.kb_id),
      sourceId: str(r.source_id),
      ordinal: num(r.ordinal),
      headingPath: str(r.heading_path),
      text: str(r.text),
      textHash: str(r.text_hash),
      charStart: num(r.char_start),
      charEnd: num(r.char_end),
    }));
  }

  /* ---------------- datasets ---------------- */

  createDataset(actor: ActorContext, input: { name: string; description?: string }): Dataset {
    const now = nowIso();
    const id = nextId("ds");
    this.db
      .prepare(
        "INSERT INTO datasets (id, workspace_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, actor.workspaceId, input.name, input.description ?? "", now, now);
    return this.getDataset(actor.workspaceId, id) as Dataset;
  }

  createDatasetRecord(workspaceId: string, name: string, description = ""): Dataset {
    const now = nowIso();
    const id = nextId("ds");
    this.db
      .prepare(
        "INSERT INTO datasets (id, workspace_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, workspaceId, name, description, now, now);
    return this.getDataset(workspaceId, id) as Dataset;
  }

  listDatasets(workspaceId: string): Dataset[] {
    const rows = this.db
      .prepare("SELECT * FROM datasets WHERE workspace_id = ? ORDER BY updated_at DESC")
      .all(workspaceId) as Row[];
    return rows.map((r) => this.mapDataset(r));
  }

  getDataset(workspaceId: string, datasetId: string): Dataset | null {
    const row = this.db
      .prepare("SELECT * FROM datasets WHERE id = ? AND workspace_id = ?")
      .get(datasetId, workspaceId) as Row | undefined;
    return row ? this.mapDataset(row) : null;
  }

  getDatasetAny(datasetId: string): Dataset | null {
    const row = this.db.prepare("SELECT * FROM datasets WHERE id = ?").get(datasetId) as
      | Row
      | undefined;
    return row ? this.mapDataset(row) : null;
  }

  private mapDataset(r: Row): Dataset {
    return {
      id: str(r.id),
      workspaceId: str(r.workspace_id),
      name: str(r.name),
      description: str(r.description),
      currentVersionId: r.current_version_id === null ? null : str(r.current_version_id),
      status: str(r.status) as Dataset["status"],
      rowCount: num(r.row_count),
      createdAt: str(r.created_at),
      updatedAt: str(r.updated_at),
    };
  }

  addDatasetVersion(
    workspaceId: string,
    datasetId: string,
    input: {
      fileName: string;
      format: DatasetVersion["format"];
      rowCount: number;
      schema: DatasetVersion["schema"];
      profile: Record<string, unknown>;
      qualityIssues: DatasetVersion["qualityIssues"];
      objectKey?: string | null;
      contentHash?: string | null;
    },
  ): DatasetVersion {
    const now = nowIso();
    const dataset = this.getDataset(workspaceId, datasetId);
    if (!dataset) throw new Error("dataset not found");
    const versionRow = this.db
      .prepare(
        "SELECT COALESCE(MAX(version), 0) + 1 AS n FROM dataset_versions WHERE dataset_id = ?",
      )
      .get(datasetId) as { n: number };
    const version = versionRow.n;
    const id = nextId("dsv");
    this.db
      .prepare(
        `INSERT INTO dataset_versions (id, dataset_id, version, file_name, format, row_count, column_count, schema_json, profile_json, quality_json, status, object_key, content_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)`,
      )
      .run(
        id,
        datasetId,
        version,
        input.fileName,
        input.format,
        input.rowCount,
        input.schema.length,
        json(input.schema),
        json(input.profile),
        json(input.qualityIssues),
        input.objectKey ?? null,
        input.contentHash ?? null,
        now,
      );
    this.db
      .prepare(
        "UPDATE datasets SET current_version_id = ?, row_count = ?, status = 'normal', updated_at = ? WHERE id = ?",
      )
      .run(id, input.rowCount, now, datasetId);
    return this.getDatasetVersion(datasetId, id) as DatasetVersion;
  }

  getDatasetVersion(datasetId: string, versionId: string): DatasetVersion | null {
    const row = this.db
      .prepare("SELECT * FROM dataset_versions WHERE id = ? AND dataset_id = ?")
      .get(versionId, datasetId) as Row | undefined;
    return row ? this.mapDatasetVersion(row) : null;
  }

  listDatasetVersions(datasetId: string): DatasetVersion[] {
    const rows = this.db
      .prepare("SELECT * FROM dataset_versions WHERE dataset_id = ? ORDER BY version DESC")
      .all(datasetId) as Row[];
    return rows.map((r) => this.mapDatasetVersion(r));
  }

  private mapDatasetVersion(r: Row): DatasetVersion {
    return {
      id: str(r.id),
      datasetId: str(r.dataset_id),
      version: num(r.version),
      fileName: str(r.file_name),
      format: str(r.format) as DatasetVersion["format"],
      rowCount: num(r.row_count),
      columnCount: num(r.column_count),
      schema: parse<DatasetVersion["schema"]>(r.schema_json, []),
      profile: parse<Record<string, unknown>>(r.profile_json, {}),
      qualityIssues: parse<DatasetVersion["qualityIssues"]>(r.quality_json, []),
      status: str(r.status) as DatasetVersion["status"],
      error: r.error === null ? null : str(r.error),
      createdAt: str(r.created_at),
      objectKey: r.object_key === null ? null : str(r.object_key),
      contentHash: r.content_hash === null ? null : str(r.content_hash),
    };
  }

  createSavedView(
    actor: ActorContext,
    datasetId: string,
    input: { name: string; query: DatasetQuery },
  ): SavedView {
    const now = nowIso();
    const id = nextId("sv");
    this.db
      .prepare(
        "INSERT INTO dataset_saved_views (id, dataset_id, workspace_id, name, query_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, datasetId, actor.workspaceId, input.name, json(input.query), now);
    return {
      id,
      datasetId,
      workspaceId: actor.workspaceId,
      name: input.name,
      query: input.query as unknown as Record<string, unknown>,
      createdAt: now,
    };
  }

  listSavedViews(datasetId: string): SavedView[] {
    const rows = this.db
      .prepare("SELECT * FROM dataset_saved_views WHERE dataset_id = ? ORDER BY created_at DESC")
      .all(datasetId) as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      datasetId: str(r.dataset_id),
      workspaceId: str(r.workspace_id),
      name: str(r.name),
      query: parse<Record<string, unknown>>(r.query_json, {}),
      createdAt: str(r.created_at),
    }));
  }

  createChartSpec(
    actor: ActorContext,
    datasetId: string,
    input: Omit<ChartSpec, "id" | "datasetId" | "workspaceId" | "createdAt">,
  ): ChartSpec {
    const id = nextId("chrt");
    const now = nowIso();
    this.db
      .prepare(
        "INSERT INTO chart_specs (id, dataset_id, workspace_id, name, chart_type, x, y, group_by, aggregation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        datasetId,
        actor.workspaceId,
        input.name,
        input.chartType,
        input.x,
        input.y,
        input.groupBy,
        input.aggregation,
        now,
      );
    return { id, datasetId, workspaceId: actor.workspaceId, createdAt: now, ...input };
  }

  listChartSpecs(datasetId: string): ChartSpec[] {
    const rows = this.db
      .prepare("SELECT * FROM chart_specs WHERE dataset_id = ? ORDER BY created_at DESC")
      .all(datasetId) as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      datasetId: str(r.dataset_id),
      workspaceId: str(r.workspace_id),
      name: str(r.name),
      chartType: str(r.chart_type) as ChartSpec["chartType"],
      x: r.x === null ? null : str(r.x),
      y: r.y === null ? null : str(r.y),
      groupBy: r.group_by === null ? null : str(r.group_by),
      aggregation: str(r.aggregation) as ChartSpec["aggregation"],
      createdAt: str(r.created_at),
    }));
  }

  /* ---------------- templates ---------------- */

  listTemplates(workspaceId: string, type?: "research" | "presentation"): Template[] {
    const rows = type
      ? (this.db
          .prepare(
            "SELECT * FROM templates WHERE workspace_id = ? AND type = ? ORDER BY usage_count DESC, updated_at DESC",
          )
          .all(workspaceId, type) as Row[])
      : (this.db
          .prepare(
            "SELECT * FROM templates WHERE workspace_id = ? ORDER BY usage_count DESC, updated_at DESC",
          )
          .all(workspaceId) as Row[]);
    return rows.map((r) => this.mapTemplate(r));
  }

  getTemplate(workspaceId: string, templateId: string): Template | null {
    const row = this.db
      .prepare("SELECT * FROM templates WHERE id = ? AND workspace_id = ?")
      .get(templateId, workspaceId) as Row | undefined;
    return row ? this.mapTemplate(row) : null;
  }

  private mapTemplate(r: Row): Template {
    return {
      id: str(r.id),
      workspaceId: str(r.workspace_id),
      type: str(r.type) as Template["type"],
      name: str(r.name),
      description: str(r.description),
      content: parse<Record<string, unknown>>(r.content_json, {}),
      version: num(r.version, 1),
      published: bool(r.published),
      usageCount: num(r.usage_count),
      createdAt: str(r.created_at),
      updatedAt: str(r.updated_at),
    };
  }

  createTemplate(
    actor: ActorContext,
    input: {
      type: Template["type"];
      name: string;
      description?: string;
      content: Record<string, unknown>;
    },
  ): Template {
    const now = nowIso();
    const id = nextId("tpl");
    this.db
      .prepare(
        "INSERT INTO templates (id, workspace_id, type, name, description, content_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        actor.workspaceId,
        input.type,
        input.name,
        input.description ?? "",
        json(input.content),
        now,
        now,
      );
    return this.getTemplate(actor.workspaceId, id) as Template;
  }

  bumpTemplateUsage(workspaceId: string, templateId: string): void {
    this.db
      .prepare(
        "UPDATE templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(nowIso(), templateId, workspaceId);
  }

  /* ---------------- publishing ---------------- */

  createPublish(
    actor: ActorContext,
    input: {
      assetId: string;
      visibility: Publish["visibility"];
      password?: string | null;
      expiresAt?: string | null;
      allowDownload?: boolean;
      allowCopy?: boolean;
    },
  ): Publish {
    const now = nowIso();
    const id = nextId("pub");
    const slug = this.uniqueSlug();
    const shortSlug = this.uniqueSlug(6);
    const salt = randomSalt();
    const passwordHash = input.password ? hashPassword(input.password, salt) : null;
    this.db
      .prepare(
        `INSERT INTO publishes (id, workspace_id, asset_id, slug, short_slug, visibility, password_hash, password_salt, expires_at, allow_download, allow_copy, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(
        id,
        actor.workspaceId,
        input.assetId,
        slug,
        shortSlug,
        input.visibility,
        passwordHash,
        input.password ? salt : null,
        input.expiresAt ?? null,
        (input.allowDownload ?? true) ? 1 : 0,
        (input.allowCopy ?? true) ? 1 : 0,
        now,
        now,
      );
    return this.getPublish(actor.workspaceId, id) as Publish;
  }

  private uniqueSlug(length = 10): string {
    const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
    let slug = "";
    do {
      slug = Array.from(
        { length },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
      ).join("");
    } while (
      this.db.prepare("SELECT id FROM publishes WHERE slug = ? OR short_slug = ?").get(slug, slug)
    );
    return slug;
  }

  getPublish(workspaceId: string, publishId: string): Publish | null {
    const row = this.db
      .prepare("SELECT * FROM publishes WHERE id = ? AND workspace_id = ?")
      .get(publishId, workspaceId) as Row | undefined;
    return row ? this.mapPublish(row) : null;
  }

  getPublishBySlug(slug: string): Publish | null {
    const row = this.db.prepare("SELECT * FROM publishes WHERE slug = ?").get(slug) as
      | Row
      | undefined;
    return row ? this.mapPublish(row) : null;
  }

  getPublishByShortSlug(shortSlug: string): Publish | null {
    const row = this.db.prepare("SELECT * FROM publishes WHERE short_slug = ?").get(shortSlug) as
      | Row
      | undefined;
    return row ? this.mapPublish(row) : null;
  }

  listPublishes(workspaceId: string): Publish[] {
    const rows = this.db
      .prepare("SELECT * FROM publishes WHERE workspace_id = ? ORDER BY updated_at DESC")
      .all(workspaceId) as Row[];
    return rows.map((r) => this.mapPublish(r));
  }

  private mapPublish(r: Row): Publish {
    return {
      id: str(r.id),
      workspaceId: str(r.workspace_id),
      assetId: str(r.asset_id),
      slug: str(r.slug),
      shortSlug: str(r.short_slug),
      visibility: str(r.visibility) as Publish["visibility"],
      passwordHash: r.password_hash === null ? null : str(r.password_hash),
      passwordSalt: r.password_salt === null ? null : str(r.password_salt),
      expiresAt: r.expires_at === null ? null : str(r.expires_at),
      allowDownload: bool(r.allow_download),
      allowCopy: bool(r.allow_copy),
      activeReleaseId: r.active_release_id === null ? null : str(r.active_release_id),
      viewCount: num(r.view_count),
      status: str(r.status) as Publish["status"],
      createdAt: str(r.created_at),
      updatedAt: str(r.updated_at),
    };
  }

  updatePublish(
    workspaceId: string,
    publishId: string,
    patch: Partial<
      Pick<
        Publish,
        | "visibility"
        | "passwordHash"
        | "passwordSalt"
        | "expiresAt"
        | "allowDownload"
        | "allowCopy"
        | "status"
      >
    >,
  ): Publish | null {
    const current = this.getPublish(workspaceId, publishId);
    if (!current) return null;
    this.db
      .prepare(
        `UPDATE publishes SET visibility = ?, password_hash = ?, password_salt = ?, expires_at = ?, allow_download = ?, allow_copy = ?, status = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        patch.visibility ?? current.visibility,
        patch.passwordHash !== undefined ? patch.passwordHash : current.passwordHash,
        patch.passwordSalt !== undefined ? patch.passwordSalt : current.passwordSalt,
        patch.expiresAt !== undefined ? patch.expiresAt : current.expiresAt,
        (patch.allowDownload ?? current.allowDownload) ? 1 : 0,
        (patch.allowCopy ?? current.allowCopy) ? 1 : 0,
        patch.status ?? current.status,
        nowIso(),
        publishId,
      );
    return this.getPublish(workspaceId, publishId);
  }

  verifyPassword(publish: Publish, password: string): boolean {
    if (!publish.passwordHash || !publish.passwordSalt) return false;
    return hashPassword(password, publish.passwordSalt) === publish.passwordHash;
  }

  createRelease(
    publishId: string,
    input: { assetVersionId: string; manifest: Record<string, unknown> },
  ): PublishRelease {
    const now = nowIso();
    const id = nextId("rel");
    const etag = `"${hashBuffer(Buffer.from(json(input.manifest) + input.assetVersionId)).slice(0, 32)}"`;
    this.db
      .prepare(
        "INSERT INTO publish_releases (id, publish_id, asset_version_id, etag, manifest_json, status, created_at) VALUES (?, ?, ?, ?, ?, 'ready', ?)",
      )
      .run(id, publishId, input.assetVersionId, etag, json(input.manifest), now);
    return {
      id,
      publishId,
      assetVersionId: input.assetVersionId,
      etag,
      manifest: input.manifest,
      status: "ready",
      createdAt: now,
    };
  }

  setActiveRelease(workspaceId: string, publishId: string, releaseId: string): void {
    this.db
      .prepare(
        "UPDATE publishes SET active_release_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(releaseId, nowIso(), publishId, workspaceId);
  }

  getRelease(releaseId: string): PublishRelease | null {
    const row = this.db.prepare("SELECT * FROM publish_releases WHERE id = ?").get(releaseId) as
      | Row
      | undefined;
    if (!row) return null;
    return {
      id: str(row.id),
      publishId: str(row.publish_id),
      assetVersionId: str(row.asset_version_id),
      etag: str(row.etag),
      manifest: parse<Record<string, unknown>>(row.manifest_json, {}),
      status: str(row.status) as PublishRelease["status"],
      createdAt: str(row.created_at),
    };
  }

  createShortLink(publish: Publish, shortSlug: string, destination: string): ShortLink {
    const now = nowIso();
    const id = nextId("lnk");
    this.db
      .prepare(
        "INSERT INTO short_links (id, publish_id, short_slug, destination, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, publish.id, shortSlug, destination, now);
    return { id, publishId: publish.id, shortSlug, destination, revokedAt: null, createdAt: now };
  }

  getShortLink(shortSlug: string): ShortLink | null {
    const row = this.db
      .prepare("SELECT * FROM short_links WHERE short_slug = ? AND revoked_at IS NULL")
      .get(shortSlug) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row.id),
      publishId: str(row.publish_id),
      shortSlug: str(row.short_slug),
      destination: str(row.destination),
      revokedAt: null,
      createdAt: str(row.created_at),
    };
  }

  revokePublish(workspaceId: string, publishId: string): void {
    const now = nowIso();
    this.db
      .prepare(
        "UPDATE publishes SET status = 'revoked', updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, publishId, workspaceId);
  }

  recordAccessEvent(input: {
    publishId: string;
    releaseId?: string | null;
    tsBucket: string;
    referrerDomain?: string | null;
    deviceClass?: string | null;
    hashedVisitor?: string | null;
    statusCode?: number;
  }): void {
    this.db
      .prepare(
        "INSERT INTO publish_access_events (id, publish_id, release_id, ts_bucket, referrer_domain, device_class, hashed_visitor, status_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        nextId("pae"),
        input.publishId,
        input.releaseId ?? null,
        input.tsBucket,
        input.referrerDomain ?? null,
        input.deviceClass ?? null,
        input.hashedVisitor ?? null,
        input.statusCode ?? 200,
      );
    this.db
      .prepare("UPDATE publishes SET view_count = view_count + 1, updated_at = ? WHERE id = ?")
      .run(nowIso(), input.publishId);
  }

  getPublishStats(publishId: string): {
    views: number;
    daily: Array<{ day: string; views: number }>;
  } {
    const views = num(
      this.db.prepare("SELECT view_count AS v FROM publishes WHERE id = ?").get(publishId) as {
        v: number;
      },
    );
    const rows = this.db
      .prepare(
        "SELECT ts_bucket AS day, COUNT(*) AS views FROM publish_access_events WHERE publish_id = ? GROUP BY ts_bucket ORDER BY day DESC LIMIT 30",
      )
      .all(publishId) as Array<{ day: string; views: number }>;
    return { views, daily: rows };
  }

  /* ---------------- notifications ---------------- */

  createNotification(input: {
    workspaceId: string;
    subject: string;
    type: Notification["type"];
    title: string;
    body?: string;
    link?: string | null;
  }): Notification {
    const now = nowIso();
    const id = nextId("ntf");
    this.db
      .prepare(
        "INSERT INTO notifications (id, workspace_id, subject, type, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.workspaceId,
        input.subject,
        input.type,
        input.title,
        input.body ?? "",
        input.link ?? null,
        now,
      );
    return {
      id,
      workspaceId: input.workspaceId,
      subject: input.subject,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      link: input.link ?? null,
      readAt: null,
      createdAt: now,
    };
  }

  listNotifications(workspaceId: string, subject: string, limit = 50): Notification[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM notifications WHERE workspace_id = ? AND subject = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(workspaceId, subject, limit) as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      workspaceId: str(r.workspace_id),
      subject: str(r.subject),
      type: str(r.type) as Notification["type"],
      title: str(r.title),
      body: str(r.body),
      link: r.link === null ? null : str(r.link),
      readAt: r.read_at === null ? null : str(r.read_at),
      createdAt: str(r.created_at),
    }));
  }

  unreadNotificationCount(workspaceId: string, subject: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM notifications WHERE workspace_id = ? AND subject = ? AND read_at IS NULL",
      )
      .get(workspaceId, subject) as { n: number };
    return row.n;
  }

  markNotificationRead(workspaceId: string, subject: string, notificationId: string): void {
    this.db
      .prepare(
        "UPDATE notifications SET read_at = ? WHERE id = ? AND workspace_id = ? AND subject = ?",
      )
      .run(nowIso(), notificationId, workspaceId, subject);
  }

  markAllNotificationsRead(workspaceId: string, subject: string): void {
    this.db
      .prepare(
        "UPDATE notifications SET read_at = ? WHERE workspace_id = ? AND subject = ? AND read_at IS NULL",
      )
      .run(nowIso(), workspaceId, subject);
  }

  /* ---------------- billing ---------------- */

  getCreditAccount(workspaceId: string): CreditAccount | null {
    const row = this.db
      .prepare("SELECT * FROM credit_accounts WHERE workspace_id = ?")
      .get(workspaceId) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row.id),
      workspaceId: str(row.workspace_id),
      balance: num(row.balance),
      totalGranted: num(row.total_granted),
      totalUsed: num(row.total_used),
      updatedAt: str(row.updated_at),
    };
  }

  ledger(workspaceId: string, limit = 100): CreditLedgerEntry[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM credit_ledger_entries WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(workspaceId, limit) as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      workspaceId: str(r.workspace_id),
      entryType: str(r.entry_type) as CreditLedgerEntry["entryType"],
      amount: num(r.amount),
      operationId: str(r.operation_id),
      taskId: r.task_id === null ? null : str(r.task_id),
      description: str(r.description),
      createdAt: str(r.created_at),
    }));
  }

  reserveCredits(
    workspaceId: string,
    taskId: string,
    amount: number,
    operationId: string,
  ): { ok: boolean; balance: number; reserved: number } {
    const account = this.getCreditAccount(workspaceId);
    if (!account) return { ok: false, balance: 0, reserved: 0 };
    const dup = this.db
      .prepare("SELECT id FROM credit_ledger_entries WHERE operation_id = ?")
      .get(operationId);
    if (dup) {
      const res = this.db
        .prepare("SELECT amount FROM credit_reservations WHERE task_id = ?")
        .get(taskId) as { amount: number } | undefined;
      return { ok: true, balance: account.balance, reserved: res?.amount ?? amount };
    }
    if (account.balance < amount) return { ok: false, balance: account.balance, reserved: 0 };
    const now = nowIso();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          "UPDATE credit_accounts SET balance = balance - ?, total_used = total_used + ?, updated_at = ? WHERE workspace_id = ?",
        )
        .run(amount, amount, now, workspaceId);
      this.db
        .prepare(
          "INSERT INTO credit_ledger_entries (id, workspace_id, entry_type, amount, operation_id, task_id, description, created_at) VALUES (?, ?, 'reserve', ?, ?, ?, ?, ?)",
        )
        .run(nextId("led"), workspaceId, amount, operationId, taskId, "任务 Credits 预留", now);
      this.db
        .prepare(
          "INSERT INTO credit_reservations (id, workspace_id, task_id, amount, status, expires_at, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?) ON CONFLICT(task_id) DO UPDATE SET amount = excluded.amount",
        )
        .run(
          nextId("res"),
          workspaceId,
          taskId,
          amount,
          new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          now,
        );
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return {
      ok: true,
      balance: (this.getCreditAccount(workspaceId) as CreditAccount).balance,
      reserved: amount,
    };
  }

  settleCredits(workspaceId: string, taskId: string, actual: number, operationId: string): void {
    const dup = this.db
      .prepare("SELECT id FROM credit_ledger_entries WHERE operation_id = ?")
      .get(operationId);
    if (dup) return;
    const reservation = this.db
      .prepare("SELECT * FROM credit_reservations WHERE task_id = ?")
      .get(taskId) as Row | undefined;
    const reserved = reservation ? num(reservation.amount) : actual;
    const refund = Math.max(0, reserved - actual);
    const extra = Math.max(0, actual - reserved);
    const now = nowIso();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          "INSERT INTO credit_ledger_entries (id, workspace_id, entry_type, amount, operation_id, task_id, description, created_at) VALUES (?, ?, 'settle', ?, ?, ?, ?, ?)",
        )
        .run(nextId("led"), workspaceId, actual, operationId, taskId, "任务 Credits 结算", now);
      if (refund > 0) {
        this.db
          .prepare(
            "INSERT INTO credit_ledger_entries (id, workspace_id, entry_type, amount, operation_id, task_id, description, created_at) VALUES (?, ?, 'release', ?, ?, ?, ?, ?)",
          )
          .run(
            nextId("led"),
            workspaceId,
            refund,
            `op_rel_${taskId}_${now}`,
            taskId,
            "预留返还",
            now,
          );
        this.db
          .prepare(
            "UPDATE credit_accounts SET balance = balance + ?, total_used = total_used - ?, updated_at = ? WHERE workspace_id = ?",
          )
          .run(refund, refund, now, workspaceId);
      }
      if (extra > 0) {
        this.db
          .prepare(
            "UPDATE credit_accounts SET balance = balance - ?, total_used = total_used + ?, updated_at = ? WHERE workspace_id = ?",
          )
          .run(extra, extra, now, workspaceId);
      }
      this.db
        .prepare("UPDATE credit_reservations SET status = 'settled' WHERE task_id = ?")
        .run(taskId);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  usageRecords(workspaceId: string, limit = 100): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        "SELECT * FROM usage_records WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(workspaceId, limit) as Array<Record<string, unknown>>;
  }

  recordUsage(input: {
    workspaceId: string;
    taskId?: string;
    kind: string;
    amount: number;
    metadata?: Record<string, unknown>;
  }): void {
    this.db
      .prepare(
        "INSERT INTO usage_records (id, workspace_id, task_id, kind, amount, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        nextId("use"),
        input.workspaceId,
        input.taskId ?? null,
        input.kind,
        input.amount,
        json(input.metadata ?? {}),
        nowIso(),
      );
  }

  /* ---------------- tokens & mcp ---------------- */

  createApiToken(
    workspaceId: string,
    input: { name: string; scopes: Array<"read" | "write">; expiresAt?: string | null },
    secretHash: string,
  ): ApiToken {
    const now = nowIso();
    const id = nextId("tok");
    this.db
      .prepare(
        "INSERT INTO api_tokens (id, workspace_id, name, secret_hash, scopes, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        workspaceId,
        input.name,
        secretHash,
        json(input.scopes),
        input.expiresAt ?? null,
        now,
      );
    return {
      id,
      workspaceId,
      name: input.name,
      secretHash,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      lastUsedAt: null,
      createdAt: now,
    };
  }

  listApiTokens(workspaceId: string): ApiToken[] {
    const rows = this.db
      .prepare("SELECT * FROM api_tokens WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(workspaceId) as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      workspaceId: str(r.workspace_id),
      name: str(r.name),
      secretHash: str(r.secret_hash),
      scopes: parse<Array<"read" | "write">>(r.scopes, ["read"]),
      expiresAt: r.expires_at === null ? null : str(r.expires_at),
      revokedAt: r.revoked_at === null ? null : str(r.revoked_at),
      lastUsedAt: r.last_used_at === null ? null : str(r.last_used_at),
      createdAt: str(r.created_at),
    }));
  }

  getApiToken(workspaceId: string, tokenId: string): ApiToken | null {
    const row = this.db
      .prepare("SELECT * FROM api_tokens WHERE id = ? AND workspace_id = ?")
      .get(tokenId, workspaceId) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row.id),
      workspaceId: str(row.workspace_id),
      name: str(row.name),
      secretHash: str(row.secret_hash),
      scopes: parse<Array<"read" | "write">>(row.scopes, ["read"]),
      expiresAt: row.expires_at === null ? null : str(row.expires_at),
      revokedAt: row.revoked_at === null ? null : str(row.revoked_at),
      lastUsedAt: row.last_used_at === null ? null : str(row.last_used_at),
      createdAt: str(row.created_at),
    };
  }

  findApiTokenByHash(secretHash: string): ApiToken | null {
    const row = this.db
      .prepare("SELECT * FROM api_tokens WHERE secret_hash = ? AND revoked_at IS NULL")
      .get(secretHash) as Row | undefined;
    if (!row) return null;
    return this.getApiToken(str(row.workspace_id), str(row.id));
  }

  revokeApiToken(workspaceId: string, tokenId: string): void {
    this.db
      .prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND workspace_id = ?")
      .run(nowIso(), tokenId, workspaceId);
  }

  touchApiToken(tokenId: string): void {
    this.db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(nowIso(), tokenId);
  }

  getMcpConfig(workspaceId: string): McpConfig | null {
    const row = this.db
      .prepare("SELECT * FROM mcp_configs WHERE workspace_id = ?")
      .get(workspaceId) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row.id),
      workspaceId: str(row.workspace_id),
      enabled: bool(row.enabled),
      scope: str(row.scope) as McpConfig["scope"],
      scopeIds: parse<string[]>(row.scope_ids, []),
      writeEnabled: bool(row.write_enabled),
      serverUrl: str(row.server_url),
      updatedAt: str(row.updated_at),
    };
  }

  updateMcpConfig(
    workspaceId: string,
    patch: Partial<
      Pick<McpConfig, "enabled" | "scope" | "scopeIds" | "writeEnabled" | "serverUrl">
    >,
  ): McpConfig {
    const current = this.getMcpConfig(workspaceId) ?? {
      id: nextId("mcp"),
      workspaceId,
      enabled: false,
      scope: "all" as const,
      scopeIds: [],
      writeEnabled: false,
      serverUrl: "http://localhost:3001/mcp",
      updatedAt: nowIso(),
    };
    this.db
      .prepare(
        `INSERT INTO mcp_configs (id, workspace_id, enabled, scope, scope_ids, write_enabled, server_url, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET enabled = excluded.enabled, scope = excluded.scope, scope_ids = excluded.scope_ids, write_enabled = excluded.write_enabled, server_url = excluded.server_url, updated_at = excluded.updated_at`,
      )
      .run(
        current.id,
        workspaceId,
        (patch.enabled ?? current.enabled) ? 1 : 0,
        patch.scope ?? current.scope,
        json(patch.scopeIds ?? current.scopeIds),
        (patch.writeEnabled ?? current.writeEnabled) ? 1 : 0,
        patch.serverUrl ?? current.serverUrl,
        nowIso(),
      );
    return this.getMcpConfig(workspaceId) as McpConfig;
  }

  /* ---------------- audit ---------------- */

  audit(
    workspaceId: string,
    actor: string,
    action: string,
    resource: string,
    outcome: "success" | "denied" | "failed",
    metadata: Record<string, unknown> = {},
  ): void {
    this.db
      .prepare(
        "INSERT INTO audit_events (id, workspace_id, actor, action, resource, outcome, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(nextId("aud"), workspaceId, actor, action, resource, outcome, json(metadata), nowIso());
  }

  listAudit(workspaceId: string, limit = 50): AuditEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM audit_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(workspaceId, limit) as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      workspaceId: str(r.workspace_id),
      actor: str(r.actor),
      action: str(r.action),
      resource: str(r.resource),
      outcome: str(r.outcome) as AuditEvent["outcome"],
      metadata: parse<Record<string, unknown>>(r.metadata_json, {}),
      createdAt: str(r.created_at),
    }));
  }

  /* ---------------- outbox / inbox / idempotency ---------------- */

  appendOutbox(
    input: Omit<OutboxEvent, "id" | "status" | "createdAt" | "dispatchedAt">,
  ): OutboxEvent {
    const now = nowIso();
    const id = nextId("evt");
    this.db
      .prepare(
        `INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, aggregate_version, workspace_id, data_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        id,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        input.aggregateVersion,
        input.workspaceId,
        json(input.data),
        now,
      );
    return { ...input, id, status: "pending", createdAt: now, dispatchedAt: null };
  }

  claimOutbox(limit = 10, _claimTimeoutSec = 30): OutboxEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM outbox_events WHERE status = 'pending' ORDER BY created_at LIMIT ?")
      .all(limit) as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      eventType: str(r.event_type),
      aggregateType: str(r.aggregate_type),
      aggregateId: str(r.aggregate_id),
      aggregateVersion: num(r.aggregate_version, 1),
      workspaceId: str(r.workspace_id),
      data: parse<Record<string, unknown>>(r.data_json, {}),
      status: "pending",
      createdAt: str(r.created_at),
      dispatchedAt: null,
    }));
  }

  markOutboxDispatched(eventId: string): void {
    this.db
      .prepare("UPDATE outbox_events SET status = 'dispatched', dispatched_at = ? WHERE id = ?")
      .run(nowIso(), eventId);
  }

  markOutboxFailed(eventId: string): void {
    this.db.prepare("UPDATE outbox_events SET status = 'failed' WHERE id = ?").run(eventId);
  }

  hasInbox(eventId: string, consumer: string): boolean {
    const row = this.db
      .prepare("SELECT event_id FROM inbox_events WHERE event_id = ? AND consumer = ?")
      .get(eventId, consumer);
    return row !== undefined;
  }

  insertInbox(eventId: string, consumer: string): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO inbox_events (event_id, consumer, processed_at) VALUES (?, ?, ?)",
      )
      .run(eventId, consumer, nowIso());
  }

  async idempotent<T>(
    key: string,
    workspaceId: string,
    fn: () => T | Promise<T>,
  ): Promise<{ value: T; replayed: boolean }> {
    const existing = this.db
      .prepare("SELECT response_json FROM idempotency_receipts WHERE key = ? AND workspace_id = ?")
      .get(key, workspaceId) as { response_json: string } | undefined;
    if (existing) {
      return { value: parse<T>(existing.response_json, null as T), replayed: true };
    }
    const value = await fn();
    this.db
      .prepare(
        "INSERT INTO idempotency_receipts (key, workspace_id, response_json, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(key, workspaceId, json(value), nowIso());
    return { value, replayed: false };
  }

  /* ---------------- git connections ---------------- */

  createGitConnection(
    workspaceId: string,
    input: {
      name: string;
      provider: string;
      repoUrl: string;
      branch: string;
      syncPath: string;
      localDir?: string;
    },
  ): Record<string, unknown> {
    const now = nowIso();
    const id = nextId("git");
    this.db
      .prepare(
        `INSERT INTO git_connections (id, workspace_id, name, provider, repo_url, branch, sync_path, local_dir, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?)`,
      )
      .run(
        id,
        workspaceId,
        input.name,
        input.provider,
        input.repoUrl,
        input.branch,
        input.syncPath,
        input.localDir ?? null,
        now,
        now,
      );
    return this.getGitConnection(workspaceId, id) as Record<string, unknown>;
  }

  listGitConnections(workspaceId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM git_connections WHERE workspace_id = ? ORDER BY updated_at DESC")
      .all(workspaceId) as Array<Record<string, unknown>>;
  }

  getGitConnection(workspaceId: string, id: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT * FROM git_connections WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as Row | undefined;
    return row ?? null;
  }

  updateGitConnection(
    workspaceId: string,
    id: string,
    patch: Partial<{
      status: string;
      lastSyncAt: string | null;
      lastSyncStatus: string | null;
      lastError: string | null;
      localDir: string | null;
    }>,
  ): Record<string, unknown> | null {
    const current = this.getGitConnection(workspaceId, id);
    if (!current) return null;
    this.db
      .prepare(
        `UPDATE git_connections SET status = ?, last_sync_at = ?, last_sync_status = ?, last_error = ?, local_dir = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        String(patch.status ?? current.status),
        patch.lastSyncAt !== undefined ? patch.lastSyncAt : (current.last_sync_at as string | null),
        patch.lastSyncStatus !== undefined
          ? patch.lastSyncStatus
          : (current.last_sync_status as string | null),
        patch.lastError !== undefined ? patch.lastError : (current.last_error as string | null),
        patch.localDir !== undefined ? patch.localDir : (current.local_dir as string | null),
        nowIso(),
        id,
      );
    return this.getGitConnection(workspaceId, id);
  }

  deleteGitConnection(workspaceId: string, id: string): void {
    this.db
      .prepare("DELETE FROM git_connections WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
  }

  /* ---------------- custom domains ---------------- */

  createCustomDomain(workspaceId: string, domain: string): Record<string, unknown> {
    const now = nowIso();
    const id = nextId("dom");
    const token = `sg-verify-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    this.db
      .prepare(
        `INSERT INTO custom_domains (id, workspace_id, domain, verification_token, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(id, workspaceId, domain.toLowerCase(), token, now, now);
    return this.getCustomDomain(workspaceId, id) as Record<string, unknown>;
  }

  listCustomDomains(workspaceId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM custom_domains WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(workspaceId) as Array<Record<string, unknown>>;
  }

  getCustomDomain(workspaceId: string, id: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT * FROM custom_domains WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as Row | undefined;
    return row ?? null;
  }

  getCustomDomainByDomain(domain: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT * FROM custom_domains WHERE domain = ?")
      .get(domain.toLowerCase()) as Row | undefined;
    return row ?? null;
  }

  verifyCustomDomain(workspaceId: string, id: string, token: string): boolean {
    const domain = this.getCustomDomain(workspaceId, id);
    if (!domain) return false;
    if (String(domain.verification_token) !== token) return false;
    this.db
      .prepare(
        "UPDATE custom_domains SET status = 'verified', verified_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(nowIso(), nowIso(), id);
    return true;
  }

  bindDomainPublish(workspaceId: string, id: string, publishId: string | null): void {
    this.db
      .prepare(
        "UPDATE custom_domains SET publish_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(publishId, nowIso(), id, workspaceId);
  }

  deleteCustomDomain(workspaceId: string, id: string): void {
    this.db
      .prepare("DELETE FROM custom_domains WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
  }

  /* ---------------- task schedules ---------------- */

  createSchedule(
    workspaceId: string,
    input: {
      name: string;
      taskType: string;
      goal: string;
      spec: Record<string, unknown>;
      cron: string;
    },
  ): Record<string, unknown> {
    const now = nowIso();
    const id = nextId("sch");
    const next = computeNextCron(input.cron, new Date());
    this.db
      .prepare(
        `INSERT INTO task_schedules (id, workspace_id, name, task_type, goal, spec_json, cron, enabled, next_run_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        id,
        workspaceId,
        input.name,
        input.taskType,
        input.goal,
        json(input.spec),
        input.cron,
        next,
        now,
        now,
      );
    return this.getSchedule(workspaceId, id) as Record<string, unknown>;
  }

  listSchedules(workspaceId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM task_schedules WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(workspaceId) as Array<Record<string, unknown>>;
  }

  getSchedule(workspaceId: string, id: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT * FROM task_schedules WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as Row | undefined;
    return row ?? null;
  }

  updateSchedule(
    workspaceId: string,
    id: string,
    patch: Partial<{
      enabled: boolean;
      name: string;
      goal: string;
      cron: string;
      spec: Record<string, unknown>;
    }>,
  ): Record<string, unknown> | null {
    const current = this.getSchedule(workspaceId, id);
    if (!current) return null;
    const enabled = patch.enabled ?? bool(current.enabled);
    const cron = patch.cron ?? str(current.cron);
    const nextRunAt =
      patch.enabled !== undefined || patch.cron !== undefined
        ? enabled
          ? computeNextCron(cron, new Date())
          : null
        : (current.next_run_at as string | null);
    this.db
      .prepare(
        `UPDATE task_schedules SET name = ?, goal = ?, spec_json = ?, cron = ?, enabled = ?, next_run_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        String(patch.name ?? current.name),
        String(patch.goal ?? current.goal),
        json(patch.spec ?? parse<Record<string, unknown>>(current.spec_json, {})),
        cron,
        enabled ? 1 : 0,
        nextRunAt,
        nowIso(),
        id,
      );
    return this.getSchedule(workspaceId, id);
  }

  deleteSchedule(workspaceId: string, id: string): void {
    this.db
      .prepare("DELETE FROM task_schedules WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
  }

  getDueSchedules(): Array<Record<string, unknown>> {
    const now = nowIso();
    return this.db
      .prepare(
        "SELECT * FROM task_schedules WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at LIMIT 10",
      )
      .all(now) as Array<Record<string, unknown>>;
  }

  markScheduleRun(id: string): void {
    const schedule = this.db.prepare("SELECT * FROM task_schedules WHERE id = ?").get(id) as
      | Row
      | undefined;
    if (!schedule) return;
    const next = computeNextCron(str(schedule.cron), new Date());
    this.db
      .prepare(
        "UPDATE task_schedules SET last_run_at = ?, next_run_at = ?, run_count = run_count + 1, updated_at = ? WHERE id = ?",
      )
      .run(nowIso(), next, nowIso(), id);
  }

  /* ---------------- workspace members & ACL ---------------- */

  listMembers(workspaceId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM workspace_members WHERE workspace_id = ? ORDER BY created_at")
      .all(workspaceId) as Array<Record<string, unknown>>;
  }

  addMember(
    workspaceId: string,
    subject: string,
    role: string,
    invitedBy: string,
  ): Record<string, unknown> {
    this.db
      .prepare(
        `INSERT INTO workspace_members (id, workspace_id, subject, role, status, invited_by, created_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)
         ON CONFLICT(workspace_id, subject) DO UPDATE SET role = excluded.role`,
      )
      .run(nextId("mem"), workspaceId, subject, role, invitedBy, nowIso());
    return this.listMembers(workspaceId).find((m) => m.subject === subject) as Record<
      string,
      unknown
    >;
  }

  updateMemberRole(workspaceId: string, subject: string, role: string): void {
    this.db
      .prepare("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND subject = ?")
      .run(role, workspaceId, subject);
  }

  removeMember(workspaceId: string, subject: string): void {
    this.db
      .prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND subject = ?")
      .run(workspaceId, subject);
  }

  grantAcl(assetId: string, principalType: string, principalId: string, role: string): void {
    this.db
      .prepare(
        `INSERT INTO asset_acl (id, asset_id, principal_type, principal_id, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(asset_id, principal_type, principal_id) DO UPDATE SET role = excluded.role`,
      )
      .run(nextId("acl"), assetId, principalType, principalId, role, nowIso());
  }

  listAcl(assetId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare("SELECT * FROM asset_acl WHERE asset_id = ? ORDER BY created_at")
      .all(assetId) as Array<Record<string, unknown>>;
  }

  revokeAcl(assetId: string, principalType: string, principalId: string): void {
    this.db
      .prepare(
        "DELETE FROM asset_acl WHERE asset_id = ? AND principal_type = ? AND principal_id = ?",
      )
      .run(assetId, principalType, principalId);
  }

  canAccess(workspaceId: string, assetId: string, subject: string, needWrite: boolean): boolean {
    const asset = this.getAsset(workspaceId, assetId);
    if (!asset) return false;
    if (asset.ownerSubject === subject) return true;
    const member = this.db
      .prepare(
        "SELECT role FROM workspace_members WHERE workspace_id = ? AND subject = ? AND status = 'active'",
      )
      .get(workspaceId, subject) as { role: string } | undefined;
    if (member) {
      if (!needWrite && ["admin", "editor", "viewer"].includes(member.role)) return true;
      if (needWrite && ["admin", "editor"].includes(member.role)) return true;
    }
    const acl = this.db
      .prepare(
        "SELECT role FROM asset_acl WHERE asset_id = ? AND principal_id = ? AND principal_type = 'user'",
      )
      .get(assetId, subject) as { role: string } | undefined;
    if (acl) {
      if (!needWrite && ["editor", "viewer"].includes(acl.role)) return true;
      if (needWrite && acl.role === "editor") return true;
    }
    if (!needWrite && ["public", "link", "unlisted"].includes(asset.visibility)) return true;
    return false;
  }

  /* ---------------- proposed patches (AI) ---------------- */

  createProposedPatch(input: {
    assetId: string;
    baseVersionId: string;
    selection: string;
    action: string;
    proposed: string;
  }): string {
    const id = nextId("pat");
    this.db
      .prepare(
        "INSERT INTO proposed_patches (id, asset_id, base_version_id, selection, action, proposed, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
      )
      .run(
        id,
        input.assetId,
        input.baseVersionId,
        input.selection,
        input.action,
        input.proposed,
        nowIso(),
      );
    return id;
  }

  getProposedPatch(assetId: string, patchId: string): Record<string, unknown> | null {
    const row = this.db
      .prepare("SELECT * FROM proposed_patches WHERE id = ? AND asset_id = ?")
      .get(patchId, assetId) as Row | undefined;
    return row ?? null;
  }

  applyProposedPatch(assetId: string, patchId: string): string | null {
    const patch = this.getProposedPatch(assetId, patchId);
    if (!patch) return null;
    this.db.prepare("UPDATE proposed_patches SET status = 'applied' WHERE id = ?").run(patchId);
    return str(patch.proposed);
  }

  getDb(): DatabaseSync {
    return this.db;
  }

  getStorage(): ObjectStore {
    return this.storage;
  }
}

/* ---------------- helpers ---------------- */

function decodeCursor(cursor: string): [string, string] {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.lastIndexOf("|");
    return [raw.slice(0, sep), raw.slice(sep + 1)];
  } catch {
    return ["", ""];
  }
}

function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(`${updatedAt}|${id}`, "utf8").toString("base64url");
}

export function randomSalt(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export function computeNextCron(cron: string, after: Date): string {
  const trimmed = cron.trim().toLowerCase();
  if (trimmed === "hourly") {
    const next = new Date(after.getTime());
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next.toISOString();
  }
  const daily = /^daily\s+(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (daily) {
    const hour = Number(daily[1]);
    const minute = Number(daily[2]);
    const next = new Date(after.getTime());
    next.setHours(hour, minute, 0, 0);
    if (next.getTime() <= after.getTime()) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  const every = /^every\s+(\d+)\s*(h|hour|hours|m|min|mins|minute|minutes)$/.exec(trimmed);
  if (every) {
    const amount = Number(every[1]);
    const unitMs = every[2]?.startsWith("h") ? 3600_000 : 60_000;
    return new Date(after.getTime() + amount * unitMs).toISOString();
  }
  const fields = cron.trim().split(/\s+/);
  if (fields.length === 5) {
    const start = after.getTime() + 60_000;
    for (let offset = 0; offset < 2 * 24 * 60; offset += 1) {
      const candidate = new Date(start + offset * 60_000);
      if (
        matchCronField(fields[0], candidate.getMinutes()) &&
        matchCronField(fields[1], candidate.getHours()) &&
        matchCronField(fields[2], candidate.getDate()) &&
        matchCronField(fields[3], candidate.getMonth() + 1) &&
        matchCronField(fields[4], candidate.getDay())
      ) {
        return candidate.toISOString();
      }
    }
  }
  return new Date(after.getTime() + 24 * 3600_000).toISOString();
}

function matchCronField(field: string | undefined, value: number): boolean {
  if (!field || field === "*") return true;
  for (const part of field.split(",")) {
    const stepMatch = /^\*\/(\d+)$/.exec(part);
    if (stepMatch) {
      if (value % Number(stepMatch[1]) === 0) return true;
      continue;
    }
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      if (value >= Number(range[1]) && value <= Number(range[2])) return true;
      continue;
    }
    if (Number(part) === value) return true;
  }
  return false;
}

export function createStore(db: DatabaseSync, storage: ObjectStore): Store {
  return new Store(db, storage);
}

export type { DatasetQuery, DatasetQueryResult, PresentationDocument, ResearchSpec };
