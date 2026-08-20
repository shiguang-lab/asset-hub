import { createHash } from "node:crypto";
import {
  type AssetLinkResolver,
  type PresentationRenderDocument,
  parseAssetReferences,
  parseHtmlAssetReferences,
  renderPresentationHtml,
} from "@shiguang/content";
import {
  type Asset,
  type AssetContent,
  nextId,
  nowIso,
  presentationDocumentSchema,
} from "@shiguang/contracts";
import { hashPassword, randomSalt } from "@shiguang/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAssetAccess } from "../platform/authorization.js";
import { badRequest, notFound } from "../platform/errors.js";
import {
  buildReleaseBundle,
  injectPublishAccessPolicy,
  injectPublishDownloadActions,
  renderManifestHtml,
} from "../platform/render.js";
import type { AppContext } from "../types.js";

export function registerPublishing(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/assets/:id/publish-references", async (req) => {
    const { id } = req.params as { id: string };
    const asset = await requireAssetAccess(ctx, req.actor, id, "manage");
    const content = await ctx.store.readContent(id);
    const { references } = await collectPublishReferences(
      ctx,
      req.actor.workspaceId,
      content,
      new Set([asset.id]),
      asset.title || asset.id,
      true,
    );
    return {
      references,
      privateReferences: references.filter((ref) => ref.visibility === "private"),
    };
  });

  app.post("/api/v1/publishes", async (req) => {
    const body = z
      .object({
        assetId: z.string(),
        visibility: z.enum(["public", "unlisted", "password"]).default("public"),
        password: z.string().min(4).max(100).optional(),
        expiresAt: z.string().nullish(),
        allowDownload: z.boolean().default(true),
        allowCopy: z.boolean().default(true),
        allowPrivateReferences: z.boolean().default(false),
      })
      .parse(req.body);
    if (body.visibility === "password" && !body.password) {
      throw badRequest("PASSWORD_REQUIRED", "密码可见性需要设置密码");
    }
    const expiresAt = normalizePublishExpiry(body.expiresAt);
    const asset = await requireAssetAccess(ctx, req.actor, body.assetId, "manage");
    if (!["document", "html", "report", "presentation", "file", "dataset"].includes(asset.type)) {
      throw badRequest("NOT_PUBLISHABLE", "该类型资产暂不支持发布");
    }
    const allowPrivate = body.allowPrivateReferences;
    const publish = await ctx.store.createPublish(req.actor, {
      assetId: body.assetId,
      visibility: body.visibility,
      password: body.password ?? null,
      expiresAt,
      allowDownload: body.allowDownload,
      allowCopy: body.allowCopy,
    });
    await buildAndAttachRelease(ctx, req.actor.workspaceId, publish.id, asset.id, allowPrivate);
    const updated = await ctx.store.getPublish(req.actor.workspaceId, publish.id);
    if (!updated) throw notFound("发布");
    const shortUrl = `${ctx.config.publicGatewayBase}/s/${updated.shortSlug}`;
    await ctx.store.setAssetPublishedUrl(req.actor.workspaceId, asset.id, shortUrl);
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "publish.create",
      publish.id,
      "success",
      { assetId: asset.id, visibility: body.visibility },
    );
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "publish.released",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "publish", id: publish.id, version: 1 },
      trace: {},
      data: { publishId: publish.id, slug: publish.slug, releaseId: updated.activeReleaseId ?? "" },
    });
    return {
      ...updated,
      url: `${ctx.config.publicGatewayBase}/p/${updated.slug}`,
      shortUrl,
    };
  });

  app.get("/api/v1/publishes", async (req) => {
    const query = z.object({ assetId: z.string().optional() }).parse(req.query);
    const publishes = (await ctx.store.listPublishes(req.actor.workspaceId)).filter(
      (publish) => !query.assetId || publish.assetId === query.assetId,
    );
    const readable = await Promise.all(
      publishes.map(async (publish) => {
        try {
          await requireAssetAccess(ctx, req.actor, publish.assetId, "read");
          return publish;
        } catch {
          return null;
        }
      }),
    );
    return readable
      .filter((publish): publish is NonNullable<typeof publish> => Boolean(publish))
      .map((p) => ({
        ...p,
        url: `${ctx.config.publicGatewayBase}/p/${p.slug}`,
        shortUrl: `${ctx.config.publicGatewayBase}/s/${p.shortSlug}`,
      }));
  });

  app.get("/api/v1/publishes/stats/summary", async (req) => {
    const query = z.object({ assetType: z.string().optional() }).parse(req.query);
    return await ctx.store.getWorkspacePublishStats(req.actor.workspaceId, query.assetType);
  });

  app.get("/api/v1/publishes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const publish = await ctx.store.getPublish(req.actor.workspaceId, id);
    if (!publish) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    const release = publish.activeReleaseId
      ? await ctx.store.getRelease(publish.activeReleaseId)
      : null;
    const stats = await ctx.store.getPublishStats(id);
    return {
      ...publish,
      release,
      stats,
      url: `${ctx.config.publicGatewayBase}/p/${publish.slug}`,
      shortUrl: `${ctx.config.publicGatewayBase}/s/${publish.shortSlug}`,
    };
  });

  app.patch("/api/v1/publishes/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        visibility: z.enum(["public", "unlisted", "password", "private"]).optional(),
        password: z.string().min(4).max(100).optional(),
        expiresAt: z.string().nullable().optional(),
        allowDownload: z.boolean().optional(),
        allowCopy: z.boolean().optional(),
        allowPrivateReferences: z.boolean().optional(),
      })
      .parse(req.body);
    const publish = await ctx.store.getPublish(req.actor.workspaceId, id);
    if (!publish) throw notFound("发布");
    if (body.visibility === "password" && !body.password && !publish.passwordHash) {
      throw badRequest("PASSWORD_REQUIRED", "密码访问需要设置密码");
    }
    const expiresAt =
      body.expiresAt === undefined ? undefined : normalizePublishExpiry(body.expiresAt);
    let passwordHash: string | null | undefined;
    let passwordSalt: string | null | undefined;
    if (body.password !== undefined) {
      passwordSalt = randomSalt();
      passwordHash = hashPassword(body.password, passwordSalt);
    }
    const updated = await ctx.store.updatePublish(req.actor.workspaceId, id, {
      ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
      ...(passwordHash !== undefined ? { passwordHash, passwordSalt } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(body.allowDownload !== undefined ? { allowDownload: body.allowDownload } : {}),
      ...(body.allowCopy !== undefined ? { allowCopy: body.allowCopy } : {}),
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "publish.update",
      id,
      "success",
      {
        visibility: body.visibility,
      },
    );
    if (updated) {
      await buildAndAttachRelease(
        ctx,
        req.actor.workspaceId,
        id,
        updated.assetId,
        body.allowPrivateReferences ?? false,
      );
    }
    return updated
      ? {
          ...updated,
          url: `${ctx.config.publicGatewayBase}/p/${updated.slug}`,
          shortUrl: `${ctx.config.publicGatewayBase}/s/${updated.shortSlug}`,
        }
      : updated;
  });

  app.post("/api/v1/publishes/:id/revoke", async (req) => {
    const { id } = req.params as { id: string };
    const publish = await ctx.store.getPublish(req.actor.workspaceId, id);
    if (!publish) throw notFound("发布");
    await ctx.store.revokePublish(req.actor.workspaceId, id);
    await ctx.store.setAssetPublishedUrl(
      req.actor.workspaceId,
      publish.assetId,
      null,
      `${ctx.config.publicGatewayBase}/s/${publish.shortSlug}`,
    );
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "publish.revoked",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "publish", id, version: 1 },
      trace: {},
      data: { publishId: id, slug: publish.slug },
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "publish.revoke",
      id,
      "success",
      {},
    );
    return { ok: true };
  });

  app.post("/api/v1/publishes/:id/release", async (req) => {
    const { id } = req.params as { id: string };
    const publish = await ctx.store.getPublish(req.actor.workspaceId, id);
    if (!publish) throw notFound("发布");
    const body = z.object({ allowPrivateReferences: z.boolean().optional() }).parse(req.body ?? {});
    await buildAndAttachRelease(
      ctx,
      req.actor.workspaceId,
      id,
      publish.assetId,
      body.allowPrivateReferences ?? false,
    );
    const updated = await ctx.store.getPublish(req.actor.workspaceId, id);
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "publish.released",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "publish", id, version: 1 },
      trace: {},
      data: { publishId: id, slug: publish.slug, releaseId: updated?.activeReleaseId ?? "" },
    });
    return updated
      ? {
          ...updated,
          url: `${ctx.config.publicGatewayBase}/p/${updated.slug}`,
          shortUrl: `${ctx.config.publicGatewayBase}/s/${updated.shortSlug}`,
        }
      : updated;
  });
}

async function buildAndAttachRelease(
  ctx: AppContext,
  workspaceId: string,
  publishId: string,
  assetId: string,
  allowPrivate = false,
): Promise<void> {
  const publish = await ctx.store.getPublish(workspaceId, publishId);
  if (!publish) throw notFound("发布");
  const asset = await ctx.store.getAsset(workspaceId, assetId);
  if (!asset) throw notFound("资产");
  const content = await ctx.store.readContent(assetId);

  // 内容级 asset: 引用：递归收集 + 私有权校验（快照打包，见 content-reference-implementation.md）
  const { collected: referenced } = await collectPublishReferences(
    ctx,
    workspaceId,
    content,
    new Set([asset.id]),
    asset.title || asset.id,
    allowPrivate,
  );
  const referencePaths = new Map<string, string>();
  for (const [id, ref] of referenced) {
    const path = publishReferencePath(id, ref.asset);
    if (path) referencePaths.set(id, path);
  }
  const resolveAssetLink: AssetLinkResolver = ({ assetId: targetId }) =>
    referencePaths.get(targetId) ?? null;

  let presentation: z.infer<typeof presentationDocumentSchema> | undefined;
  if (asset.type === "presentation" && content?.manifest) {
    presentation = presentationDocumentSchema.parse(content.manifest);
  }
  const binaryFiles: Array<{ path: string; data: Buffer; mediaType: string }> = [];
  let mainDownload: { path: string; name: string; mediaType: string; size: number } | undefined;
  const mainBlob = await ctx.store.getAssetBlob(workspaceId, asset.id);
  if (mainBlob) {
    const data = await ctx.storage.get(mainBlob.objectKey);
    if (data) {
      const name = safeReleaseFileName(asset.title || "download");
      const path = `source/${asset.id}/${name}`;
      binaryFiles.push({ path, data, mediaType: mainBlob.mediaType });
      mainDownload = { path, name, mediaType: mainBlob.mediaType, size: data.byteLength };
    }
  }
  const bundle = buildReleaseBundle({
    assetType: asset.type,
    title: asset.title,
    ...(asset.type === "file" && !content?.text
      ? { markdown: `# ${asset.title}\n\n该文件已发布，可通过下载按钮获取原始文件。` }
      : {}),
    ...(asset.type === "presentation"
      ? { html: content?.text ?? undefined }
      : asset.type === "html" && content?.text
        ? { html: content.text }
        : content?.text
          ? { markdown: content.text }
          : {}),
    presentation,
    resolveAssetLink,
  });
  if (!mainDownload) {
    const generatedDownload = generatedDownloadFor(asset.type, asset.title, bundle.files);
    if (generatedDownload) mainDownload = generatedDownload;
  }

  const attachments: Array<{
    id: string;
    name: string;
    path: string;
    mediaType: string;
    size: number;
  }> = [];
  if (asset.type === "document" || asset.type === "report") {
    const relations = await ctx.store.listRelations(asset.id);
    for (const relation of relations) {
      const attachment = relation.asset;
      if (
        relation.direction !== "out" ||
        relation.relation.relationType !== "references" ||
        !isAttachmentRelation(relation.relation.provenance) ||
        attachment?.type !== "file" ||
        attachment.deletedAt
      ) {
        continue;
      }
      const blob = await ctx.store.getAssetBlob(workspaceId, attachment.id);
      if (!blob) continue;
      const data = await ctx.storage.get(blob.objectKey);
      if (!data) continue;
      const name = safeReleaseFileName(attachment.title || "attachment");
      const path = `attachments/${attachment.id}/${name}`;
      binaryFiles.push({ path, data, mediaType: blob.mediaType });
      attachments.push({
        id: attachment.id,
        name,
        path,
        mediaType: blob.mediaType,
        size: data.byteLength,
      });
    }
  }

  // 渲染被引用文档 + 打包被引用文件（图片/文件 blob），并把快照写入 manifest
  const referenceSnapshot: Array<{
    assetId: string;
    refKey: string;
    versionId: string;
    path: string;
    kind: "link" | "image";
    title: string;
  }> = [];
  const manifestFiles = bundle.manifest.files as Array<Record<string, unknown>>;
  for (const [id, ref] of referenced) {
    const path = referencePaths.get(id);
    if (!path) continue;
    const versionId = ref.asset.currentVersionId ?? "";
    if (ref.asset.type === "document" || ref.asset.type === "report" || ref.asset.type === "html") {
      const nested = buildReleaseBundle({
        assetType: ref.asset.type === "html" ? "html" : "document",
        title: ref.asset.title,
        ...(ref.asset.type === "html"
          ? { html: ref.content?.text ?? "" }
          : { markdown: ref.content?.text ?? "" }),
        resolveAssetLink,
      });
      const nestedIndex = nested.files.find((file) =>
        ref.asset.type === "html" ? file.path === "index.html" : file.path === "index.md",
      );
      if (nestedIndex) {
        const mediaType = nestedIndex.mediaType;
        bundle.files.push({ path, content: nestedIndex.content, mediaType });
        manifestFiles.push({
          path,
          mediaType,
          size: Buffer.byteLength(nestedIndex.content),
        });
        referenceSnapshot.push({
          assetId: id,
          refKey: publishReferenceKey(publish.id, id),
          versionId,
          path,
          kind: "link",
          title: ref.asset.title,
        });
      }
    } else if (ref.asset.type === "presentation") {
      const presentationHtml =
        ref.content?.text ??
        (ref.content?.manifest
          ? renderPresentationHtml(
              ref.content.manifest as unknown as PresentationRenderDocument,
              ref.asset.title,
            )
          : "");
      if (presentationHtml) {
        bundle.files.push({ path, content: presentationHtml, mediaType: "text/html" });
        manifestFiles.push({
          path,
          mediaType: "text/html",
          size: Buffer.byteLength(presentationHtml),
        });
        referenceSnapshot.push({
          assetId: id,
          refKey: publishReferenceKey(publish.id, id),
          versionId,
          path,
          kind: "link",
          title: ref.asset.title,
        });
      }
    } else if (
      ref.asset.type === "dataset" ||
      ref.asset.type === "chart" ||
      ref.asset.type === "source"
    ) {
      const viewer = renderManifestHtml(
        ref.asset.title,
        ref.content?.manifest ?? ref.content?.text ?? null,
      );
      bundle.files.push({ path, content: viewer, mediaType: "text/html" });
      manifestFiles.push({ path, mediaType: "text/html", size: Buffer.byteLength(viewer) });
      referenceSnapshot.push({
        assetId: id,
        refKey: publishReferenceKey(publish.id, id),
        versionId,
        path,
        kind: "link",
        title: ref.asset.title,
      });
    } else if (ref.asset.type === "file") {
      const blob = await ctx.store.getAssetBlob(workspaceId, id);
      if (!blob) continue;
      const data = await ctx.storage.get(blob.objectKey);
      if (!data) continue;
      binaryFiles.push({ path, data, mediaType: blob.mediaType });
      referenceSnapshot.push({
        assetId: id,
        refKey: publishReferenceKey(publish.id, id),
        versionId,
        path,
        kind: ref.kind,
        title: ref.asset.title,
      });
    }
  }
  bundle.manifest.references = referenceSnapshot;

  for (const file of binaryFiles) {
    manifestFiles.push({ path: file.path, mediaType: file.mediaType, size: file.data.byteLength });
  }
  if (mainDownload) {
    bundle.manifest.download = mainDownload;
  }
  bundle.manifest.attachments = attachments;

  const index = bundle.files.find((file) => file.path === "index.html");
  if (publish.allowDownload && index) {
    const actions = [
      ...(mainDownload
        ? [
            {
              label: asset.type === "file" ? "下载文件" : "下载文档",
              href: `/s/${publish.shortSlug}/download`,
            },
          ]
        : []),
      ...attachments.map((attachment) => ({
        label: `下载附件：${attachment.name}`,
        href: `/s/${publish.shortSlug}/attachments/${attachment.id}`,
      })),
    ];
    if (index) index.content = injectPublishDownloadActions(index.content, actions);
  }
  if (index) {
    index.content = injectPublishAccessPolicy(index.content, {
      visibility: publish.visibility,
      allowCopy: publish.allowCopy,
    });
    const manifestIndex = manifestFiles.find((file) => file.path === "index.html");
    if (manifestIndex) manifestIndex.size = Buffer.byteLength(index.content);
  }

  const release = await ctx.store.createRelease(publishId, {
    assetVersionId: asset.currentVersionId ?? "",
    manifest: bundle.manifest,
  });
  const baseKey = `publishes/${publishId}/releases/${release.id}`;
  for (const file of bundle.files) {
    await ctx.storage.put(
      `${baseKey}/${file.path}`,
      Buffer.from(file.content, "utf8"),
      file.mediaType,
    );
  }
  for (const file of binaryFiles) {
    await ctx.storage.put(`${baseKey}/${file.path}`, file.data, file.mediaType);
  }
  await ctx.store.setActiveRelease(workspaceId, publishId, release.id);
}

function normalizePublishExpiry(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw badRequest("INVALID_EXPIRY", "有效期必须晚于当前时间");
  }
  return date.toISOString();
}

interface CollectedReference {
  asset: Asset;
  content: AssetContent | null;
  kind: "link" | "image";
}

function isAttachmentRelation(provenance: Record<string, unknown>): boolean {
  const sources = Array.isArray(provenance.sources)
    ? provenance.sources.filter((source): source is string => typeof source === "string")
    : [];
  // 历史遗留 {} 均来自附件路径
  if (sources.length === 0) return true;
  return sources.includes("attachment");
}

function publishReferencePath(assetId: string, target: Asset): string | null {
  if (target.type === "file") {
    return `refs/${assetId}/${safeReleaseFileName(target.title || "file")}`;
  }
  // document/report are rendered by the SSR reader; other asset types keep
  // their existing HTML/manifest snapshot representation.
  return target.type === "document" || target.type === "report"
    ? `refs/${assetId}/index.md`
    : `refs/${assetId}/index.html`;
}

function publishReferenceKey(publishId: string, assetId: string): string {
  return createHash("sha256").update(`${publishId}:${assetId}`).digest("base64url").slice(0, 12);
}

interface PublishReference {
  id: string;
  title: string;
  type: string;
  visibility: Asset["visibility"];
}

interface CollectedReferences {
  collected: Map<string, CollectedReference>;
  references: PublishReference[];
}

async function collectPublishReferences(
  ctx: AppContext,
  workspaceId: string,
  content: AssetContent | null,
  visited: Set<string>,
  parentPath: string,
  allowPrivate: boolean,
): Promise<CollectedReferences> {
  const collected = new Map<string, CollectedReference>();
  const references: PublishReference[] = [];
  const text = content?.text ?? "";
  const refs = [...parseAssetReferences(text), ...parseHtmlAssetReferences(text)];
  for (const ref of refs) {
    if (visited.has(ref.assetId)) continue;
    visited.add(ref.assetId);
    const target = await ctx.store.getAsset(workspaceId, ref.assetId);
    if (!target) continue;
    if (target.deletedAt) {
      throw badRequest(
        "REFERENCE_DELETED",
        `发布「${parentPath}」失败：引用了已删除的资产「${target.title || ref.assetId}」(id=${ref.assetId})`,
      );
    }
    const isPrivate = target.visibility === "private";
    references.push({
      id: target.id,
      title: target.title || ref.assetId,
      type: target.type,
      visibility: target.visibility,
    });
    // A private reference can remain in the source document while being
    // intentionally excluded from this public release snapshot.
    if (isPrivate && !allowPrivate) continue;
    const targetContent = await ctx.store.readContent(ref.assetId);
    collected.set(ref.assetId, { asset: target, content: targetContent, kind: ref.kind });
    if (target.type === "document" || target.type === "report" || target.type === "html") {
      const childPath = `${parentPath} → ${target.title || ref.assetId}`;
      const nested = await collectPublishReferences(
        ctx,
        workspaceId,
        targetContent,
        visited,
        childPath,
        allowPrivate,
      );
      for (const [nestedId, value] of nested.collected) collected.set(nestedId, value);
      references.push(...nested.references);
    }
  }
  return { collected, references };
}

function generatedDownloadFor(
  assetType: string,
  title: string,
  files: Array<{ path: string; content: string; mediaType: string }>,
): { path: string; name: string; mediaType: string; size: number } | undefined {
  const targetPath =
    assetType === "presentation"
      ? "slides.json"
      : assetType === "html"
        ? "index.html"
        : assetType === "document" || assetType === "report"
          ? "index.md"
          : undefined;
  if (!targetPath) return undefined;
  const file = files.find((candidate) => candidate.path === targetPath);
  if (!file) return undefined;
  const extension = targetPath.slice(targetPath.lastIndexOf("."));
  return {
    path: targetPath,
    name: `${safeReleaseFileName(title || "download")}${extension}`,
    mediaType: file.mediaType,
    size: Buffer.byteLength(file.content),
  };
}

function safeReleaseFileName(name: string): string {
  return (
    name
      .replace(/[\\/\0]/g, "-")
      .trim()
      .slice(0, 180) || "download"
  );
}
