import {
  extractMarkdownReferences,
  isLocalReference,
  parseAssetReferences,
  rewriteMarkdownReferences,
  structuredDiff,
} from "@shiguang/content";
import {
  type ActorContext,
  type Asset,
  type AssetContent,
  aiDocumentActionSchema,
  createAssetInputSchema,
  listAssetsQuerySchema,
  nextId,
  nowIso,
} from "@shiguang/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAssetAccess } from "../platform/authorization.js";
import { badRequest, notFound } from "../platform/errors.js";
import { readZipEntries } from "../platform/zip.js";
import type { AppContext } from "../types.js";

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";
}

export function registerAssets(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/assets", async (req) => {
    const query = listAssetsQuerySchema.parse(req.query);
    const page = await ctx.store.listAssets(req.actor.workspaceId, {
      type: query.type,
      q: query.q,
      tag: query.tag,
      status: query.status,
      visibility: query.visibility,
      includeDeleted: query.includeDeleted,
      limit: query.limit,
      after: query.cursor,
      subject: req.actor.subject,
      workspaceRole: req.actor.workspaceRole,
    });
    return page;
  });

  app.get("/api/v1/assets/storage", async (req) => {
    return await ctx.store.getStorageUsage(req.actor.workspaceId);
  });

  app.post("/api/v1/assets", async (req) => {
    const input = createAssetInputSchema.parse(req.body);
    if (req.idempotencyKey) {
      return await ctx.store.idempotent(
        `create-asset:${req.idempotencyKey}`,
        req.actor.workspaceId,
        async () => {
          const content = contentFromInput(input.type, input.content);
          const asset = await ctx.store.createAsset(req.actor, {
            type: input.type,
            title: input.title,
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.tags !== undefined ? { tags: input.tags } : {}),
            ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
            content,
          });
          await ctx.bus.emit({
            eventId: nextId("evt"),
            eventType: "asset.created",
            schemaVersion: 1,
            occurredAt: nowIso(),
            producer: "api",
            tenantId: req.actor.workspaceId,
            aggregate: { type: "asset", id: asset.id, version: 1 },
            trace: {},
            data: { assetId: asset.id, assetType: asset.type },
          });
          ctx.store.audit(
            req.actor.workspaceId,
            req.actor.subject,
            "asset.create",
            asset.id,
            "success",
            { type: asset.type },
          );
          return asset;
        },
      );
    }
    const content = contentFromInput(input.type, input.content);
    const asset = await ctx.store.createAsset(req.actor, {
      type: input.type,
      title: input.title,
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      content,
    });
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "asset.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "asset", id: asset.id, version: 1 },
      trace: {},
      data: { assetId: asset.id, assetType: asset.type },
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "asset.create",
      asset.id,
      "success",
      {
        type: asset.type,
      },
    );
    return asset;
  });

  app.post("/api/v1/assets/files", async (req, reply) => {
    if (!req.isMultipart()) throw badRequest("FILE_REQUIRED", "请上传文件");
    const part = await req.file();
    if (!part) throw badRequest("FILE_REQUIRED", "请上传文件");
    const buffer = Buffer.from(await part.toBuffer());
    if (buffer.byteLength > 100 * 1024 * 1024) {
      throw badRequest("FILE_TOO_LARGE", "文件不能超过 100MB");
    }
    const fileName = part.filename || "file";
    const mediaType = part.mimetype || "application/octet-stream";
    const objectKey = `assets/${req.actor.workspaceId}/files/${Date.now()}-${safeFileName(fileName)}`;
    const stored = await ctx.storage.put(objectKey, buffer, mediaType);
    const asset = await ctx.store.createAsset(req.actor, {
      type: "file",
      title: fileName,
      sourceType: "upload",
      content: {
        kind: "blob",
        text: null,
        manifest: null,
        refs: [
          {
            role: "content",
            objectKey: stored.key,
            contentHash: stored.hash,
            size: stored.size,
            mediaType,
          },
        ],
      },
    });
    return reply.code(201).send({
      ...asset,
      content: {
        kind: "blob",
        text: null,
        manifest: null,
        refs: [
          {
            role: "content",
            objectKey: stored.key,
            contentHash: stored.hash,
            size: stored.size,
            mediaType,
          },
        ],
      },
      downloadPath: `/api/v1/assets/${asset.id}/download`,
    });
  });

  app.post("/api/v1/assets/documents/import", async (req, reply) => {
    if (!req.isMultipart()) throw badRequest("FILE_REQUIRED", "请选择要导入的文档");
    const part = await req.file();
    if (!part) throw badRequest("FILE_REQUIRED", "请选择要导入的文档");
    const buffer = Buffer.from(await part.toBuffer());
    const fileName = part.filename || "document.md";

    const { title, markdown, resources } = parseImportedArchive(fileName, buffer);
    const extracted = await extractAndUploadResources(markdown, resources, (name, data) =>
      uploadResourceAsset(ctx, req.actor, name, data),
    );

    const asset = await ctx.store.createAsset(req.actor, {
      type: "document",
      title,
      sourceType: "upload",
      content: {
        kind: "markdown",
        text: extracted.markdown,
        manifest: null,
        refs: [],
      },
    });
    await syncContentLinkRelations(ctx, req.actor.workspaceId, asset.id, extracted.markdown);
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "asset.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "asset", id: asset.id, version: 1 },
      trace: {},
      data: { assetId: asset.id, assetType: asset.type, sourceType: "upload" },
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "asset.document_import",
      asset.id,
      "success",
      { fileName, size: buffer.byteLength, extractedResources: extracted.uploaded },
    );
    return reply.code(201).send(asset);
  });

  app.get("/api/v1/assets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND", detail: "资产不存在" });
    const content = await ctx.store.readContent(id);
    return { ...asset, content };
  });

  app.get("/api/v1/assets/:id/download", async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    const blob = await ctx.store.getAssetBlob(req.actor.workspaceId, id);
    let payload: { data: Buffer; mediaType: string; fileName: string } | null = null;
    if (blob) {
      const data = await ctx.storage.get(blob.objectKey);
      if (data) {
        payload = { data, mediaType: blob.mediaType, fileName: asset.title || "download" };
      }
    } else {
      payload = downloadableAssetContent(asset, await ctx.store.readContent(id));
    }
    if (!payload) throw notFound("文件内容");
    const fileName = encodeURIComponent(payload.fileName);
    return reply
      .type(payload.mediaType)
      .header("content-length", String(payload.data.byteLength))
      .header("content-disposition", `attachment; filename*=UTF-8''${fileName}`)
      .send(payload.data);
  });

  app.patch("/api/v1/assets/:id", async (req, _reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        visibility: z.enum(["private", "link", "public"]).optional(),
        content: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(req.body);
    const expectedVersion = ifMatchVersion(req.headers);
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    if (body.content) {
      const content = contentFromInput(asset.type, body.content);
      if (!content) throw badRequest("CONTENT_INVALID", "内容格式不合法");
      const saved = await ctx.store.saveContent(req.actor, id, content, {
        changeKind: "edit",
        title: body.title,
        expectedLockVersion: expectedVersion,
      });
      if (asset.type === "document" || asset.type === "report") {
        await syncContentLinkRelations(ctx, req.actor.workspaceId, id, content.text ?? "");
      }
      await ctx.bus.emit({
        eventId: nextId("evt"),
        eventType: "asset.version.created",
        schemaVersion: 1,
        occurredAt: nowIso(),
        producer: "api",
        tenantId: req.actor.workspaceId,
        aggregate: { type: "asset", id, version: saved.asset.lockVersion },
        trace: {},
        data: { assetId: id, versionId: saved.version.id, contentHash: saved.version.contentHash },
      });
      return saved.asset;
    }
    const updated = await ctx.store.updateAssetMeta(req.actor, id, body, expectedVersion);
    return updated ?? asset;
  });

  app.delete("/api/v1/assets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    await ctx.store.softDelete(req.actor, id);
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "asset.deleted",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "asset", id, version: asset.lockVersion + 1 },
      trace: {},
      data: { assetId: id, deletedAt: nowIso() },
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "asset.delete",
      id,
      "success",
      {},
    );
    return reply.code(204).send();
  });

  app.post("/api/v1/assets/:id/restore", async (req, _reply) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    await ctx.store.restore(req.actor, id);
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "asset.restored",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "asset", id, version: asset.lockVersion + 1 },
      trace: {},
      data: { assetId: id },
    });
    return { ok: true };
  });

  app.post("/api/v1/assets/:id/permanent", async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    const objectKeys = await ctx.store.listAssetBlobKeys(req.actor.workspaceId, id);
    await ctx.store.permanentDelete(req.actor, id);
    await Promise.all(objectKeys.map((key) => ctx.storage.delete(key)));
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "asset.permanent_delete",
      id,
      "success",
      {},
    );
    return reply.code(204).send();
  });

  app.get("/api/v1/assets/:id/versions", async (req) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    return await ctx.store.listVersions(id);
  });

  app.post("/api/v1/assets/:id/versions/:versionId/restore", async (req) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    const content = await ctx.store.readContent(id, versionId);
    if (!content) throw notFound("版本内容");
    const saved = await ctx.store.saveContent(req.actor, id, content, { changeKind: "restore" });
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "asset.version.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "asset", id, version: saved.asset.lockVersion },
      trace: {},
      data: { assetId: id, versionId: saved.version.id, contentHash: saved.version.contentHash },
    });
    return saved.asset;
  });

  app.get("/api/v1/assets/:id/versions/:versionId/diff", async (req) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    const query = req.query as { base?: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    const target = await ctx.store.readContent(id, versionId);
    if (!target) throw notFound("版本内容");

    const baseVersionId = query.base ?? (await previousVersionId(ctx, id, versionId));
    if (!baseVersionId) throw notFound("对比基准版本");
    const base = await ctx.store.readContent(id, baseVersionId);
    if (!base) throw notFound("对比基准内容");

    const kind =
      target.kind === "html"
        ? ("html" as const)
        : target.kind === "manifest" || target.kind === "presentation" || target.kind === "source"
          ? ("manifest" as const)
          : ("markdown" as const);
    const baseText = contentText(base);
    const targetText = contentText(target);
    const diff = structuredDiff(kind, baseText, targetText);

    return { baseVersionId, targetVersionId: versionId, diff };
  });

  app.get("/api/v1/assets/:id/relations", async (req) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    return await ctx.store.listRelations(id);
  });

  app.post("/api/v1/assets/:id/relations", async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        targetAssetId: z.string(),
        relationType: z.enum([
          "generated_from",
          "derived_from",
          "knowledge_source_of",
          "output_of",
          "references",
          "source_of",
        ]),
      })
      .parse(req.body);
    await requireAssetAccess(ctx, req.actor, body.targetAssetId, "read");
    const relation = await ctx.store.addRelation(
      req.actor.workspaceId,
      id,
      body.targetAssetId,
      body.relationType,
      { sources: ["attachment"] },
    );
    return relation;
  });

  app.get("/api/v1/search", async (req) => {
    const query = z
      .object({
        q: z.string().min(1).max(200),
        limit: z.coerce.number().min(1).max(50).default(10),
      })
      .parse(req.query);
    const assets = await ctx.store.searchAssets(req.actor.workspaceId, query.q, query.limit, {
      subject: req.actor.subject,
      workspaceRole: req.actor.workspaceRole,
    });
    const tasks = (
      await ctx.store.listTasks(req.actor.workspaceId, { limit: query.limit })
    ).items.filter((t) => t.goal.toLowerCase().includes(query.q.toLowerCase()));
    const knowledgeBases = (await ctx.store.listKnowledgeBases(req.actor.workspaceId)).filter(
      (kb) => kb.name.toLowerCase().includes(query.q.toLowerCase()),
    );
    return { assets, tasks, knowledgeBases };
  });

  app.post("/api/v1/assets:batch", async (req) => {
    const body = z
      .object({
        action: z.enum(["delete", "restore", "tag"]),
        ids: z.array(z.string()).min(1),
        tags: z.array(z.string()).optional(),
      })
      .parse(req.body);
    await Promise.all(
      body.ids.map((id) =>
        requireAssetAccess(ctx, req.actor, id, body.action === "tag" ? "write" : "delete"),
      ),
    );
    const changed = await ctx.store.batchUpdateAssets(req.actor, body.ids, body.action, body.tags);
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      `asset.batch.${body.action}`,
      body.ids.join(","),
      "success",
      { count: changed },
    );
    return { changed };
  });

  /* ---------------- AI document actions ---------------- */

  app.post("/api/v1/assets/:id/ai-action", async (req) => {
    const { id } = req.params as { id: string };
    const input = aiDocumentActionSchema.parse(req.body);
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    const content = await ctx.store.readContent(id);
    const baseVersionId = content ? (asset.currentVersionId as string) : "";
    const res = await ctx.ai.complete({
      messages: [
        {
          role: "system",
          content:
            "你是文档助手。根据用户选区执行 document-action，保持事实不变，输出处理后的文本。",
        },
        {
          role: "user",
          content: `document-action\naction: ${input.action}\nlanguage: ${input.language ?? "中文"}\ntone: ${input.tone ?? "专业"}\nselection:\n${input.selection}`,
        },
      ],
      quality: "economy",
    });
    const patchId = await ctx.store.createProposedPatch({
      assetId: id,
      baseVersionId,
      selection: input.selection,
      action: input.action,
      proposed: res.text,
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "asset.ai_action",
      id,
      "success",
      {
        action: input.action,
      },
    );
    return { patchId, proposed: res.text, baseVersionId, usage: res.usage, provider: res.provider };
  });

  app.post("/api/v1/assets/:id/patches/:patchId/apply", async (req) => {
    const { id, patchId } = req.params as { id: string; patchId: string };
    const patch = await ctx.store.getProposedPatch(id, patchId);
    if (!patch) throw notFound("AI 补丁");
    const proposed = await ctx.store.applyProposedPatch(id, patchId);
    if (proposed === null) throw badRequest("PATCH_ALREADY_APPLIED", "该补丁已应用");
    const content = await ctx.store.readContent(id);
    const current = content?.text ?? "";
    const selection = String(patch.selection ?? "");
    const replaced = current.includes(selection)
      ? current.replace(selection, proposed)
      : `${current}\n\n${proposed}`;
    const saved = await ctx.store.saveContent(
      req.actor,
      id,
      { kind: "markdown", text: replaced, manifest: null, refs: [] },
      { changeKind: "ai_patch" },
    );
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "asset.version.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "asset", id, version: saved.asset.lockVersion },
      trace: {},
      data: { assetId: id, versionId: saved.version.id, contentHash: saved.version.contentHash },
    });
    return saved.asset;
  });
}

function isPureContentLink(provenance: Record<string, unknown>): boolean {
  const sources = provenance.sources;
  if (!Array.isArray(sources)) return false;
  const list = sources.filter((source): source is string => typeof source === "string");
  return list.includes("content-link") && !list.includes("attachment");
}

async function syncContentLinkRelations(
  ctx: AppContext,
  workspaceId: string,
  assetId: string,
  markdown: string,
): Promise<void> {
  const targetIds = new Set(parseAssetReferences(markdown).map((ref) => ref.assetId));
  const existing = await ctx.store.listRelations(assetId);
  const stale = existing.filter(
    (entry) =>
      entry.direction === "out" &&
      entry.relation.relationType === "references" &&
      isPureContentLink(entry.relation.provenance),
  );

  for (const targetId of targetIds) {
    const target = await ctx.store.getAsset(workspaceId, targetId);
    if (!target) continue; // 目标不存在（已永久删除）时跳过，避免外键约束失败
    await ctx.store.addRelation(workspaceId, assetId, targetId, "references", {
      sources: ["content-link"],
    });
  }

  for (const entry of stale) {
    if (!targetIds.has(entry.relation.targetAssetId)) {
      await ctx.store.deleteRelation(assetId, entry.relation.targetAssetId, "references");
    }
  }
}

export function downloadableAssetContent(
  asset: Pick<Asset, "type" | "title">,
  content: AssetContent | null,
): { data: Buffer; mediaType: string; fileName: string } | null {
  if (!content) return null;
  const baseName = asset.title.trim() || "download";
  if (content.kind === "markdown" || asset.type === "document" || asset.type === "report") {
    if (content.text === null) return null;
    return {
      data: Buffer.from(content.text, "utf8"),
      mediaType: "text/markdown; charset=utf-8",
      fileName: withExtension(baseName, ".md"),
    };
  }
  if (content.kind === "html" || asset.type === "html") {
    if (content.text === null) return null;
    return {
      data: Buffer.from(content.text, "utf8"),
      mediaType: "text/html; charset=utf-8",
      fileName: withExtension(baseName, ".html"),
    };
  }
  if (content.manifest) {
    return {
      data: Buffer.from(JSON.stringify(content.manifest, null, 2), "utf8"),
      mediaType: "application/json; charset=utf-8",
      fileName: withExtension(baseName, ".json"),
    };
  }
  if (content.text !== null) {
    return {
      data: Buffer.from(content.text, "utf8"),
      mediaType: "text/plain; charset=utf-8",
      fileName: withExtension(baseName, ".txt"),
    };
  }
  return null;
}

function withExtension(fileName: string, extension: string): string {
  return fileName.toLowerCase().endsWith(extension) ? fileName : `${fileName}${extension}`;
}

function contentFromInput(
  type: string,
  content?: Record<string, unknown>,
): AssetContent | undefined {
  if (!content) return undefined;
  if (type === "document" || type === "report") {
    return {
      kind: "markdown",
      text: String(content.markdown ?? content.text ?? ""),
      manifest: null,
      refs: [],
    };
  }
  if (type === "html") {
    return {
      kind: "html",
      text: String(content.html ?? content.source ?? ""),
      manifest: null,
      refs: [],
    };
  }
  if (type === "presentation" || type === "dataset" || type === "chart" || type === "source") {
    return { kind: "manifest", text: null, manifest: content, refs: [] };
  }
  return undefined;
}

const MAX_IMPORTED_DOCUMENT_SIZE = 5 * 1024 * 1024;
const IMPORTED_DOCUMENT_EXTENSIONS = new Set(["md", "markdown", "txt"]);

export function parseImportedDocumentFile(
  fileName: string,
  buffer: Buffer,
): { title: string; markdown: string } {
  if (buffer.byteLength > MAX_IMPORTED_DOCUMENT_SIZE) {
    throw badRequest("DOCUMENT_TOO_LARGE", "导入文档不能超过 5MB");
  }
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  if (!IMPORTED_DOCUMENT_EXTENSIONS.has(extension)) {
    throw badRequest("DOCUMENT_FORMAT_UNSUPPORTED", "仅支持 Markdown 和纯文本文档");
  }
  if (buffer.includes(0)) {
    throw badRequest("DOCUMENT_CONTENT_INVALID", "文档不是有效的文本内容");
  }
  const title = fileName.replace(/\.(?:md|markdown|txt)$/i, "").trim() || "未命名文档";
  const markdown = buffer
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  return { title, markdown };
}

const MAX_IMPORTED_ARCHIVE_SIZE = 50 * 1024 * 1024;
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
/** 正文里指向这些文本格式的相对链接视为「文档引用」，不自动导入为 file 资产。 */
const TEXT_DOCUMENT_EXTENSIONS = new Set(["md", "markdown", "txt"]);

interface ParsedImport {
  title: string;
  markdown: string;
  resources?: Map<string, Buffer>;
}

/** 支持单文件（md/markdown/txt）与 ZIP 归档（md + 图片/资源目录）。 */
function parseImportedArchive(fileName: string, buffer: Buffer): ParsedImport {
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  if (extension === "zip") {
    if (buffer.byteLength > MAX_IMPORTED_ARCHIVE_SIZE) {
      throw badRequest("DOCUMENT_TOO_LARGE", "导入压缩包不能超过 50MB");
    }
    const entries = readZipEntries(buffer);
    const markdownName = pickMarkdownEntry(entries);
    if (!markdownName) throw badRequest("NO_MARKDOWN_IN_ZIP", "ZIP 中未找到 Markdown 文档");
    const doc = entries.get(markdownName);
    if (!doc) throw badRequest("NO_MARKDOWN_IN_ZIP", "ZIP 中未找到 Markdown 文档");
    const parsed = parseImportedDocumentFile(markdownName, doc);
    return { title: parsed.title, markdown: parsed.markdown, resources: entries };
  }
  const parsed = parseImportedDocumentFile(fileName, buffer);
  return { title: parsed.title, markdown: parsed.markdown };
}

function pickMarkdownEntry(entries: Map<string, Buffer>): string | null {
  const candidates = [...entries.keys()].filter((name) => {
    const ext = name.split(".").at(-1)?.toLowerCase() ?? "";
    return MARKDOWN_EXTENSIONS.has(ext);
  });
  if (candidates.length === 0) return null;
  const priority = (name: string): number => {
    const base = normalizeResourcePath(name).toLowerCase();
    if (base === "index.md" || base === "index.markdown") return 0;
    if (base === "readme.md" || base === "readme.markdown") return 1;
    return base.includes("/") ? 3 : 2;
  };
  return candidates.sort((a, b) => priority(a) - priority(b))[0] ?? null;
}

/**
 * 提取正文里引用的相对资源，逐一交给 `upload` 上传为 file 资产，并把正文重写为 `asset:<id>`。
 * 纯逻辑与存储解耦：`upload` 只需返回新资产 id，便于单测。
 */
export async function extractAndUploadResources(
  markdown: string,
  resources: Map<string, Buffer> | undefined,
  upload: (name: string, data: Buffer) => Promise<{ id: string }>,
): Promise<{ markdown: string; uploaded: number }> {
  const refs = extractMarkdownReferences(markdown);
  if (refs.length === 0 || !resources) return { markdown, uploaded: 0 };
  const index = buildResourceIndex(resources);
  const srcToAsset = new Map<string, string>();

  for (const ref of refs) {
    if (srcToAsset.has(ref.src)) continue;
    if (!isLocalReference(ref.src)) continue;
    const data = resolveResource(index, ref.src);
    if (!data) continue;
    const ext = ref.src.split(".").at(-1)?.toLowerCase() ?? "";
    if (TEXT_DOCUMENT_EXTENSIONS.has(ext)) continue; // 文档间引用不自动导入
    const asset = await upload(ref.src, data);
    srcToAsset.set(ref.src, asset.id);
  }

  if (srcToAsset.size === 0) return { markdown, uploaded: 0 };
  const rewritten = rewriteMarkdownReferences(markdown, (ref) => {
    const assetId = srcToAsset.get(ref.src);
    return assetId ? `asset:${assetId}` : null;
  });
  return { markdown: rewritten, uploaded: srcToAsset.size };
}

async function uploadResourceAsset(
  ctx: AppContext,
  actor: ActorContext,
  name: string,
  data: Buffer,
): Promise<Asset> {
  const mediaType = mimeFromName(name);
  const baseName = name.split("/").at(-1) || "resource";
  const objectKey = `assets/${actor.workspaceId}/files/${Date.now()}-${safeFileName(baseName)}`;
  const stored = await ctx.storage.put(objectKey, data, mediaType);
  return ctx.store.createAsset(actor, {
    type: "file",
    title: baseName,
    sourceType: "upload",
    content: {
      kind: "blob",
      text: null,
      manifest: null,
      refs: [
        {
          role: "content",
          objectKey: stored.key,
          contentHash: stored.hash,
          size: stored.size,
          mediaType,
        },
      ],
    },
  });
}

function buildResourceIndex(resources: Map<string, Buffer>): Map<string, Buffer> {
  const index = new Map<string, Buffer>();
  for (const [name, data] of resources) {
    const normalized = normalizeResourcePath(name);
    if (!normalized) continue;
    if (!index.has(normalized)) index.set(normalized, data);
  }
  return index;
}

function resolveResource(index: Map<string, Buffer>, src: string): Buffer | null {
  const normalized = normalizeResourcePath(src);
  if (!normalized) return null;
  return index.get(normalized) ?? null;
}

/** 归一化归档内路径：反斜杠转正斜杠、剥掉 `./` 与 `/` 前缀、折叠重复斜杠、安全解码百分号。 */
function normalizeResourcePath(path: string): string {
  let out = path.trim().replaceAll("\\", "/");
  try {
    out = decodeURIComponent(out);
  } catch {
    // 保留原样
  }
  while (out.startsWith("./")) out = out.slice(2);
  out = out.replace(/\/+/g, "/");
  while (out.startsWith("/")) out = out.slice(1);
  return out;
}

function mimeFromName(name: string): string {
  const ext = name.split(".").at(-1)?.toLowerCase() ?? "";
  const table: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    ico: "image/x-icon",
    pdf: "application/pdf",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    zip: "application/zip",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return table[ext] ?? "application/octet-stream";
}

async function previousVersionId(
  ctx: AppContext,
  assetId: string,
  versionId: string,
): Promise<string | null> {
  const versions = await ctx.store.listVersions(assetId);
  const target = versions.find((v) => v.id === versionId);
  if (!target) return null;
  return versions.find((v) => v.sequence === target.sequence - 1)?.id ?? null;
}

function contentText(content: AssetContent): string {
  if (content.text !== null) return content.text;
  if (content.manifest) return JSON.stringify(content.manifest, null, 2);
  return "";
}

function ifMatchVersion(
  headers: Record<string, string | string[] | undefined>,
): number | undefined {
  const raw = headers["if-match"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const match = /"(\d+)"/.exec(value);
  return match ? Number(match[1]) : undefined;
}
