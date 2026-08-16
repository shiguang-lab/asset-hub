import {
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
import type { AppContext } from "../types.js";

export function registerAssets(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  const safeFileName = (name: string): string =>
    name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";

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
    if (buffer.byteLength > 200 * 1024 * 1024) {
      throw badRequest("FILE_TOO_LARGE", "文件不能超过 200MB");
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
    const imported = parseImportedDocumentFile(part.filename || "document.md", buffer);
    const asset = await ctx.store.createAsset(req.actor, {
      type: "document",
      title: imported.title,
      sourceType: "upload",
      content: {
        kind: "markdown",
        text: imported.markdown,
        manifest: null,
        refs: [],
      },
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
      data: { assetId: asset.id, assetType: asset.type, sourceType: "upload" },
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "asset.document_import",
      asset.id,
      "success",
      { fileName: part.filename, size: buffer.byteLength },
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
    if (!blob) throw notFound("文件内容");
    const data = await ctx.storage.get(blob.objectKey);
    if (!data) throw notFound("文件内容");
    const fileName = encodeURIComponent(asset.title || "download");
    return reply
      .type(blob.mediaType)
      .header("content-length", String(data.byteLength))
      .header("content-disposition", `attachment; filename*=UTF-8''${fileName}`)
      .send(data);
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
      {},
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

function ifMatchVersion(
  headers: Record<string, string | string[] | undefined>,
): number | undefined {
  const raw = headers["if-match"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const match = /"(\d+)"/.exec(value);
  return match ? Number(match[1]) : undefined;
}
