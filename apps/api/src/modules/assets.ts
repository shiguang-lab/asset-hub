import { posix as pathPosix } from "node:path";
import { inflateSync } from "node:zlib";
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
  assetPathSchema,
  createAssetInputSchema,
  listAssetsQuerySchema,
  nextId,
  nowIso,
  updateAssetInputSchema,
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

async function permanentDeleteAsset(
  ctx: AppContext,
  actor: ActorContext,
  assetId: string,
): Promise<void> {
  const objectKeys = await ctx.store.listAssetBlobKeys(actor.workspaceId, assetId);
  await ctx.store.permanentDelete(actor, assetId);
  await Promise.all(objectKeys.map((key) => ctx.storage.delete(key)));
}

/**
 * 校验批量操作目标资产权限：永久删除具备幂等性，对已不存在的过期 ID 直接跳过，
 * 避免旧缓存中混入已删除记录时整批报错“资产不存在”。
 */
export async function authorizeBatchAssetIds(
  ctx: AppContext,
  actor: ActorContext,
  ids: string[],
  action: "delete" | "restore" | "permanent",
): Promise<string[]> {
  const authorizedIds: string[] = [];
  for (const id of ids) {
    const asset = await ctx.store.getAsset(actor.workspaceId, id);
    if (!asset) {
      if (action === "permanent") continue;
      throw notFound("资产");
    }
    await requireAssetAccess(ctx, actor, id, "delete");
    authorizedIds.push(id);
  }
  return authorizedIds;
}

export function registerAssets(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/assets", async (req) => {
    const query = listAssetsQuerySchema.parse(req.query);
    const page = await ctx.store.listAssets(req.actor.workspaceId, {
      type: query.type,
      q: query.q,
      status: query.status,
      visibility: query.visibility,
      includeDeleted: query.includeDeleted,
      // 增量同步需要「活跃 + 已删」一起返回才能感知远端删除，而 includeDeleted
      // 表达的是回收站视图（只看已删）。带 since 时切换到 all 范围。
      ...(query.since ? { deletedScope: "all" as const, since: query.since } : {}),
      ...(query.pathPrefix !== undefined ? { pathPrefix: query.pathPrefix } : {}),
      ...(query.sort !== undefined ? { sort: query.sort } : {}),
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
      const result = await ctx.store.idempotent(
        `create-asset:${req.idempotencyKey}`,
        req.actor.workspaceId,
        async () => {
          const content = contentFromInput(input.type, input.content);
          const asset = await ctx.store.createAsset(req.actor, {
            type: input.type,
            title: input.title,
            ...(input.path !== undefined ? { path: input.path } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
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
            { type: asset.type },
          );
          return asset;
        },
      );
      return result.value;
    }
    const content = contentFromInput(input.type, input.content);
    const asset = await ctx.store.createAsset(req.actor, {
      type: input.type,
      title: input.title,
      ...(input.path !== undefined ? { path: input.path } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
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
    const usage = await ctx.store.getStorageUsage(req.actor.workspaceId);
    if (usage.usedBytes + buffer.byteLength > usage.quotaBytes) {
      throw badRequest("STORAGE_QUOTA_EXCEEDED", "工作区存储配额不足");
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
    const parts = [];
    for await (const part of req.files()) {
      if (part.type !== "file") continue;
      parts.push({
        name: part.filename || "document.md",
        data: Buffer.from(await part.toBuffer()),
      });
    }
    if (parts.length === 0) throw badRequest("FILE_REQUIRED", "请选择要导入的文档");

    const totalSize = parts.reduce((sum, part) => sum + part.data.byteLength, 0);
    if (totalSize > MAX_IMPORTED_ARCHIVE_SIZE) {
      throw badRequest("DOCUMENT_TOO_LARGE", "导入内容不能超过 50MB");
    }
    const usage = await ctx.store.getStorageUsage(req.actor.workspaceId);
    if (usage.usedBytes + totalSize > usage.quotaBytes) {
      throw badRequest("STORAGE_QUOTA_EXCEEDED", "工作区存储配额不足");
    }

    const imported = await importDocumentEntries(
      ctx,
      req.actor,
      parts.map((part) => ({ path: part.name, data: part.data })),
      parseImportResolutions(req.query),
      parseImportPathPrefix(req.query),
    );
    for (const item of imported.items) {
      await ctx.bus.emit({
        eventId: nextId("evt"),
        eventType: item.replaced ? "asset.version.created" : "asset.created",
        schemaVersion: 1,
        occurredAt: nowIso(),
        producer: "api",
        tenantId: req.actor.workspaceId,
        aggregate: { type: "asset", id: item.asset.id, version: item.asset.lockVersion },
        trace: {},
        data: {
          assetId: item.asset.id,
          assetType: item.asset.type,
          versionId: item.asset.currentVersionId,
          sourceType: "upload",
        },
      });
      await ctx.store.audit(
        req.actor.workspaceId,
        req.actor.subject,
        "asset.document_import",
        item.asset.id,
        "success",
        {
          fileName: item.path,
          size: totalSize,
          extractedResources: imported.uploadedResources,
          replaced: item.replaced ?? false,
        },
      );
    }

    // Preserve the old single-file response contract. Directory/ZIP imports
    // return all documents and their relative paths for the folder tree UI.
    const originalPath = parts[0]?.name.replaceAll("\\", "/") ?? "";
    const legacySingleFile =
      parts.length === 1 &&
      !originalPath.includes("/") &&
      (!originalPath.toLowerCase().endsWith(".zip") || imported.folders.length === 0);
    if (imported.items.length === 1 && legacySingleFile) {
      return reply.code(201).send(imported.items[0]?.asset);
    }
    return reply.code(201).send({
      assets: imported.items.map((item) => item.asset),
      entries: imported.items.map(({ asset, path }) => ({ asset, path })),
      folders: imported.folders,
    });
  });

  // Lightweight pre-import conflict check. The client already knows the file
  // names, so it can compute candidate titles and ask which ones already exist
  // without uploading the payload twice. Returns a title -> assetId map.
  app.post("/api/v1/assets/documents/import/check", async (req, reply) => {
    const body = z
      .object({ titles: z.array(z.string()).max(2000) })
      .parse(req.body ?? { titles: [] });
    const byTitle = await loadExistingDocumentTitles(ctx, req.actor.workspaceId);
    const found: Record<string, string> = {};
    for (const title of body.titles) {
      const existing = byTitle.get(title);
      if (existing) found[title] = existing.id;
    }
    return reply.send({ existing: found });
  });

  app.get("/api/v1/assets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND", detail: "资产不存在" });
    const content = await ctx.store.readContent(id);
    // 暴露乐观锁版本，供客户端构造后续写请求的 If-Match。
    return reply.header("etag", `"${asset.lockVersion}"`).send({ ...asset, content });
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
        payload = {
          data,
          mediaType: blob.mediaType,
          fileName: downloadFileName(asset, blob.mediaType),
        };
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

  app.get("/api/v1/assets/:id/thumbnail", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { v } = (req.query as { v?: string }) ?? {};
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND", detail: "资产不存在" });
    const requestedVersion = v?.split(":")[0] || undefined;
    const thumb =
      (requestedVersion ? await ctx.store.getAssetThumbnail(id, requestedVersion) : null) ??
      (await ctx.store.getAssetThumbnail(id));
    if (!thumb)
      return reply.code(404).send({ code: "THUMBNAIL_NOT_FOUND", detail: "封面尚未生成" });
    const data = await ctx.storage.get(thumb.objectKey);
    if (!data) return reply.code(404).send({ code: "THUMBNAIL_NOT_FOUND", detail: "封面文件缺失" });
    const cacheControl =
      v && v === `${thumb.versionId}:${thumb.contentHash}`
        ? "public, max-age=31536000, immutable"
        : "private, max-age=60";
    return reply
      .type(thumb.mediaType)
      .header("cache-control", cacheControl)
      .header("content-length", String(data.byteLength))
      .send(data);
  });

  app.patch("/api/v1/assets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateAssetInputSchema.parse(req.body);
    const expectedVersion = ifMatchVersion(req.headers);
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    if (body.content) {
      const content = contentFromInput(asset.type, body.content);
      if (!content) throw badRequest("CONTENT_INVALID", "内容格式不合法");
      const saved = await ctx.store.saveContent(req.actor, id, content, {
        changeKind: "edit",
        title: body.title,
        ...(body.path !== undefined ? { path: body.path } : {}),
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
      return reply.header("etag", `"${saved.asset.lockVersion}"`).send(saved.asset);
    }
    const updated = await ctx.store.updateAssetMeta(req.actor, id, body, expectedVersion);
    const result = updated ?? asset;
    if (updated) {
      ctx.sse.broadcast(req.actor.workspaceId, {
        id: nextId("evt"),
        event: "asset.updated",
        data: { assetId: id, lockVersion: result.lockVersion },
      });
    }
    return reply.header("etag", `"${result.lockVersion}"`).send(result);
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
    await permanentDeleteAsset(ctx, req.actor, id);
    ctx.sse.broadcast(req.actor.workspaceId, {
      id: nextId("evt"),
      event: "asset.updated",
      data: { assetId: id, permanentDeleted: true },
    });
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
          "version_of",
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
        action: z.enum(["delete", "restore", "permanent"]),
        ids: z.array(z.string()).min(1),
      })
      .parse(req.body);
    const targetIds = await authorizeBatchAssetIds(ctx, req.actor, body.ids, body.action);
    let changed = 0;
    if (body.action === "permanent") {
      for (const id of targetIds) {
        await permanentDeleteAsset(ctx, req.actor, id);
        changed += 1;
      }
    } else if (targetIds.length > 0) {
      changed = await ctx.store.batchUpdateAssets(req.actor, targetIds, body.action);
    }
    if (changed > 0) {
      ctx.sse.broadcast(req.actor.workspaceId, {
        id: nextId("evt"),
        event: "asset.updated",
        data: { assetIds: targetIds, action: body.action },
      });
    }
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
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
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
    const kind = asset.type === "html" ? "html" : "markdown";
    const saved = await ctx.store.saveContent(
      req.actor,
      id,
      { kind, text: replaced, manifest: null, refs: [] },
      { changeKind: "ai_patch" },
    );
    if (asset.type === "document" || asset.type === "report") {
      await syncContentLinkRelations(ctx, req.actor.workspaceId, id, replaced);
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

function downloadFileName(asset: Pick<Asset, "type" | "title">, mediaType: string): string {
  const baseName = asset.title.trim() || "download";
  if (asset.type === "document" || asset.type === "report" || mediaType === "text/markdown") {
    return withExtension(baseName, ".md");
  }
  if (asset.type === "html" || mediaType === "text/html") {
    return withExtension(baseName, ".html");
  }
  if (
    asset.type === "presentation" ||
    asset.type === "dataset" ||
    mediaType === "application/json"
  ) {
    return withExtension(baseName, ".json");
  }
  return baseName;
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

const MAX_IMPORTED_DOCUMENT_SIZE = 10 * 1024 * 1024;
const IMPORTED_DOCUMENT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "txt",
  "html",
  "htm",
  "docx",
  "pdf",
]);

function extractDocxToMarkdown(buffer: Buffer): string {
  try {
    const entries = readZipEntries(buffer);
    const docXmlBuf = entries.get("word/document.xml");
    if (!docXmlBuf) {
      throw new Error("DOCX 缺少 word/document.xml");
    }
    const xml = docXmlBuf.toString("utf8");
    const paragraphs: string[] = [];
    const pMatches = xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g);
    for (const match of pMatches) {
      const pBody = match[1];
      if (!pBody) continue;
      const headingMatch = pBody.match(/<w:pStyle\s+w:val="Heading(\d)"\s*\/>/i);
      const headingLevel =
        headingMatch && headingMatch[1] ? Number.parseInt(headingMatch[1], 10) : 0;

      const texts: string[] = [];
      const tMatches = pBody.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g);
      for (const tm of tMatches) {
        if (tm[1]) texts.push(tm[1]);
      }
      const pText = texts.join("").trim();
      if (!pText) continue;

      if (headingLevel > 0 && headingLevel <= 6) {
        paragraphs.push(`${"#".repeat(headingLevel)} ${pText}`);
      } else {
        paragraphs.push(pText);
      }
    }
    const result = paragraphs.join("\n\n").trim();
    if (!result) throw new Error("DOCX 内容为空");
    return result;
  } catch (err) {
    throw badRequest(
      "DOCUMENT_CONTENT_INVALID",
      `DOCX 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function decodePdfString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractPdfToMarkdown(buffer: Buffer): string {
  try {
    const raw = buffer.toString("latin1");
    if (!raw.startsWith("%PDF-")) {
      throw new Error("不是有效的 PDF 格式");
    }
    const lines: string[] = [];
    const streamMatches = raw.matchAll(/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g);
    for (const sm of streamMatches) {
      const rawStream = sm[1];
      if (!rawStream) continue;
      const streamBytes = Buffer.from(rawStream, "latin1");
      let decompressed = streamBytes;
      try {
        decompressed = inflateSync(streamBytes);
      } catch {
        // Stream may be plain ASCII or already decoded
      }
      const streamText = decompressed.toString("latin1");
      const btMatches = streamText.matchAll(/BT[\r\n]+([\s\S]*?)[\r\n]+ET/g);
      for (const bt of btMatches) {
        const btBody = bt[1];
        if (!btBody) continue;
        const blockTokens: string[] = [];
        const tjMatches = btBody.matchAll(/\(([^)]*)\)\s*(?:Tj|'|")/g);
        for (const tm of tjMatches) {
          if (tm[1]) blockTokens.push(decodePdfString(tm[1]));
        }
        const tjArrayMatches = btBody.matchAll(/\[([\s\S]*?)\]\s*TJ/g);
        for (const tam of tjArrayMatches) {
          const arrayContent = tam[1];
          if (!arrayContent) continue;
          const parts = arrayContent.matchAll(/\(([^)]*)\)/g);
          for (const pm of parts) {
            if (pm[1]) blockTokens.push(decodePdfString(pm[1]));
          }
        }
        const combined = blockTokens.join("").trim();
        if (combined.length > 0) {
          lines.push(combined);
        }
      }
    }

    if (lines.length === 0) {
      const directMatches = raw.matchAll(/\(([^)\\]{3,})\)\s*Tj/g);
      for (const dm of directMatches) {
        if (dm[1]) lines.push(decodePdfString(dm[1]));
      }
    }

    const text = lines.join("\n\n").trim();
    if (text.length === 0) {
      throw new Error("未能从 PDF 中提取出可读文本");
    }
    return text;
  } catch (err) {
    throw badRequest(
      "DOCUMENT_CONTENT_INVALID",
      `PDF 解析失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function parseImportedDocumentFile(
  fileName: string,
  buffer: Buffer,
): { title: string; markdown: string } {
  if (buffer.byteLength > MAX_IMPORTED_DOCUMENT_SIZE) {
    throw badRequest("DOCUMENT_TOO_LARGE", "导入文档不能超过 10MB");
  }
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  if (!IMPORTED_DOCUMENT_EXTENSIONS.has(extension)) {
    throw badRequest("DOCUMENT_FORMAT_UNSUPPORTED", "仅支持 Markdown、HTML、TXT、DOCX 和 PDF 文档");
  }

  const title =
    fileName.replace(/\.(?:md|markdown|txt|html|htm|docx|pdf)$/i, "").trim() || "未命名文档";

  if (extension === "docx") {
    return { title, markdown: extractDocxToMarkdown(buffer) };
  }
  if (extension === "pdf") {
    return { title, markdown: extractPdfToMarkdown(buffer) };
  }

  if (buffer.includes(0)) {
    throw badRequest("DOCUMENT_CONTENT_INVALID", "文档不是有效的文本内容");
  }
  const markdown = buffer
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  return { title, markdown };
}

const MAX_IMPORTED_ARCHIVE_SIZE = 50 * 1024 * 1024;
/** 正文里指向这些文本格式的相对链接视为「文档引用」，不自动导入为 file 资产。 */
const TEXT_DOCUMENT_EXTENSIONS = new Set(["md", "markdown", "txt"]);

interface ImportEntry {
  path: string;
  data: Buffer;
}

interface ImportedDocumentItem {
  asset: Asset;
  path: string;
  /** true when this item overwrote an existing asset (resolution = "replace"). */
  replaced?: boolean;
}

/** Per-title conflict resolution chosen by the user before importing. */
export type ImportResolution = "skip" | "replace" | "rename";

interface ImportedDocumentBundle {
  items: ImportedDocumentItem[];
  folders: string[];
  uploadedResources: number;
}

/**
 * Import a flat multipart file list or ZIP archive as one document tree.
 * Every text file gets a document asset first, so links can be resolved even
 * when two documents refer to each other. A second pass rewrites those links
 * after all ids are known.
 *
 * `resolutions` lets the client decide what to do when a candidate title
 * already exists: "skip" drops the entry, "replace" overwrites the existing
 * asset's content, "rename" imports under an auto-suffixed title.
 */
function parseImportResolutions(query: unknown): Record<string, ImportResolution> {
  const raw = (query as { resolutions?: unknown })?.resolutions;
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, ImportResolution>;
    const out: Record<string, ImportResolution> = {};
    for (const [title, value] of Object.entries(parsed)) {
      if (value === "skip" || value === "replace" || value === "rename") out[title] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 导入目标目录。目录页在某个目录下导入时带上 `pathPrefix`，导入的文件会落进
 * 该目录，而不是前端另造一套目录 id。非法值按根目录处理。
 */
export function parseImportPathPrefix(query: unknown): string {
  const raw = (query as { pathPrefix?: unknown })?.pathPrefix;
  if (typeof raw !== "string" || raw.length === 0) return "";
  const parsed = assetPathSchema.safeParse(raw);
  return parsed.success ? parsed.data : "";
}

/** 把导入用的相对路径挂到目标目录下；前缀为空时原样返回。 */
export function withImportPrefix(pathPrefix: string, path: string): string {
  return pathPrefix ? `${pathPrefix}/${path}` : path;
}

async function loadExistingDocumentAssets(ctx: AppContext, workspaceId: string): Promise<Asset[]> {
  const pages = await Promise.all(
    (["document", "html"] as const).map((type) =>
      ctx.store.listAssets(workspaceId, { type, limit: 2000 }),
    ),
  );
  return pages.flatMap((page) => page.items);
}

async function loadExistingDocumentTitles(
  ctx: AppContext,
  workspaceId: string,
): Promise<Map<string, Asset>> {
  const assets = await loadExistingDocumentAssets(ctx, workspaceId);
  return new Map(assets.map((asset) => [asset.title, asset]));
}

function uniqueTitle(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let n = 1;
  while (used.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/**
 * 为「重命名」冲突处理生成不与现有资产路径冲突的 `assets.path`，
 * 避免 `title` 已追加后缀但 `path` 仍沿用原值而触发 `uq_assets_path` 409 冲突。
 */
export function uniqueImportAssetPath(
  basePath: string,
  preferredTitle: string,
  usedPaths: Set<string>,
): string {
  if (!basePath) return "";
  const slash = basePath.lastIndexOf("/");
  const dirPrefix = slash >= 0 ? basePath.slice(0, slash + 1) : "";
  const preferred = `${dirPrefix}${preferredTitle.normalize("NFC")}`;
  if (!usedPaths.has(preferred)) return preferred;
  const stem = basePath.slice(slash + 1);
  let n = 1;
  while (usedPaths.has(`${dirPrefix}${stem} (${n})`)) n += 1;
  return `${dirPrefix}${stem} (${n})`;
}

async function importDocumentEntries(
  ctx: AppContext,
  actor: ActorContext,
  parts: ImportEntry[],
  resolutions: Record<string, ImportResolution> = {},
  pathPrefix = "",
): Promise<ImportedDocumentBundle> {
  const entries = expandImportEntries(parts);
  const normalized = normalizeImportEntries(entries);
  const documents = normalized.filter((entry) => isImportedDocument(entry.path));
  if (documents.length === 0)
    throw badRequest("NO_MARKDOWN_IN_FOLDER", "文件夹中未找到 Markdown 或 HTML 文档");

  const existingAssets = await loadExistingDocumentAssets(ctx, actor.workspaceId);
  const existingByTitle = new Map(existingAssets.map((asset) => [asset.title, asset]));
  const usedTitles = new Set(existingByTitle.keys());
  const usedPaths = new Set(existingAssets.map((asset) => asset.path).filter(Boolean));

  const items: ImportedDocumentItem[] = [];
  const pathToAsset = new Map<string, Asset>();
  const markdownByPath = new Map<string, string>();

  for (const entry of documents) {
    const baseName = pathPosix.basename(entry.path);
    const parsed = parseImportedDocumentFile(baseName, entry.data);
    const extension = baseName.split(".").at(-1)?.toLowerCase() ?? "";
    const isHtml = extension === "html" || extension === "htm";
    const path = normalizeResourcePath(entry.path);
    const resolution = resolutions[parsed.title];
    if (resolution === "skip") continue;

    let asset: Asset;
    let replaced = false;
    if (resolution === "replace" && existingByTitle.has(parsed.title)) {
      asset = existingByTitle.get(parsed.title) as Asset;
      await requireAssetAccess(ctx, actor, asset.id, "write");
      replaced = true;
      if (isHtml || asset.type === "html") {
        const saved = await ctx.store.saveContent(
          actor,
          asset.id,
          { kind: "html", text: parsed.markdown, manifest: null, refs: [] },
          { changeKind: "import", metadata: { importPath: path } },
        );
        asset = saved.asset;
      }
    } else {
      const title = resolution === "rename" ? uniqueTitle(parsed.title, usedTitles) : parsed.title;
      const baseAssetPath = importPathToAssetPath(withImportPrefix(pathPrefix, path));
      const assetPath =
        resolution === "rename"
          ? uniqueImportAssetPath(baseAssetPath, title, usedPaths)
          : baseAssetPath;
      asset = await ctx.store.createAsset(actor, {
        type: isHtml ? "html" : "document",
        title,
        // 导入路径同时写入正式 path 字段，使导入的目录结构对 Web 与插件都可见。
        path: assetPath,
        sourceType: "upload",
        metadata: { importPath: path },
        content: {
          kind: isHtml ? "html" : "markdown",
          text: parsed.markdown,
          manifest: null,
          refs: [],
        },
      });
    }
    usedTitles.add(asset.title);
    if (asset.path) usedPaths.add(asset.path);
    if (!isHtml) {
      markdownByPath.set(path, parsed.markdown);
    }
    items.push({ asset, path, replaced });
    pathToAsset.set(path, asset);
  }

  const resourceIndex = buildResourceIndex(
    new Map(normalized.map((entry) => [entry.path, entry.data])),
  );
  const resourceAssets = new Map<string, Asset>();
  let uploadedResources = 0;

  for (const item of items) {
    if (item.asset.type === "html") continue;
    const sourceMarkdown = markdownByPath.get(item.path) ?? "";
    const references = extractMarkdownReferences(sourceMarkdown);
    for (const ref of references) {
      if (!isLocalReference(ref.src)) continue;
      const targetPath = resolveImportReference(item.path, ref.src);
      if (pathToAsset.has(targetPath) || resourceAssets.has(targetPath)) continue;
      const extension = targetPath.split(".").at(-1)?.toLowerCase() ?? "";
      if (TEXT_DOCUMENT_EXTENSIONS.has(extension)) continue;
      const data = resourceIndex.get(targetPath);
      if (!data) continue;
      resourceAssets.set(targetPath, await uploadResourceAsset(ctx, actor, targetPath, data));
      uploadedResources += 1;
    }
    const rewritten = rewriteMarkdownReferences(sourceMarkdown, (ref) => {
      if (!isLocalReference(ref.src)) return null;
      const targetPath = resolveImportReference(item.path, ref.src);
      const targetDocument = pathToAsset.get(targetPath);
      if (targetDocument) return `asset:${targetDocument.id}`;
      const resource = resourceAssets.get(targetPath);
      return resource ? `asset:${resource.id}` : null;
    });

    if (rewritten !== sourceMarkdown || item.replaced) {
      const saved = await ctx.store.saveContent(
        actor,
        item.asset.id,
        { kind: "markdown", text: rewritten, manifest: null, refs: [] },
        { changeKind: "import", metadata: { importPath: item.path } },
      );
      item.asset = saved.asset;
    }
    await syncContentLinkRelations(ctx, actor.workspaceId, item.asset.id, rewritten);
  }

  return {
    items,
    folders: collectImportFolders(items.map((item) => withImportPrefix(pathPrefix, item.path))),
    uploadedResources,
  };
}

function expandImportEntries(parts: ImportEntry[]): ImportEntry[] {
  if (parts.length !== 1 || !parts[0]?.path.toLowerCase().endsWith(".zip")) return parts;
  const archive = parts[0];
  try {
    return [...readZipEntries(archive.data)].map(([path, data]) => ({ path, data }));
  } catch (error) {
    throw badRequest(
      "DOCUMENT_ARCHIVE_INVALID",
      error instanceof Error ? error.message : "ZIP 归档无效",
    );
  }
}

function normalizeImportEntries(entries: ImportEntry[]): ImportEntry[] {
  const cleaned = entries
    .map((entry) => {
      const path = pathPosix.normalize(normalizeResourcePath(entry.path));
      return { path, data: entry.data };
    })
    .filter((entry) => entry.path !== ".." && !entry.path.startsWith("../"))
    .filter((entry) => entry.path && !entry.path.startsWith("__MACOSX/"));
  // Browsers include the selected directory name in webkitRelativePath. Drop
  // one common root so only real child directories appear in the app.
  const roots = cleaned.map((entry) => entry.path.split("/")[0]).filter(Boolean);
  const commonRoot = roots.length > 0 && roots.every((root) => root === roots[0]) ? roots[0] : null;
  return commonRoot && cleaned.some((entry) => entry.path.includes("/"))
    ? cleaned.map((entry) => ({ ...entry, path: entry.path.slice(commonRoot.length + 1) }))
    : cleaned;
}

function isImportedDocument(path: string): boolean {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return IMPORTED_DOCUMENT_EXTENSIONS.has(extension);
}

export function resolveImportReference(sourcePath: string, source: string): string {
  const withoutSuffix = source.trim().split(/[?#]/, 1)[0] ?? "";
  const joined = withoutSuffix.startsWith("/")
    ? withoutSuffix
    : pathPosix.join(pathPosix.dirname(sourcePath), withoutSuffix);
  const normalized = pathPosix.normalize(joined).replace(/^\.\//, "");
  return normalizeResourcePath(normalized);
}

/**
 * 把导入用的相对文件路径转成 assets.path：去掉扩展名并规范化为 NFC。
 * 扩展名由 asset.type 推导，故不保留。
 */
export function importPathToAssetPath(path: string): string {
  return normalizeResourcePath(path)
    .replace(/\.[^./]+$/, "")
    .normalize("NFC");
}

export function collectImportFolders(paths: string[]): string[] {
  const folders = new Set<string>();
  for (const path of paths) {
    const segments = normalizeResourcePath(path).split("/");
    segments.pop();
    for (let i = 1; i <= segments.length; i += 1) folders.add(segments.slice(0, i).join("/"));
  }
  return [...folders].sort((a, b) => a.localeCompare(b));
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
