import { nextId, nowIso, presentationDocumentSchema } from "@shiguang/contracts";
import { hashPassword, randomSalt } from "@shiguang/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, notFound } from "../platform/errors.js";
import { requireAssetAccess } from "../platform/authorization.js";
import { buildReleaseBundle } from "../platform/render.js";
import type { AppContext } from "../types.js";

export function registerPublishing(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.post("/api/v1/publishes", async (req) => {
    const body = z
      .object({
        assetId: z.string(),
        visibility: z.enum(["public", "unlisted", "password"]).default("public"),
        password: z.string().min(4).max(100).optional(),
        expiresAt: z.string().optional(),
        allowDownload: z.boolean().default(true),
        allowCopy: z.boolean().default(true),
      })
      .parse(req.body);
    if (body.visibility === "password" && !body.password) {
      throw badRequest("PASSWORD_REQUIRED", "密码可见性需要设置密码");
    }
    const asset = await requireAssetAccess(ctx, req.actor, body.assetId, "manage");
    if (!["document", "html", "report", "presentation", "file", "dataset"].includes(asset.type)) {
      throw badRequest("NOT_PUBLISHABLE", "该类型资产暂不支持发布");
    }
    const publish = await ctx.store.createPublish(req.actor, {
      assetId: body.assetId,
      visibility: body.visibility,
      password: body.password ?? null,
      expiresAt: body.expiresAt ?? null,
      allowDownload: body.allowDownload,
      allowCopy: body.allowCopy,
    });
    await buildAndAttachRelease(ctx, req.actor.workspaceId, publish.id, asset.id);
    const updated = (await ctx.store.getPublish(req.actor.workspaceId, publish.id))!;
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
      shortUrl: `${ctx.config.publicGatewayBase}/s/${updated.shortSlug}`,
    };
  });

  app.get("/api/v1/publishes", async (req) => {
    const publishes = await ctx.store.listPublishes(req.actor.workspaceId);
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
        password: z.string().optional(),
        expiresAt: z.string().nullable().optional(),
        allowDownload: z.boolean().optional(),
        allowCopy: z.boolean().optional(),
      })
      .parse(req.body);
    const publish = await ctx.store.getPublish(req.actor.workspaceId, id);
    if (!publish) throw notFound("发布");
    let passwordHash: string | null | undefined;
    let passwordSalt: string | null | undefined;
    if (body.password !== undefined) {
      passwordSalt = randomSalt();
      passwordHash = hashPassword(body.password, passwordSalt);
    }
    const updated = await ctx.store.updatePublish(req.actor.workspaceId, id, {
      ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
      ...(passwordHash !== undefined ? { passwordHash, passwordSalt } : {}),
      ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
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
    return updated;
  });

  app.post("/api/v1/publishes/:id/revoke", async (req) => {
    const { id } = req.params as { id: string };
    const publish = await ctx.store.getPublish(req.actor.workspaceId, id);
    if (!publish) throw notFound("发布");
    await ctx.store.revokePublish(req.actor.workspaceId, id);
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
    await buildAndAttachRelease(ctx, req.actor.workspaceId, id, publish.assetId);
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
    return updated;
  });
}

async function buildAndAttachRelease(
  ctx: AppContext,
  workspaceId: string,
  publishId: string,
  assetId: string,
): Promise<void> {
  const publish = await ctx.store.getPublish(workspaceId, publishId);
  if (!publish) throw notFound("发布");
  const asset = await ctx.store.getAsset(workspaceId, assetId);
  if (!asset) throw notFound("资产");
  const content = await ctx.store.readContent(assetId);
  let presentation: z.infer<typeof presentationDocumentSchema> | undefined;
  if (asset.type === "presentation" && content?.manifest) {
    presentation = presentationDocumentSchema.parse(content.manifest);
  }
  const bundle = buildReleaseBundle({
    assetType: asset.type,
    title: asset.title,
    ...(asset.type === "html" && content?.text
      ? { html: content.text }
      : content?.text
        ? { markdown: content.text }
        : {}),
    presentation,
  });
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
  await ctx.store.setActiveRelease(workspaceId, publishId, release.id);
}
