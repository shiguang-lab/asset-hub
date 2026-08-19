import { createHash } from "node:crypto";
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
import type { Db } from "./db.js";
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

// Personal and organization workspaces share the initial 100 MB quota.
// Subscription-based expansion can replace this workspace-level policy later.
export const DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024;

function relationSources(provenance: Record<string, unknown>): string[] {
  const raw = provenance.sources;
  if (!Array.isArray(raw)) return [];
  return raw.filter((source): source is string => typeof source === "string");
}

function mergeProvenance(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  const existingSources = relationSources(existing);
  const incomingSources = relationSources(incoming);
  // 历史遗留 `{}` 全部来自附件路径；合并时保持该语义，避免把附件关系误判为纯正文引用。
  const base = existingSources.length === 0 ? ["attachment"] : existingSources;
  merged.sources = [...new Set([...base, ...incomingSources])];
  for (const [key, value] of Object.entries(incoming)) {
    if (key !== "sources") merged[key] = value;
  }
  return merged;
}

function mapAsset(r: Row): Asset {
  const ownerDisplayName = str(r.owner_display_name).trim();
  return {
    id: str(r.id),
    workspaceId: str(r.workspace_id),
    ownerSubject: str(r.owner_subject),
    ...(ownerDisplayName ? { ownerDisplayName } : {}),
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

function contentVersionInfo(content: AssetContent | undefined): {
  hash: string;
  size: number;
  mediaType: string;
} {
  if (content?.text !== null && content?.text !== undefined) {
    const data = Buffer.from(content.text, "utf8");
    return {
      hash: hashBuffer(data),
      size: data.byteLength,
      mediaType: content.kind === "html" ? "text/html" : "text/markdown",
    };
  }
  const ref = content?.refs?.find((item) => item.role === "content") ?? content?.refs?.[0];
  if (content?.kind === "blob" && ref) {
    return { hash: ref.contentHash, size: ref.size, mediaType: ref.mediaType };
  }
  const data = Buffer.from(json(content?.manifest ?? {}), "utf8");
  return { hash: hashBuffer(data), size: data.byteLength, mediaType: "application/json" };
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

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export class Store {
  constructor(
    private readonly db: Db,
    private readonly storage: ObjectStore,
  ) {}

  /* ---------------- workspaces & users ---------------- */

  async getWorkspaceBySubject(subject: string): Promise<Workspace | null> {
    const row = (await this.db
      .prepare("SELECT * FROM workspaces WHERE owner_subject = ? AND type = 'personal' LIMIT 1")
      .get(subject)) as Row | undefined;
    if (!row) return null;
    return {
      id: str(row.id),
      type: str(row.type) as Workspace["type"],
      ownerSubject: str(row.owner_subject),
      name: str(row.name),
      createdAt: str(row.created_at),
    };
  }

  async ensurePersonalWorkspace(subject: string): Promise<Workspace> {
    const existing = await this.getWorkspaceBySubject(subject);
    if (existing) {
      await this.db
        .prepare("UPDATE workspaces SET external_id = COALESCE(external_id, ?) WHERE id = ?")
        .run(`user:${subject}`, existing.id);
      return existing;
    }
    const id = `wsp_${createHash("sha256").update(`user:${subject}`).digest("hex").slice(0, 24)}`;
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO workspaces (id, type, external_id, owner_subject, name, created_at)
         VALUES (?, 'personal', ?, ?, '个人空间', ?)
         ON CONFLICT (id) DO NOTHING`,
      )
      .run(id, `user:${subject}`, subject, now);
    await this.ensureWorkspaceCreditAccount(id);
    return (await this.getWorkspaceBySubject(subject)) as Workspace;
  }

  async ensureTeamWorkspace(input: {
    externalId: string;
    subject: string;
    role: Exclude<WorkspaceRole, "owner">;
    name?: string;
  }): Promise<Workspace> {
    const externalId = `org:${input.externalId}`;
    const id = `wsp_${createHash("sha256").update(externalId).digest("hex").slice(0, 24)}`;
    const now = nowIso();
    await this.db
      .prepare(
        `INSERT INTO workspaces (id, type, external_id, owner_subject, name, created_at)
         VALUES (?, 'team', ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = CASE
           WHEN excluded.name = '' THEN workspaces.name ELSE excluded.name END`,
      )
      .run(id, externalId, externalId, input.name?.trim() || "Group 空间", now);
    await this.db
      .prepare(
        `INSERT INTO workspace_members (id, workspace_id, subject, role, status, invited_by, created_at)
         VALUES (?, ?, ?, ?, 'active', 'identity-provider', ?)
         ON CONFLICT(workspace_id, subject) DO UPDATE SET role = excluded.role, status = 'active'`,
      )
      .run(nextId("mem"), id, input.subject, input.role, now);
    await this.ensureWorkspaceCreditAccount(id);
    return (await this.getWorkspace(id)) as Workspace;
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    const row = (await this.db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId)) as
      | Row
      | undefined;
    if (!row) return null;
    return {
      id: str(row.id),
      type: str(row.type) as Workspace["type"],
      ownerSubject: str(row.owner_subject),
      name: str(row.name),
      createdAt: str(row.created_at),
    };
  }

  async getWorkspaceRole(workspaceId: string, subject: string): Promise<WorkspaceRole | null> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) return null;
    if (workspace.type === "personal") {
      return workspace.ownerSubject === subject ? "owner" : null;
    }
    const member = (await this.db
      .prepare(
        "SELECT role FROM workspace_members WHERE workspace_id = ? AND subject = ? AND status = 'active'",
      )
      .get(workspaceId, subject)) as { role: string } | undefined;
    return member && ["admin", "editor", "viewer"].includes(member.role)
      ? (member.role as WorkspaceRole)
      : null;
  }

  private async ensureWorkspaceCreditAccount(workspaceId: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO credit_accounts (id, workspace_id, balance, total_granted, total_used, updated_at)
         VALUES (?, ?, 0, 0, 0, ?)
         ON CONFLICT (workspace_id) DO NOTHING`,
      )
      .run(nextId("acc"), workspaceId, nowIso());
  }

  async getWorkspaceOwnerSubject(workspaceId: string): Promise<string | null> {
    const row = (await this.db
      .prepare("SELECT owner_subject FROM workspaces WHERE id = ?")
      .get(workspaceId)) as { owner_subject: string } | undefined;
    return row?.owner_subject ?? null;
  }

  async ensureUser(actor: {
    subject: string;
    workspaceId: string;
    displayName?: string;
    email?: string;
  }): Promise<UserProfile> {
    const now = nowIso();
    const displayName = actor.displayName?.trim();
    const email = actor.email?.trim();
    const existing = (await this.db
      .prepare("SELECT * FROM users WHERE subject = ?")
      .get(actor.subject)) as Row | undefined;
    if (existing) {
      if (
        (displayName && displayName !== str(existing.name)) ||
        (email && email !== str(existing.email))
      ) {
        await this.db
          .prepare(
            `UPDATE users
             SET name = COALESCE(NULLIF(?, ''), name),
                 email = COALESCE(NULLIF(?, ''), email)
             WHERE subject = ?`,
          )
          .run(displayName ?? "", email ?? "", actor.subject);
        return (await this.getUserProfile(actor.subject)) as UserProfile;
      }
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
    await this.db
      .prepare(
        "INSERT INTO users (subject, workspace_id, name, email, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(actor.subject, actor.workspaceId, displayName || "新用户", email || null, now);
    const profile = await this.ensureUser(actor);
    return profile;
  }

  async getUserProfile(subject: string): Promise<UserProfile | null> {
    const row = (await this.db.prepare("SELECT * FROM users WHERE subject = ?").get(subject)) as
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

  async updateUserProfile(
    subject: string,
    patch: Partial<
      Pick<UserProfile, "name" | "defaultQuality" | "defaultLanguage" | "notifyEmail" | "avatarUrl">
    >,
  ): Promise<UserProfile> {
    const current = await this.getUserProfile(subject);
    if (!current) throw new Error("user not found");
    await this.db
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
    return (await this.getUserProfile(subject)) as UserProfile;
  }

  /* ---------------- assets ---------------- */

  async listAssets(
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
      subject?: string;
      workspaceRole?: WorkspaceRole;
    },
  ): Promise<Paginated<Asset>> {
    const clauses = ["a.workspace_id = ?"];
    const params: unknown[] = [workspaceId];
    if (
      opts.subject &&
      opts.workspaceRole &&
      opts.workspaceRole !== "owner" &&
      opts.workspaceRole !== "admin"
    ) {
      clauses.push(
        `(a.owner_subject = ? OR a.visibility IN ('member_only', 'link', 'public', 'unlisted') OR EXISTS (
          SELECT 1 FROM asset_acl acl
          WHERE acl.asset_id = a.id AND acl.principal_type = 'user' AND acl.principal_id = ?
        ))`,
      );
      params.push(opts.subject, opts.subject);
    }
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
    const totalRow = (await this.db
      .prepare(`SELECT COUNT(*) AS n FROM assets a WHERE ${where}`)
      .get(...(params as unknown[]))) as { n: number };
    const rows = (await this.db
      .prepare(
        `SELECT a.*, owner_user.name AS owner_display_name
         FROM assets a
         LEFT JOIN users owner_user ON owner_user.subject = a.owner_subject
         WHERE ${where}
         ORDER BY a.updated_at DESC, a.id DESC LIMIT ?`,
      )
      .all(...(params as unknown[]), opts.limit + 1)) as Row[];
    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map(mapAsset);
    const last = items.at(-1);
    return {
      items,
      total: totalRow.n,
      nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
    };
  }

  async getStorageUsage(workspaceId: string): Promise<{ usedBytes: number; quotaBytes: number }> {
    const row = (await this.db
      .prepare(
        `SELECT COALESCE(SUM(ab.size), 0) AS used_bytes
         FROM asset_blobs ab
         JOIN asset_versions av ON av.id = ab.version_id
         JOIN assets a ON a.id = av.asset_id
         WHERE a.workspace_id = ?`,
      )
      .get(workspaceId)) as { used_bytes?: number };
    return {
      usedBytes: Number(row?.used_bytes ?? 0),
      // Workspace quota is a product limit, while usedBytes is measured from stored blobs.
      quotaBytes: DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES,
    };
  }

  async getAsset(workspaceId: string, assetId: string): Promise<Asset | null> {
    const row = (await this.db
      .prepare(
        `SELECT a.*, owner_user.name AS owner_display_name
         FROM assets a
         LEFT JOIN users owner_user ON owner_user.subject = a.owner_subject
         WHERE a.id = ? AND a.workspace_id = ?`,
      )
      .get(assetId, workspaceId)) as Row | undefined;
    return row ? mapAsset(row) : null;
  }

  async getAssetAny(assetId: string): Promise<Asset | null> {
    const row = (await this.db
      .prepare(
        `SELECT a.*, owner_user.name AS owner_display_name
         FROM assets a
         LEFT JOIN users owner_user ON owner_user.subject = a.owner_subject
         WHERE a.id = ?`,
      )
      .get(assetId)) as Row | undefined;
    return row ? mapAsset(row) : null;
  }

  async getAssetBlob(
    workspaceId: string,
    assetId: string,
    versionId?: string,
  ): Promise<{
    objectKey: string;
    contentHash: string;
    size: number;
    mediaType: string;
  } | null> {
    const asset = await this.getAsset(workspaceId, assetId);
    if (!asset) return null;
    const currentVersionId = versionId ?? asset.currentVersionId;
    if (!currentVersionId) return null;
    const row = (await this.db
      .prepare(
        "SELECT object_key, content_hash, size, media_type FROM asset_blobs WHERE version_id = ? AND role = 'content' LIMIT 1",
      )
      .get(currentVersionId)) as Row | undefined;
    if (!row) return null;
    return {
      objectKey: str(row.object_key),
      contentHash: str(row.content_hash),
      size: num(row.size),
      mediaType: str(row.media_type, "application/octet-stream"),
    };
  }

  async listAssetBlobKeys(workspaceId: string, assetId: string): Promise<string[]> {
    const asset = await this.getAsset(workspaceId, assetId);
    if (!asset) return [];
    const rows = (await this.db
      .prepare(
        `SELECT b.object_key
         FROM asset_blobs b
         JOIN asset_versions v ON v.id = b.version_id
         WHERE v.asset_id = ?`,
      )
      .all(assetId)) as Row[];
    return rows.map((row) => str(row.object_key)).filter(Boolean);
  }

  async searchAssets(
    workspaceId: string,
    query: string,
    limit = 20,
    access?: { subject: string; workspaceRole: WorkspaceRole },
  ): Promise<Asset[]> {
    const accessClause =
      access && access.workspaceRole !== "owner" && access.workspaceRole !== "admin"
        ? ` AND (a.owner_subject = ? OR a.visibility IN ('member_only', 'link', 'public', 'unlisted') OR EXISTS (
             SELECT 1 FROM asset_acl acl
             WHERE acl.asset_id = a.id AND acl.principal_type = 'user' AND acl.principal_id = ?
           ))`
        : "";
    const params: unknown[] = [workspaceId];
    if (access && accessClause) params.push(access.subject, access.subject);
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, limit);
    const rows = (await this.db
      .prepare(
        `SELECT a.*, owner_user.name AS owner_display_name FROM assets a
         LEFT JOIN users owner_user ON owner_user.subject = a.owner_subject
         WHERE a.workspace_id = ? AND a.deleted_at IS NULL
           ${accessClause}
           AND (a.title LIKE ? OR a.description LIKE ? OR a.tags_json LIKE ?)
         ORDER BY a.updated_at DESC LIMIT ?`,
      )
      .all(...params)) as Row[];
    return rows.map(mapAsset);
  }

  async createAsset(
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
  ): Promise<Asset> {
    const now = nowIso();
    const id = nextId("ast");
    const versionId = nextId("av");
    const info = contentVersionInfo(input.content);
    await this.db
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
    await this.db
      .prepare(
        `INSERT INTO asset_versions (id, asset_id, sequence, change_kind, content_hash, size, media_type, metadata_json, created_at)
         VALUES (?, ?, 1, 'create', ?, ?, ?, ?, ?)`,
      )
      .run(versionId, id, info.hash, info.size, info.mediaType, json(input.metadata ?? {}), now);
    if (input.content) {
      await this.persistContent(id, versionId, input.content);
    }
    return (await this.getAsset(actor.workspaceId, id)) as Asset;
  }

  async createAssetWithVersion(
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
  ): Promise<{ asset: Asset; versionId: string }> {
    const asset = await this.createAsset(actor, input);
    if (input.relation) {
      await this.addRelation(
        actor.workspaceId,
        input.relation.sourceAssetId,
        asset.id,
        input.relation.relationType as AssetRelation["relationType"],
        {},
      );
    }
    return { asset, versionId: asset.currentVersionId ?? "" };
  }

  async saveContent(
    actor: ActorContext,
    assetId: string,
    content: AssetContent,
    opts: {
      changeKind?: AssetVersion["changeKind"];
      metadata?: Record<string, unknown>;
      title?: string;
      expectedLockVersion?: number;
    } = {},
  ): Promise<{ asset: Asset; version: AssetVersion }> {
    const asset = await this.getAsset(actor.workspaceId, assetId);
    if (!asset) throw new Error("asset not found");
    if (opts.expectedLockVersion !== undefined && asset.lockVersion !== opts.expectedLockVersion) {
      const err = new Error("版本冲突：文档已被其他会话修改") as Error & { code?: string };
      err.code = "ASSET_VERSION_CONFLICT";
      throw err;
    }
    const now = nowIso();
    const versionId = nextId("av");
    const sequence = await this.nextVersionSequence(assetId);
    const info = contentVersionInfo(content);
    await this.db
      .prepare(
        `INSERT INTO asset_versions (id, asset_id, sequence, change_kind, content_hash, size, media_type, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        versionId,
        assetId,
        sequence,
        opts.changeKind ?? "edit",
        info.hash,
        info.size,
        info.mediaType,
        json(opts.metadata ?? {}),
        now,
      );
    await this.persistContent(assetId, versionId, content);
    await this.db
      .prepare(
        `UPDATE assets SET current_version_id = ?, lock_version = lock_version + 1, updated_at = ?, title = ?, status = CASE WHEN status = 'error' THEN 'normal' ELSE status END WHERE id = ?`,
      )
      .run(versionId, now, opts.title ?? asset.title, assetId);
    const updated = (await this.getAsset(actor.workspaceId, assetId)) as Asset;
    const version = (await this.getVersion(versionId)) as AssetVersion;
    return { asset: updated, version };
  }

  async updateAssetMeta(
    actor: ActorContext,
    assetId: string,
    patch: Partial<Pick<Asset, "title" | "description" | "tags" | "visibility" | "status">>,
    expectedLockVersion?: number,
  ): Promise<Asset | null> {
    const asset = await this.getAsset(actor.workspaceId, assetId);
    if (!asset) return null;
    if (expectedLockVersion !== undefined && asset.lockVersion !== expectedLockVersion) {
      const err = new Error("版本冲突：资源已被其他会话修改") as Error & { code?: string };
      err.code = "ASSET_VERSION_CONFLICT";
      throw err;
    }
    const now = nowIso();
    await this.db
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
    return await this.getAsset(actor.workspaceId, assetId);
  }

  async setAssetPublishedUrl(
    workspaceId: string,
    assetId: string,
    publishedUrl: string | null,
    expectedCurrentUrl?: string,
  ): Promise<void> {
    const now = nowIso();
    if (expectedCurrentUrl !== undefined) {
      await this.db
        .prepare(
          "UPDATE assets SET published_url = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND published_url = ?",
        )
        .run(publishedUrl, now, assetId, workspaceId, expectedCurrentUrl);
      return;
    }
    await this.db
      .prepare(
        "UPDATE assets SET published_url = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(publishedUrl, now, assetId, workspaceId);
  }

  async batchUpdateAssets(
    actor: ActorContext,
    ids: string[],
    action: "delete" | "restore" | "tag",
    tags?: string[],
  ): Promise<number> {
    const now = nowIso();
    let changed = 0;
    for (const id of ids) {
      const asset = await this.getAsset(actor.workspaceId, id);
      if (!asset) continue;
      if (action === "delete") await this.softDelete(actor, id);
      if (action === "restore") await this.restore(actor, id);
      if (action === "tag") {
        await this.db
          .prepare("UPDATE assets SET tags_json = ?, updated_at = ? WHERE id = ?")
          .run(json(Array.from(new Set([...(tags ?? []), ...asset.tags]))), now, id);
      }
      changed += 1;
    }
    return changed;
  }

  private async nextVersionSequence(assetId: string): Promise<number> {
    const row = (await this.db
      .prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM asset_versions WHERE asset_id = ?")
      .get(assetId)) as { n: number };
    return row.n;
  }

  private async persistContent(
    assetId: string,
    versionId: string,
    content: AssetContent,
  ): Promise<void> {
    const ref = content.refs.find((item) => item.role === "content") ?? content.refs[0];
    if (content.kind === "blob" && ref) {
      await this.db
        .prepare(
          `INSERT INTO asset_blobs (id, version_id, role, object_key, content_hash, size, media_type)
           VALUES (?, ?, 'content', ?, ?, ?, ?)`,
        )
        .run(nextId("blob"), versionId, ref.objectKey, ref.contentHash, ref.size, ref.mediaType);
      return;
    }
    const objectKey = `assets/${assetId}/versions/${versionId}/content`;
    const data = content.text
      ? Buffer.from(content.text, "utf8")
      : Buffer.from(json(content.manifest ?? {}), "utf8");
    await this.storage.put(objectKey, data, content.text ? "text/plain" : "application/json");
    const mediaType = content.text
      ? content.kind === "html"
        ? "text/html"
        : "text/markdown"
      : "application/json";
    await this.db
      .prepare(
        `INSERT INTO asset_blobs (id, version_id, role, object_key, content_hash, size, media_type)
         VALUES (?, ?, 'content', ?, ?, ?, ?)`,
      )
      .run(nextId("blob"), versionId, objectKey, hashBuffer(data), data.byteLength, mediaType);
  }

  async getVersion(versionId: string): Promise<AssetVersion | null> {
    const row = (await this.db
      .prepare("SELECT * FROM asset_versions WHERE id = ?")
      .get(versionId)) as Row | undefined;
    return row ? mapVersion(row) : null;
  }

  async listVersions(assetId: string): Promise<AssetVersion[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM asset_versions WHERE asset_id = ? ORDER BY sequence DESC")
      .all(assetId)) as Row[];
    return rows.map(mapVersion);
  }

  async readContent(assetId: string, versionId?: string): Promise<AssetContent | null> {
    const asset = await this.getAssetAny(assetId);
    if (!asset) return null;
    const vid = versionId ?? asset.currentVersionId;
    if (!vid) return null;
    const row = (await this.db
      .prepare("SELECT * FROM asset_blobs WHERE version_id = ? AND role = 'content' LIMIT 1")
      .get(vid)) as Row | undefined;
    if (!row) return null;
    const mediaType = str(row.media_type, "application/octet-stream");
    if (
      mediaType !== "text/markdown" &&
      mediaType !== "text/html" &&
      mediaType !== "application/json"
    ) {
      return {
        kind: "blob",
        text: null,
        manifest: null,
        refs: [
          {
            role: str(row.role, "content"),
            objectKey: str(row.object_key),
            contentHash: str(row.content_hash),
            size: num(row.size),
            mediaType,
          },
        ],
      };
    }
    const data = await this.storage.get(str(row.object_key));
    if (!data) return null;
    const kind =
      mediaType === "text/markdown" ? "markdown" : mediaType === "text/html" ? "html" : "manifest";
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

  async softDelete(actor: ActorContext, assetId: string): Promise<void> {
    const now = nowIso();
    await this.db
      .prepare(
        "UPDATE assets SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, now, assetId, actor.workspaceId);
  }

  async restore(actor: ActorContext, assetId: string): Promise<void> {
    const now = nowIso();
    await this.db
      .prepare(
        "UPDATE assets SET status = 'normal', deleted_at = NULL, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, assetId, actor.workspaceId);
  }

  async permanentDelete(actor: ActorContext, assetId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM asset_relations WHERE source_asset_id = ? OR target_asset_id = ?")
      .run(assetId, assetId);
    await this.db
      .prepare(
        "DELETE FROM asset_blobs WHERE version_id IN (SELECT id FROM asset_versions WHERE asset_id = ?)",
      )
      .run(assetId);
    await this.db.prepare("DELETE FROM asset_versions WHERE asset_id = ?").run(assetId);
    await this.db
      .prepare("DELETE FROM assets WHERE id = ? AND workspace_id = ?")
      .run(assetId, actor.workspaceId);
  }

  async addRelation(
    _workspaceId: string,
    sourceAssetId: string,
    targetAssetId: string,
    relationType: AssetRelation["relationType"],
    provenance: Record<string, unknown>,
  ): Promise<AssetRelation | null> {
    const existing = (await this.db
      .prepare(
        "SELECT * FROM asset_relations WHERE source_asset_id = ? AND target_asset_id = ? AND relation_type = ?",
      )
      .get(sourceAssetId, targetAssetId, relationType)) as Row | undefined;
    if (existing) {
      const merged = mergeProvenance(parse(existing.provenance_json, {}), provenance);
      await this.db
        .prepare("UPDATE asset_relations SET provenance_json = ? WHERE id = ?")
        .run(json(merged), str(existing.id));
      return {
        id: str(existing.id),
        sourceAssetId,
        targetAssetId,
        relationType,
        provenance: merged,
        createdAt: str(existing.created_at),
      };
    }
    const id = nextId("rel");
    await this.db
      .prepare(
        "INSERT INTO asset_relations (id, source_asset_id, target_asset_id, relation_type, provenance_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, sourceAssetId, targetAssetId, relationType, json(provenance), nowIso());
    return { id, sourceAssetId, targetAssetId, relationType, provenance, createdAt: nowIso() };
  }

  async deleteRelation(
    sourceAssetId: string,
    targetAssetId: string,
    relationType: AssetRelation["relationType"],
  ): Promise<void> {
    await this.db
      .prepare(
        "DELETE FROM asset_relations WHERE source_asset_id = ? AND target_asset_id = ? AND relation_type = ?",
      )
      .run(sourceAssetId, targetAssetId, relationType);
  }

  async listRelations(
    assetId: string,
  ): Promise<Array<{ relation: AssetRelation; asset: Asset | null; direction: "in" | "out" }>> {
    const rows = (await this.db
      .prepare(
        `SELECT r.*, a.title AS target_title, a.type AS target_type, a.workspace_id AS target_workspace
         FROM asset_relations r
         LEFT JOIN assets a ON a.id = r.target_asset_id
         WHERE r.source_asset_id = ? OR r.target_asset_id = ?
         ORDER BY r.created_at DESC`,
      )
      .all(assetId, assetId)) as Row[];
    return await Promise.all(
      rows.map(async (r) => {
        const outgoing = str(r.source_asset_id) === assetId;
        const otherId = outgoing ? str(r.target_asset_id) : str(r.source_asset_id);
        const other = await this.getAssetAny(otherId);
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
      }),
    );
  }

  /* ---------------- tasks ---------------- */

  async createTask(
    actor: ActorContext,
    input: {
      type: Task["type"];
      goal: string;
      spec: Record<string, unknown>;
      inputAssetIds?: string[] | undefined;
    },
  ): Promise<Task> {
    const now = nowIso();
    const id = nextId("tsk");
    await this.db
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
    return (await this.getTask(actor.workspaceId, id)) as Task;
  }

  async listTasks(
    workspaceId: string,
    opts: { status?: string; limit: number; after?: string },
  ): Promise<Paginated<Task>> {
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
    const total = (await this.db
      .prepare(`SELECT COUNT(*) n FROM tasks WHERE ${where}`)
      .get(...(params as unknown[]))) as { n: number };
    const rows = (await this.db
      .prepare(`SELECT * FROM tasks WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(...(params as unknown[]), opts.limit + 1)) as Row[];
    const hasMore = rows.length > opts.limit;
    const items = rows.slice(0, opts.limit).map(mapTask);
    const last = items.at(-1);
    return {
      items,
      total: total.n,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async getTask(workspaceId: string, taskId: string): Promise<Task | null> {
    const row = (await this.db
      .prepare("SELECT * FROM tasks WHERE id = ? AND workspace_id = ?")
      .get(taskId, workspaceId)) as Row | undefined;
    return row ? mapTask(row) : null;
  }

  async getTaskAny(taskId: string): Promise<Task | null> {
    const row = (await this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId)) as
      | Row
      | undefined;
    return row ? mapTask(row) : null;
  }

  async updateTask(
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
  ): Promise<Task | null> {
    const current = await this.getTask(workspaceId, taskId);
    if (!current) return null;
    const now = nowIso();
    const completedAt =
      patch.status &&
      ["completed", "partial_completed", "failed", "cancelled"].includes(patch.status)
        ? (current.completedAt ?? now)
        : current.completedAt;
    await this.db
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
      await this.db
        .prepare("UPDATE tasks SET cancel_requested = ?, updated_at = ? WHERE id = ?")
        .run(patch.cancelRequested ? 1 : 0, nowIso(), taskId);
    }
    return await this.getTask(workspaceId, taskId);
  }

  async markTaskStarted(workspaceId: string, taskId: string): Promise<Task | null> {
    const now = nowIso();
    await this.db
      .prepare(
        "UPDATE tasks SET status = 'running', started_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, now, taskId, workspaceId);
    return await this.getTask(workspaceId, taskId);
  }

  async requestCancel(workspaceId: string, taskId: string): Promise<Task | null> {
    const now = nowIso();
    await this.db
      .prepare(
        "UPDATE tasks SET cancel_requested = 1, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, taskId, workspaceId);
    return await this.getTask(workspaceId, taskId);
  }

  async addOutput(workspaceId: string, taskId: string, assetId: string): Promise<void> {
    const task = await this.getTask(workspaceId, taskId);
    if (!task) return;
    const outputs = [...task.outputAssetIds];
    if (!outputs.includes(assetId)) outputs.push(assetId);
    await this.db
      .prepare("UPDATE tasks SET output_asset_ids = ?, updated_at = ? WHERE id = ?")
      .run(json(outputs), nowIso(), taskId);
  }

  async upsertStep(
    step: Omit<TaskStep, "id" | "taskId"> & { id?: string; taskId: string },
  ): Promise<TaskStep> {
    const existing = step.id
      ? ((await this.db.prepare("SELECT * FROM task_steps WHERE id = ?").get(step.id)) as
          | Row
          | undefined)
      : undefined;
    if (existing) {
      await this.db
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
      const row = (await this.db
        .prepare("SELECT * FROM task_steps WHERE id = ?")
        .get(step.id ?? "")) as Row;
      return mapStep(row);
    }
    const id = step.id ?? nextId("tst");
    await this.db
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

  async listSteps(taskId: string): Promise<TaskStep[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY started_at, id")
      .all(taskId)) as Row[];
    return rows.map(mapStep);
  }

  async createEvidence(
    _workspaceId: string,
    taskId: string,
    input: Omit<import("@shiguang/contracts").EvidenceItem, "id" | "taskId" | "retrievedAt">,
  ): Promise<void> {
    const now = nowIso();
    await this.db
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

  async listEvidence(taskId: string): Promise<Array<Record<string, unknown>>> {
    return (await this.db
      .prepare("SELECT * FROM evidence_items WHERE task_id = ? ORDER BY retrieved_at")
      .all(taskId)) as Array<Record<string, unknown>>;
  }

  /* ---------------- knowledge ---------------- */

  async createKnowledgeBase(
    actor: ActorContext,
    input: { name: string; description?: string },
  ): Promise<KnowledgeBase> {
    const now = nowIso();
    const id = nextId("kb");
    await this.db
      .prepare(
        "INSERT INTO knowledge_bases (id, workspace_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, actor.workspaceId, input.name, input.description ?? "", now, now);
    return (await this.getKnowledgeBase(actor.workspaceId, id)) as KnowledgeBase;
  }

  async listKnowledgeBases(workspaceId: string): Promise<KnowledgeBase[]> {
    const rows = (await this.db
      .prepare(
        "SELECT * FROM knowledge_bases WHERE workspace_id = ? AND status = 'active' ORDER BY updated_at DESC",
      )
      .all(workspaceId)) as Row[];
    return rows.map((r) => this.mapKb(r));
  }

  async getKnowledgeBase(workspaceId: string, kbId: string): Promise<KnowledgeBase | null> {
    const row = (await this.db
      .prepare("SELECT * FROM knowledge_bases WHERE id = ? AND workspace_id = ?")
      .get(kbId, workspaceId)) as Row | undefined;
    return row ? await this.mapKb(row) : null;
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

  async addKnowledgeSource(
    workspaceId: string,
    kbId: string,
    input: {
      sourceType: KnowledgeSource["sourceType"];
      assetVersionId?: string | null;
      url?: string | null;
      title: string;
      contentHash?: string | null;
    },
  ): Promise<KnowledgeSource> {
    const now = nowIso();
    const id = nextId("src");
    await this.db
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
    await this.db
      .prepare(
        "UPDATE knowledge_bases SET source_count = source_count + 1, updated_at = ? WHERE id = ?",
      )
      .run(now, kbId);
    return (await this.getKnowledgeSource(kbId, id)) as KnowledgeSource;
  }

  async getKnowledgeSource(kbId: string, sourceId: string): Promise<KnowledgeSource | null> {
    const row = (await this.db
      .prepare("SELECT * FROM knowledge_sources WHERE id = ? AND kb_id = ?")
      .get(sourceId, kbId)) as Row | undefined;
    return row ? await this.mapSource(row) : null;
  }

  async listKnowledgeSources(kbId: string): Promise<KnowledgeSource[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM knowledge_sources WHERE kb_id = ? ORDER BY created_at DESC")
      .all(kbId)) as Row[];
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

  async updateKnowledgeSource(
    kbId: string,
    sourceId: string,
    patch: Partial<Pick<KnowledgeSource, "status" | "error" | "contentHash" | "chunkCount">>,
  ): Promise<KnowledgeSource | null> {
    const current = await this.getKnowledgeSource(kbId, sourceId);
    if (!current) return null;
    await this.db
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
    return await this.getKnowledgeSource(kbId, sourceId);
  }

  async removeKnowledgeSource(kbId: string, sourceId: string): Promise<void> {
    await this.db.prepare("DELETE FROM knowledge_chunks WHERE source_id = ?").run(sourceId);
    await this.db
      .prepare("DELETE FROM knowledge_sources WHERE id = ? AND kb_id = ?")
      .run(sourceId, kbId);
    await this.refreshKbCounts(kbId);
  }

  async retryKnowledgeSource(kbId: string, sourceId: string): Promise<KnowledgeSource | null> {
    const current = await this.getKnowledgeSource(kbId, sourceId);
    if (!current) return null;
    await this.db
      .prepare(
        "UPDATE knowledge_sources SET status = 'pending', error = NULL, retry_count = retry_count + 1, updated_at = ? WHERE id = ?",
      )
      .run(nowIso(), sourceId);
    return await this.getKnowledgeSource(kbId, sourceId);
  }

  async replaceChunks(
    kbId: string,
    sourceId: string,
    chunks: Array<
      Pick<KnowledgeChunk, "ordinal" | "headingPath" | "text" | "charStart" | "charEnd">
    >,
  ): Promise<void> {
    await this.db.prepare("DELETE FROM knowledge_chunks WHERE source_id = ?").run(sourceId);
    const insert = this.db.prepare(
      `INSERT INTO knowledge_chunks (id, kb_id, source_id, ordinal, heading_path, text, text_hash, char_start, char_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const chunk of chunks) {
      const id = nextId("chnk");
      const hash = hashBuffer(Buffer.from(chunk.text, "utf8"));
      await insert.run(
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
    }
    await this.db
      .prepare(
        "UPDATE knowledge_sources SET chunk_count = ?, status = 'ready', error = NULL, updated_at = ? WHERE id = ?",
      )
      .run(chunks.length, nowIso(), sourceId);
    await this.refreshKbCounts(kbId);
  }

  async refreshKbCounts(kbId: string): Promise<void> {
    const counts = (await this.db
      .prepare(
        "SELECT COUNT(*) AS s, COALESCE(SUM(chunk_count), 0) AS c FROM knowledge_sources WHERE kb_id = ?",
      )
      .get(kbId)) as { s: number; c: number };
    await this.db
      .prepare(
        "UPDATE knowledge_bases SET source_count = ?, chunk_count = ?, updated_at = ? WHERE id = ?",
      )
      .run(counts.s, counts.c, nowIso(), kbId);
  }

  async searchChunks(
    kbId: string,
    query: string,
    limit = 10,
  ): Promise<Array<{ chunk: KnowledgeChunk; score: number; source: KnowledgeSource }>> {
    const like = `%${query}%`;
    const rows = (await this.db
      .prepare(
        "SELECT *, 0 AS score FROM knowledge_chunks WHERE kb_id = ? AND (text ILIKE ? OR heading_path ILIKE ?) LIMIT ?",
      )
      .all(kbId, like, like, limit)) as Row[];
    return await Promise.all(
      rows.map(async (r) => {
        const source = await this.getKnowledgeSource(kbId, str(r.source_id));
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
      }),
    );
  }

  async listChunksBySource(kbId: string, sourceId: string): Promise<KnowledgeChunk[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM knowledge_chunks WHERE kb_id = ? AND source_id = ? ORDER BY ordinal")
      .all(kbId, sourceId)) as Row[];
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

  async createDataset(
    actor: ActorContext,
    input: { name: string; description?: string },
  ): Promise<Dataset> {
    const now = nowIso();
    const id = nextId("ds");
    await this.db
      .prepare(
        "INSERT INTO datasets (id, workspace_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, actor.workspaceId, input.name, input.description ?? "", now, now);
    return (await this.getDataset(actor.workspaceId, id)) as Dataset;
  }

  async createDatasetRecord(workspaceId: string, name: string, description = ""): Promise<Dataset> {
    const now = nowIso();
    const id = nextId("ds");
    await this.db
      .prepare(
        "INSERT INTO datasets (id, workspace_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(id, workspaceId, name, description, now, now);
    return (await this.getDataset(workspaceId, id)) as Dataset;
  }

  async listDatasets(workspaceId: string): Promise<Dataset[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM datasets WHERE workspace_id = ? ORDER BY updated_at DESC")
      .all(workspaceId)) as Row[];
    return rows.map((r) => this.mapDataset(r));
  }

  async getDataset(workspaceId: string, datasetId: string): Promise<Dataset | null> {
    const row = (await this.db
      .prepare("SELECT * FROM datasets WHERE id = ? AND workspace_id = ?")
      .get(datasetId, workspaceId)) as Row | undefined;
    return row ? await this.mapDataset(row) : null;
  }

  async getDatasetAny(datasetId: string): Promise<Dataset | null> {
    const row = (await this.db.prepare("SELECT * FROM datasets WHERE id = ?").get(datasetId)) as
      | Row
      | undefined;
    return row ? await this.mapDataset(row) : null;
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

  async addDatasetVersion(
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
  ): Promise<DatasetVersion> {
    const now = nowIso();
    const dataset = await this.getDataset(workspaceId, datasetId);
    if (!dataset) throw new Error("dataset not found");
    const versionRow = (await this.db
      .prepare(
        "SELECT COALESCE(MAX(version), 0) + 1 AS n FROM dataset_versions WHERE dataset_id = ?",
      )
      .get(datasetId)) as { n: number };
    const version = versionRow.n;
    const id = nextId("dsv");
    await this.db
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
    await this.db
      .prepare(
        "UPDATE datasets SET current_version_id = ?, row_count = ?, status = 'normal', updated_at = ? WHERE id = ?",
      )
      .run(id, input.rowCount, now, datasetId);
    return (await this.getDatasetVersion(datasetId, id)) as DatasetVersion;
  }

  async getDatasetVersion(datasetId: string, versionId: string): Promise<DatasetVersion | null> {
    const row = (await this.db
      .prepare("SELECT * FROM dataset_versions WHERE id = ? AND dataset_id = ?")
      .get(versionId, datasetId)) as Row | undefined;
    return row ? await this.mapDatasetVersion(row) : null;
  }

  async listDatasetVersions(datasetId: string): Promise<DatasetVersion[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM dataset_versions WHERE dataset_id = ? ORDER BY version DESC")
      .all(datasetId)) as Row[];
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

  async createSavedView(
    actor: ActorContext,
    datasetId: string,
    input: { name: string; query: DatasetQuery },
  ): Promise<SavedView> {
    const now = nowIso();
    const id = nextId("sv");
    await this.db
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

  async listSavedViews(datasetId: string): Promise<SavedView[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM dataset_saved_views WHERE dataset_id = ? ORDER BY created_at DESC")
      .all(datasetId)) as Row[];
    return rows.map((r) => ({
      id: str(r.id),
      datasetId: str(r.dataset_id),
      workspaceId: str(r.workspace_id),
      name: str(r.name),
      query: parse<Record<string, unknown>>(r.query_json, {}),
      createdAt: str(r.created_at),
    }));
  }

  async createChartSpec(
    actor: ActorContext,
    datasetId: string,
    input: Omit<ChartSpec, "id" | "datasetId" | "workspaceId" | "createdAt">,
  ): Promise<ChartSpec> {
    const id = nextId("chrt");
    const now = nowIso();
    await this.db
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

  async listChartSpecs(datasetId: string): Promise<ChartSpec[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM chart_specs WHERE dataset_id = ? ORDER BY created_at DESC")
      .all(datasetId)) as Row[];
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

  async listTemplates(
    workspaceId: string,
    type?: "research" | "presentation",
  ): Promise<Template[]> {
    const rows = type
      ? ((await this.db
          .prepare(
            "SELECT * FROM templates WHERE workspace_id = ? AND type = ? ORDER BY usage_count DESC, updated_at DESC",
          )
          .all(workspaceId, type)) as Row[])
      : ((await this.db
          .prepare(
            "SELECT * FROM templates WHERE workspace_id = ? ORDER BY usage_count DESC, updated_at DESC",
          )
          .all(workspaceId)) as Row[]);
    return rows.map((r) => this.mapTemplate(r));
  }

  async getTemplate(workspaceId: string, templateId: string): Promise<Template | null> {
    const row = (await this.db
      .prepare("SELECT * FROM templates WHERE id = ? AND workspace_id = ?")
      .get(templateId, workspaceId)) as Row | undefined;
    return row ? await this.mapTemplate(row) : null;
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

  async createTemplate(
    actor: ActorContext,
    input: {
      type: Template["type"];
      name: string;
      description?: string;
      content: Record<string, unknown>;
    },
  ): Promise<Template> {
    const now = nowIso();
    const id = nextId("tpl");
    await this.db
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
    return (await this.getTemplate(actor.workspaceId, id)) as Template;
  }

  async bumpTemplateUsage(workspaceId: string, templateId: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(nowIso(), templateId, workspaceId);
  }

  /* ---------------- publishing ---------------- */

  async createPublish(
    actor: ActorContext,
    input: {
      assetId: string;
      visibility: Publish["visibility"];
      password?: string | null;
      expiresAt?: string | null;
      allowDownload?: boolean;
      allowCopy?: boolean;
    },
  ): Promise<Publish> {
    const now = nowIso();
    const id = nextId("pub");
    const slug = await this.uniqueSlug();
    const shortSlug = await this.uniqueSlug(6);
    const salt = randomSalt();
    const passwordHash = input.password ? hashPassword(input.password, salt) : null;
    await this.db
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
        input.allowDownload ?? true,
        input.allowCopy ?? true,
        now,
        now,
      );
    return (await this.getPublish(actor.workspaceId, id)) as Publish;
  }

  private async uniqueSlug(length = 10): Promise<string> {
    const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
    let slug = "";
    do {
      slug = Array.from(
        { length },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
      ).join("");
    } while (
      await this.db
        .prepare("SELECT id FROM publishes WHERE slug = ? OR short_slug = ?")
        .get(slug, slug)
    );
    return slug;
  }

  async getPublish(workspaceId: string, publishId: string): Promise<Publish | null> {
    const row = (await this.db
      .prepare("SELECT * FROM publishes WHERE id = ? AND workspace_id = ?")
      .get(publishId, workspaceId)) as Row | undefined;
    return row ? await this.mapPublish(row) : null;
  }

  async getPublishBySlug(slug: string): Promise<Publish | null> {
    const row = (await this.db.prepare("SELECT * FROM publishes WHERE slug = ?").get(slug)) as
      | Row
      | undefined;
    return row ? await this.mapPublish(row) : null;
  }

  async getPublishByShortSlug(shortSlug: string): Promise<Publish | null> {
    const row = (await this.db
      .prepare("SELECT * FROM publishes WHERE short_slug = ?")
      .get(shortSlug)) as Row | undefined;
    return row ? await this.mapPublish(row) : null;
  }

  async listPublishes(workspaceId: string): Promise<Publish[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM publishes WHERE workspace_id = ? ORDER BY updated_at DESC")
      .all(workspaceId)) as Row[];
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

  async updatePublish(
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
  ): Promise<Publish | null> {
    const current = await this.getPublish(workspaceId, publishId);
    if (!current) return null;
    await this.db
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
    return await this.getPublish(workspaceId, publishId);
  }

  async verifyPassword(publish: Publish, password: string): Promise<boolean> {
    if (!publish.passwordHash || !publish.passwordSalt) return false;
    return hashPassword(password, publish.passwordSalt) === publish.passwordHash;
  }

  async createRelease(
    publishId: string,
    input: { assetVersionId: string; manifest: Record<string, unknown> },
  ): Promise<PublishRelease> {
    const now = nowIso();
    const id = nextId("rel");
    const etag = `"${hashBuffer(Buffer.from(json(input.manifest) + input.assetVersionId)).slice(0, 32)}"`;
    await this.db
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

  async setActiveRelease(workspaceId: string, publishId: string, releaseId: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE publishes SET active_release_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(releaseId, nowIso(), publishId, workspaceId);
  }

  async getRelease(releaseId: string): Promise<PublishRelease | null> {
    const row = (await this.db
      .prepare("SELECT * FROM publish_releases WHERE id = ?")
      .get(releaseId)) as Row | undefined;
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

  async createShortLink(
    publish: Publish,
    shortSlug: string,
    destination: string,
  ): Promise<ShortLink> {
    const now = nowIso();
    const id = nextId("lnk");
    await this.db
      .prepare(
        "INSERT INTO short_links (id, publish_id, short_slug, destination, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, publish.id, shortSlug, destination, now);
    return { id, publishId: publish.id, shortSlug, destination, revokedAt: null, createdAt: now };
  }

  async getShortLink(shortSlug: string): Promise<ShortLink | null> {
    const row = (await this.db
      .prepare("SELECT * FROM short_links WHERE short_slug = ? AND revoked_at IS NULL")
      .get(shortSlug)) as Row | undefined;
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

  async revokePublish(workspaceId: string, publishId: string): Promise<void> {
    const now = nowIso();
    await this.db
      .prepare(
        "UPDATE publishes SET status = 'revoked', updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(now, publishId, workspaceId);
  }

  async recordPresence(input: {
    publishId: string;
    releaseId?: string | null;
    visitorKey: string;
    userId?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    referrerDomain?: string | null;
    deviceClass?: string | null;
  }): Promise<{
    visitorCount: number;
    viewers: Array<{
      visitorKey: string;
      userId: string | null;
      displayName: string | null;
      avatarUrl: string | null;
    }>;
  }> {
    const now = nowIso();
    const inserted = (await this.db
      .prepare(
        `WITH inserted AS (
           INSERT INTO publish_visitors
             (publish_id, visitor_key, user_id, display_name, avatar_url, first_seen_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (publish_id, visitor_key) DO NOTHING
           RETURNING visitor_key
         )
         SELECT COUNT(*) AS inserted FROM inserted`,
      )
      .get(
        input.publishId,
        input.visitorKey,
        input.userId ?? null,
        input.displayName ?? null,
        input.avatarUrl ?? null,
        now,
        now,
      )) as { inserted?: number } | undefined;
    await this.db
      .prepare(
        `UPDATE publish_visitors
         SET user_id = ?, display_name = ?, avatar_url = ?, last_seen_at = ?
         WHERE publish_id = ? AND visitor_key = ?`,
      )
      .run(
        input.userId ?? null,
        input.displayName ?? null,
        input.avatarUrl ?? null,
        now,
        input.publishId,
        input.visitorKey,
      );
    if (Number(inserted?.inserted ?? 0) > 0) {
      await this.db
        .prepare(
          "INSERT INTO publish_access_events (id, publish_id, release_id, ts_bucket, referrer_domain, device_class, hashed_visitor, status_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          nextId("pae"),
          input.publishId,
          input.releaseId ?? null,
          now.slice(0, 16),
          input.referrerDomain ?? null,
          input.deviceClass ?? null,
          input.visitorKey,
          200,
        );
      await this.db
        .prepare("UPDATE publishes SET view_count = view_count + 1, updated_at = ? WHERE id = ?")
        .run(now, input.publishId);
    }
    const activeSince = new Date(Date.now() - 90_000).toISOString();
    const countRow = (await this.db
      .prepare("SELECT COUNT(*) AS n FROM publish_visitors WHERE publish_id = ?")
      .get(input.publishId)) as { n?: number } | undefined;
    const legacyCountRow = (await this.db
      .prepare(
        "SELECT COUNT(DISTINCT hashed_visitor) AS n FROM publish_access_events WHERE publish_id = ? AND hashed_visitor IS NOT NULL",
      )
      .get(input.publishId)) as { n?: number } | undefined;
    const rows = (await this.db
      .prepare(
        `SELECT visitor_key, user_id, display_name, avatar_url
         FROM publish_visitors
         WHERE publish_id = ? AND last_seen_at >= ?
         ORDER BY last_seen_at DESC LIMIT 12`,
      )
      .all(input.publishId, activeSince)) as Row[];
    return {
      visitorCount: Math.max(Number(countRow?.n ?? 0), Number(legacyCountRow?.n ?? 0)),
      viewers: rows.map((row) => ({
        visitorKey: str(row.visitor_key),
        userId: row.user_id === null ? null : str(row.user_id),
        displayName: row.display_name === null ? null : str(row.display_name),
        avatarUrl: row.avatar_url === null ? null : str(row.avatar_url),
      })),
    };
  }

  async recordAccessEvent(input: {
    publishId: string;
    releaseId?: string | null;
    tsBucket: string;
    referrerDomain?: string | null;
    deviceClass?: string | null;
    hashedVisitor?: string | null;
    statusCode?: number;
  }): Promise<void> {
    await this.db
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
    await this.db
      .prepare("UPDATE publishes SET view_count = view_count + 1, updated_at = ? WHERE id = ?")
      .run(nowIso(), input.publishId);
  }

  async getPublishStats(publishId: string): Promise<{
    views: number;
    uniqueVisitors: number;
    daily: Array<{ day: string; views: number; uniqueVisitors: number }>;
    activeViewers: Array<{
      visitorKey: string;
      userId: string | null;
      displayName: string | null;
      avatarUrl: string | null;
    }>;
  }> {
    const views = num(
      (await this.db
        .prepare("SELECT view_count AS v FROM publishes WHERE id = ?")
        .get(publishId)) as {
        v: number;
      },
    );
    const rows = (await this.db
      .prepare(
        `SELECT LEFT(ts_bucket, 10) AS day,
                COUNT(*) AS views,
                COUNT(DISTINCT hashed_visitor) AS unique_visitors
         FROM publish_access_events
         WHERE publish_id = ?
         GROUP BY LEFT(ts_bucket, 10)
         ORDER BY day DESC LIMIT 30`,
      )
      .all(publishId)) as Array<{ day: string; views: number; unique_visitors: number }>;
    const uniqueRow = (await this.db
      .prepare(`SELECT COUNT(*) AS n FROM publish_visitors WHERE publish_id = ?`)
      .get(publishId)) as { n: number };
    const legacyUniqueRow = (await this.db
      .prepare(
        "SELECT COUNT(DISTINCT hashed_visitor) AS n FROM publish_access_events WHERE publish_id = ? AND hashed_visitor IS NOT NULL",
      )
      .get(publishId)) as { n: number };
    const activeSince = new Date(Date.now() - 90_000).toISOString();
    const activeRows = (await this.db
      .prepare(
        `SELECT visitor_key, user_id, display_name, avatar_url
         FROM publish_visitors
         WHERE publish_id = ? AND last_seen_at >= ?
         ORDER BY last_seen_at DESC LIMIT 12`,
      )
      .all(publishId, activeSince)) as Row[];
    return {
      views,
      uniqueVisitors: Math.max(Number(uniqueRow?.n ?? 0), Number(legacyUniqueRow?.n ?? 0)),
      daily: rows.map((row) => ({
        day: str(row.day),
        views: Number(row.views ?? 0),
        uniqueVisitors: Number(row.unique_visitors ?? 0),
      })),
      activeViewers: activeRows.map((row) => ({
        visitorKey: str(row.visitor_key),
        userId: row.user_id === null ? null : str(row.user_id),
        displayName: row.display_name === null ? null : str(row.display_name),
        avatarUrl: row.avatar_url === null ? null : str(row.avatar_url),
      })),
    };
  }

  async getWorkspacePublishStats(
    workspaceId: string,
    assetType?: string,
  ): Promise<{
    views: number;
    uniqueVisitors: number;
    averageLikes: number;
    averageWatchSeconds: number;
    growthRate: number;
    daily: Array<{ day: string; views: number; uniqueVisitors: number }>;
  }> {
    const typeClause = assetType ? " AND a.type = ?" : "";
    const queryParams = assetType ? [workspaceId, assetType] : [workspaceId];
    const publishRow = (await this.db
      .prepare(
        `SELECT COALESCE(SUM(p.view_count), 0) AS views
         FROM publishes p
         JOIN assets a ON a.id = p.asset_id
         WHERE p.workspace_id = ?${typeClause}`,
      )
      .get(...queryParams)) as { views: number };
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = (await this.db
      .prepare(
        `SELECT pae.ts_bucket, pae.hashed_visitor
         FROM publish_access_events pae
         JOIN publishes p ON p.id = pae.publish_id
         JOIN assets a ON a.id = p.asset_id
         WHERE p.workspace_id = ?${typeClause} AND pae.ts_bucket >= ?`,
      )
      .all(...queryParams, since)) as Array<{ ts_bucket: string; hashed_visitor: string | null }>;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentVisitors = new Set<string>();
    const daily = new Map<string, { views: number; visitors: Set<string> }>();
    let recentViews = 0;
    let previousViews = 0;
    for (const row of rows) {
      const timestamp = new Date(str(row.ts_bucket)).getTime();
      if (!Number.isFinite(timestamp)) continue;
      if (timestamp >= cutoff) {
        recentViews += 1;
        const day = str(row.ts_bucket).slice(0, 10);
        const item = daily.get(day) ?? { views: 0, visitors: new Set<string>() };
        item.views += 1;
        if (row.hashed_visitor) {
          item.visitors.add(row.hashed_visitor);
          recentVisitors.add(row.hashed_visitor);
        }
        daily.set(day, item);
      } else {
        previousViews += 1;
      }
    }
    const growthRate =
      previousViews === 0
        ? recentViews > 0
          ? 100
          : 0
        : Math.round(((recentViews - previousViews) / previousViews) * 100);
    return {
      views: Number(publishRow?.views ?? 0),
      uniqueVisitors: recentVisitors.size,
      // Engagement collection is not available for historical releases yet.
      averageLikes: 0,
      averageWatchSeconds: 0,
      growthRate,
      daily: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, value]) => ({
          day,
          views: value.views,
          uniqueVisitors: value.visitors.size,
        })),
    };
  }

  /* ---------------- notifications ---------------- */

  async createNotification(input: {
    workspaceId: string;
    subject: string;
    type: Notification["type"];
    title: string;
    body?: string;
    link?: string | null;
  }): Promise<Notification> {
    const now = nowIso();
    const id = nextId("ntf");
    await this.db
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

  async listNotifications(
    workspaceId: string,
    subject: string,
    limit = 50,
  ): Promise<Notification[]> {
    const rows = (await this.db
      .prepare(
        "SELECT * FROM notifications WHERE workspace_id = ? AND subject = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(workspaceId, subject, limit)) as Row[];
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

  async unreadNotificationCount(workspaceId: string, subject: string): Promise<number> {
    const row = (await this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM notifications WHERE workspace_id = ? AND subject = ? AND read_at IS NULL",
      )
      .get(workspaceId, subject)) as { n: number };
    return row.n;
  }

  async markNotificationRead(
    workspaceId: string,
    subject: string,
    notificationId: string,
  ): Promise<void> {
    await this.db
      .prepare(
        "UPDATE notifications SET read_at = ? WHERE id = ? AND workspace_id = ? AND subject = ?",
      )
      .run(nowIso(), notificationId, workspaceId, subject);
  }

  async markAllNotificationsRead(workspaceId: string, subject: string): Promise<void> {
    await this.db
      .prepare(
        "UPDATE notifications SET read_at = ? WHERE workspace_id = ? AND subject = ? AND read_at IS NULL",
      )
      .run(nowIso(), workspaceId, subject);
  }

  /* ---------------- billing ---------------- */

  async getCreditAccount(workspaceId: string): Promise<CreditAccount | null> {
    const row = (await this.db
      .prepare("SELECT * FROM credit_accounts WHERE workspace_id = ?")
      .get(workspaceId)) as Row | undefined;
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

  async ledger(workspaceId: string, limit = 100): Promise<CreditLedgerEntry[]> {
    const rows = (await this.db
      .prepare(
        "SELECT * FROM credit_ledger_entries WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(workspaceId, limit)) as Row[];
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

  async reserveCredits(
    workspaceId: string,
    taskId: string,
    amount: number,
    operationId: string,
  ): Promise<{ ok: boolean; balance: number; reserved: number }> {
    const account = await this.getCreditAccount(workspaceId);
    if (!account) return { ok: false, balance: 0, reserved: 0 };
    const dup = await this.db
      .prepare("SELECT id FROM credit_ledger_entries WHERE operation_id = ?")
      .get(operationId);
    if (dup) {
      const res = (await this.db
        .prepare("SELECT amount FROM credit_reservations WHERE task_id = ?")
        .get(taskId)) as { amount: number } | undefined;
      return { ok: true, balance: account.balance, reserved: res?.amount ?? amount };
    }
    if (account.balance < amount) return { ok: false, balance: account.balance, reserved: 0 };
    const now = nowIso();
    await this.db.exec("BEGIN");
    try {
      await this.db
        .prepare(
          "UPDATE credit_accounts SET balance = balance - ?, total_used = total_used + ?, updated_at = ? WHERE workspace_id = ?",
        )
        .run(amount, amount, now, workspaceId);
      await this.db
        .prepare(
          "INSERT INTO credit_ledger_entries (id, workspace_id, entry_type, amount, operation_id, task_id, description, created_at) VALUES (?, ?, 'reserve', ?, ?, ?, ?, ?)",
        )
        .run(nextId("led"), workspaceId, amount, operationId, taskId, "任务 Credits 预留", now);
      await this.db
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
      await this.db.exec("COMMIT");
    } catch (err) {
      await this.db.exec("ROLLBACK");
      throw err;
    }
    return {
      ok: true,
      balance: ((await this.getCreditAccount(workspaceId)) as CreditAccount).balance,
      reserved: amount,
    };
  }

  async settleCredits(
    workspaceId: string,
    taskId: string,
    actual: number,
    operationId: string,
  ): Promise<void> {
    const dup = await this.db
      .prepare("SELECT id FROM credit_ledger_entries WHERE operation_id = ?")
      .get(operationId);
    if (dup) return;
    const reservation = (await this.db
      .prepare("SELECT * FROM credit_reservations WHERE task_id = ?")
      .get(taskId)) as Row | undefined;
    const reserved = reservation ? num(reservation.amount) : actual;
    const refund = Math.max(0, reserved - actual);
    const extra = Math.max(0, actual - reserved);
    const now = nowIso();
    await this.db.exec("BEGIN");
    try {
      await this.db
        .prepare(
          "INSERT INTO credit_ledger_entries (id, workspace_id, entry_type, amount, operation_id, task_id, description, created_at) VALUES (?, ?, 'settle', ?, ?, ?, ?, ?)",
        )
        .run(nextId("led"), workspaceId, actual, operationId, taskId, "任务 Credits 结算", now);
      if (refund > 0) {
        await this.db
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
        await this.db
          .prepare(
            "UPDATE credit_accounts SET balance = balance + ?, total_used = total_used - ?, updated_at = ? WHERE workspace_id = ?",
          )
          .run(refund, refund, now, workspaceId);
      }
      if (extra > 0) {
        await this.db
          .prepare(
            "UPDATE credit_accounts SET balance = balance - ?, total_used = total_used + ?, updated_at = ? WHERE workspace_id = ?",
          )
          .run(extra, extra, now, workspaceId);
      }
      await this.db
        .prepare("UPDATE credit_reservations SET status = 'settled' WHERE task_id = ?")
        .run(taskId);
      await this.db.exec("COMMIT");
    } catch (err) {
      await this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async usageRecords(workspaceId: string, limit = 100): Promise<Array<Record<string, unknown>>> {
    return (await this.db
      .prepare(
        "SELECT * FROM usage_records WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(workspaceId, limit)) as Array<Record<string, unknown>>;
  }

  async recordUsage(input: {
    workspaceId: string;
    taskId?: string;
    kind: string;
    amount: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db
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

  async createApiToken(
    workspaceId: string,
    input: { name: string; scopes: Array<"read" | "write">; expiresAt?: string | null },
    secretHash: string,
  ): Promise<ApiToken> {
    const now = nowIso();
    const id = nextId("tok");
    await this.db
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

  async listApiTokens(workspaceId: string): Promise<ApiToken[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM api_tokens WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(workspaceId)) as Row[];
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

  async getApiToken(workspaceId: string, tokenId: string): Promise<ApiToken | null> {
    const row = (await this.db
      .prepare("SELECT * FROM api_tokens WHERE id = ? AND workspace_id = ?")
      .get(tokenId, workspaceId)) as Row | undefined;
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

  async findApiTokenByHash(secretHash: string): Promise<ApiToken | null> {
    const row = (await this.db
      .prepare("SELECT * FROM api_tokens WHERE secret_hash = ? AND revoked_at IS NULL")
      .get(secretHash)) as Row | undefined;
    if (!row) return null;
    return await this.getApiToken(str(row.workspace_id), str(row.id));
  }

  async revokeApiToken(workspaceId: string, tokenId: string): Promise<void> {
    await this.db
      .prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND workspace_id = ?")
      .run(nowIso(), tokenId, workspaceId);
  }

  async touchApiToken(tokenId: string): Promise<void> {
    await this.db
      .prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
      .run(nowIso(), tokenId);
  }

  async getMcpConfig(workspaceId: string): Promise<McpConfig | null> {
    const row = (await this.db
      .prepare("SELECT * FROM mcp_configs WHERE workspace_id = ?")
      .get(workspaceId)) as Row | undefined;
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

  async updateMcpConfig(
    workspaceId: string,
    patch: Partial<
      Pick<McpConfig, "enabled" | "scope" | "scopeIds" | "writeEnabled" | "serverUrl">
    >,
  ): Promise<McpConfig> {
    const current = (await this.getMcpConfig(workspaceId)) ?? {
      id: nextId("mcp"),
      workspaceId,
      enabled: false,
      scope: "all" as const,
      scopeIds: [],
      writeEnabled: false,
      serverUrl: "http://localhost:3001/mcp",
      updatedAt: nowIso(),
    };
    await this.db
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
    return (await this.getMcpConfig(workspaceId)) as McpConfig;
  }

  /* ---------------- audit ---------------- */

  async audit(
    workspaceId: string,
    actor: string,
    action: string,
    resource: string,
    outcome: "success" | "denied" | "failed",
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO audit_events (id, workspace_id, actor, action, resource, outcome, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(nextId("aud"), workspaceId, actor, action, resource, outcome, json(metadata), nowIso());
  }

  async listAudit(workspaceId: string, limit = 50): Promise<AuditEvent[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM audit_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(workspaceId, limit)) as Row[];
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

  async appendOutbox(
    input: Omit<OutboxEvent, "id" | "status" | "createdAt" | "dispatchedAt">,
  ): Promise<OutboxEvent> {
    const now = nowIso();
    const id = nextId("evt");
    await this.db
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

  async claimOutbox(limit = 10, _claimTimeoutSec = 30): Promise<OutboxEvent[]> {
    const rows = (await this.db
      .prepare("SELECT * FROM outbox_events WHERE status = 'pending' ORDER BY created_at LIMIT ?")
      .all(limit)) as Row[];
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

  async markOutboxDispatched(eventId: string): Promise<void> {
    await this.db
      .prepare("UPDATE outbox_events SET status = 'dispatched', dispatched_at = ? WHERE id = ?")
      .run(nowIso(), eventId);
  }

  async markOutboxFailed(eventId: string): Promise<void> {
    await this.db.prepare("UPDATE outbox_events SET status = 'failed' WHERE id = ?").run(eventId);
  }

  async hasInbox(eventId: string, consumer: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT event_id FROM inbox_events WHERE event_id = ? AND consumer = ?")
      .get(eventId, consumer);
    return row !== undefined;
  }

  async insertInbox(eventId: string, consumer: string): Promise<void> {
    await this.db
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
    const existing = (await this.db
      .prepare("SELECT response_json FROM idempotency_receipts WHERE key = ? AND workspace_id = ?")
      .get(key, workspaceId)) as { response_json: string } | undefined;
    if (existing) {
      return { value: parse<T>(existing.response_json, null as T), replayed: true };
    }
    const value = await fn();
    await this.db
      .prepare(
        "INSERT INTO idempotency_receipts (key, workspace_id, response_json, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(key, workspaceId, json(value), nowIso());
    return { value, replayed: false };
  }

  /* ---------------- git connections ---------------- */

  async createGitConnection(
    workspaceId: string,
    input: {
      name: string;
      provider: string;
      repoUrl: string;
      branch: string;
      syncPath: string;
      localDir?: string;
    },
  ): Promise<Record<string, unknown>> {
    const now = nowIso();
    const id = nextId("git");
    await this.db
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
    return (await this.getGitConnection(workspaceId, id)) as Record<string, unknown>;
  }

  async listGitConnections(workspaceId: string): Promise<Array<Record<string, unknown>>> {
    return (await this.db
      .prepare("SELECT * FROM git_connections WHERE workspace_id = ? ORDER BY updated_at DESC")
      .all(workspaceId)) as Array<Record<string, unknown>>;
  }

  async getGitConnection(workspaceId: string, id: string): Promise<Record<string, unknown> | null> {
    const row = (await this.db
      .prepare("SELECT * FROM git_connections WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId)) as Row | undefined;
    return row ?? null;
  }

  async updateGitConnection(
    workspaceId: string,
    id: string,
    patch: Partial<{
      status: string;
      lastSyncAt: string | null;
      lastSyncStatus: string | null;
      lastError: string | null;
      localDir: string | null;
    }>,
  ): Promise<Record<string, unknown> | null> {
    const current = await this.getGitConnection(workspaceId, id);
    if (!current) return null;
    await this.db
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
    return await this.getGitConnection(workspaceId, id);
  }

  async deleteGitConnection(workspaceId: string, id: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM git_connections WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
  }

  /* ---------------- custom domains ---------------- */

  async createCustomDomain(workspaceId: string, domain: string): Promise<Record<string, unknown>> {
    const now = nowIso();
    const id = nextId("dom");
    const token = `sg-verify-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    await this.db
      .prepare(
        `INSERT INTO custom_domains (id, workspace_id, domain, verification_token, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(id, workspaceId, domain.toLowerCase(), token, now, now);
    return (await this.getCustomDomain(workspaceId, id)) as Record<string, unknown>;
  }

  async listCustomDomains(workspaceId: string): Promise<Array<Record<string, unknown>>> {
    return (await this.db
      .prepare("SELECT * FROM custom_domains WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(workspaceId)) as Array<Record<string, unknown>>;
  }

  async getCustomDomain(workspaceId: string, id: string): Promise<Record<string, unknown> | null> {
    const row = (await this.db
      .prepare("SELECT * FROM custom_domains WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId)) as Row | undefined;
    return row ?? null;
  }

  async getCustomDomainByDomain(domain: string): Promise<Record<string, unknown> | null> {
    const row = (await this.db
      .prepare("SELECT * FROM custom_domains WHERE domain = ?")
      .get(domain.toLowerCase())) as Row | undefined;
    return row ?? null;
  }

  async verifyCustomDomain(workspaceId: string, id: string, token: string): Promise<boolean> {
    const domain = await this.getCustomDomain(workspaceId, id);
    if (!domain) return false;
    if (String(domain.verification_token) !== token) return false;
    await this.db
      .prepare(
        "UPDATE custom_domains SET status = 'verified', verified_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(nowIso(), nowIso(), id);
    return true;
  }

  async bindDomainPublish(
    workspaceId: string,
    id: string,
    publishId: string | null,
  ): Promise<void> {
    await this.db
      .prepare(
        "UPDATE custom_domains SET publish_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
      )
      .run(publishId, nowIso(), id, workspaceId);
  }

  async deleteCustomDomain(workspaceId: string, id: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM custom_domains WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
  }

  /* ---------------- task schedules ---------------- */

  async createSchedule(
    workspaceId: string,
    input: {
      name: string;
      taskType: string;
      goal: string;
      spec: Record<string, unknown>;
      cron: string;
    },
  ): Promise<Record<string, unknown>> {
    const now = nowIso();
    const id = nextId("sch");
    const next = computeNextCron(input.cron, new Date());
    await this.db
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
    return (await this.getSchedule(workspaceId, id)) as Record<string, unknown>;
  }

  async listSchedules(workspaceId: string): Promise<Array<Record<string, unknown>>> {
    return (await this.db
      .prepare("SELECT * FROM task_schedules WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(workspaceId)) as Array<Record<string, unknown>>;
  }

  async getSchedule(workspaceId: string, id: string): Promise<Record<string, unknown> | null> {
    const row = (await this.db
      .prepare("SELECT * FROM task_schedules WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId)) as Row | undefined;
    return row ?? null;
  }

  async updateSchedule(
    workspaceId: string,
    id: string,
    patch: Partial<{
      enabled: boolean;
      name: string;
      goal: string;
      cron: string;
      spec: Record<string, unknown>;
    }>,
  ): Promise<Record<string, unknown> | null> {
    const current = await this.getSchedule(workspaceId, id);
    if (!current) return null;
    const enabled = patch.enabled ?? bool(current.enabled);
    const cron = patch.cron ?? str(current.cron);
    const nextRunAt =
      patch.enabled !== undefined || patch.cron !== undefined
        ? enabled
          ? computeNextCron(cron, new Date())
          : null
        : (current.next_run_at as string | null);
    await this.db
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
    return await this.getSchedule(workspaceId, id);
  }

  async deleteSchedule(workspaceId: string, id: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM task_schedules WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
  }

  async getDueSchedules(): Promise<Array<Record<string, unknown>>> {
    const now = nowIso();
    return (await this.db
      .prepare(
        "SELECT * FROM task_schedules WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at LIMIT 10",
      )
      .all(now)) as Array<Record<string, unknown>>;
  }

  async markScheduleRun(id: string): Promise<void> {
    const schedule = (await this.db.prepare("SELECT * FROM task_schedules WHERE id = ?").get(id)) as
      | Row
      | undefined;
    if (!schedule) return;
    const next = computeNextCron(str(schedule.cron), new Date());
    await this.db
      .prepare(
        "UPDATE task_schedules SET last_run_at = ?, next_run_at = ?, run_count = run_count + 1, updated_at = ? WHERE id = ?",
      )
      .run(nowIso(), next, nowIso(), id);
  }

  /* ---------------- workspace members & ACL ---------------- */

  async listMembers(workspaceId: string): Promise<Array<Record<string, unknown>>> {
    return (await this.db
      .prepare("SELECT * FROM workspace_members WHERE workspace_id = ? ORDER BY created_at")
      .all(workspaceId)) as Array<Record<string, unknown>>;
  }

  async addMember(
    workspaceId: string,
    subject: string,
    role: string,
    invitedBy: string,
  ): Promise<Record<string, unknown>> {
    await this.db
      .prepare(
        `INSERT INTO workspace_members (id, workspace_id, subject, role, status, invited_by, created_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)
         ON CONFLICT(workspace_id, subject) DO UPDATE SET role = excluded.role`,
      )
      .run(nextId("mem"), workspaceId, subject, role, invitedBy, nowIso());
    return (await this.listMembers(workspaceId)).find((m) => m.subject === subject) as Record<
      string,
      unknown
    >;
  }

  async updateMemberRole(workspaceId: string, subject: string, role: string): Promise<void> {
    await this.db
      .prepare("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND subject = ?")
      .run(role, workspaceId, subject);
  }

  async removeMember(workspaceId: string, subject: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND subject = ?")
      .run(workspaceId, subject);
  }

  async grantAcl(
    assetId: string,
    principalType: string,
    principalId: string,
    role: string,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO asset_acl (id, asset_id, principal_type, principal_id, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(asset_id, principal_type, principal_id) DO UPDATE SET role = excluded.role`,
      )
      .run(nextId("acl"), assetId, principalType, principalId, role, nowIso());
  }

  async listAcl(assetId: string): Promise<Array<Record<string, unknown>>> {
    return (await this.db
      .prepare("SELECT * FROM asset_acl WHERE asset_id = ? ORDER BY created_at")
      .all(assetId)) as Array<Record<string, unknown>>;
  }

  async revokeAcl(assetId: string, principalType: string, principalId: string): Promise<void> {
    await this.db
      .prepare(
        "DELETE FROM asset_acl WHERE asset_id = ? AND principal_type = ? AND principal_id = ?",
      )
      .run(assetId, principalType, principalId);
  }

  async canAccess(
    workspaceId: string,
    assetId: string,
    subject: string,
    needWrite: boolean,
  ): Promise<boolean> {
    const asset = await this.getAsset(workspaceId, assetId);
    if (!asset) return false;
    if (asset.ownerSubject === subject) return true;
    const member = (await this.db
      .prepare(
        "SELECT role FROM workspace_members WHERE workspace_id = ? AND subject = ? AND status = 'active'",
      )
      .get(workspaceId, subject)) as { role: string } | undefined;
    if (member) {
      if (!needWrite && ["admin", "editor", "viewer"].includes(member.role)) return true;
      if (needWrite && ["admin", "editor"].includes(member.role)) return true;
    }
    const acl = (await this.db
      .prepare(
        "SELECT role FROM asset_acl WHERE asset_id = ? AND principal_id = ? AND principal_type = 'user'",
      )
      .get(assetId, subject)) as { role: string } | undefined;
    if (acl) {
      if (!needWrite && ["editor", "viewer"].includes(acl.role)) return true;
      if (needWrite && acl.role === "editor") return true;
    }
    if (!needWrite && ["public", "link", "unlisted"].includes(asset.visibility)) return true;
    return false;
  }

  /* ---------------- proposed patches (AI) ---------------- */

  async createProposedPatch(input: {
    assetId: string;
    baseVersionId: string;
    selection: string;
    action: string;
    proposed: string;
  }): Promise<string> {
    const id = nextId("pat");
    await this.db
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

  async getProposedPatch(
    assetId: string,
    patchId: string,
  ): Promise<Record<string, unknown> | null> {
    const row = (await this.db
      .prepare("SELECT * FROM proposed_patches WHERE id = ? AND asset_id = ?")
      .get(patchId, assetId)) as Row | undefined;
    return row ?? null;
  }

  async applyProposedPatch(assetId: string, patchId: string): Promise<string | null> {
    const patch = await this.getProposedPatch(assetId, patchId);
    if (!patch) return null;
    await this.db
      .prepare("UPDATE proposed_patches SET status = 'applied' WHERE id = ?")
      .run(patchId);
    return str(patch.proposed);
  }

  getDb(): Db {
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

export function createStore(db: Db, storage: ObjectStore): Store {
  return new Store(db, storage);
}

export type { DatasetQuery, DatasetQueryResult, PresentationDocument, ResearchSpec };
