import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { forbidden, notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";

export function registerWorkspace(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  /* ---------------- 成员 ---------------- */

  app.get("/api/v1/workspace", async (req) => {
    const owner = await ctx.store.getWorkspaceOwnerSubject(req.actor.workspaceId);
    return {
      workspaceId: req.actor.workspaceId,
      workspaceType: req.actor.workspaceType,
      workspaceRole: req.actor.workspaceRole,
      ownerSubject: owner,
      membershipAuthority: "auth-service",
    };
  });

  app.post("/api/v1/workspace/members", async () => {
    throw forbidden("Group 成员由统一账号服务管理，请使用 /api/account/orgs/:id/members");
  });

  app.patch("/api/v1/workspace/members/:subject", async () => {
    throw forbidden("Group 成员由统一账号服务管理，请使用 /api/account/orgs/:id/members");
  });

  app.delete("/api/v1/workspace/members/:subject", async () => {
    throw forbidden("Group 成员由统一账号服务管理，请使用 /api/account/orgs/:id/members");
  });

  /* ---------------- 资产 ACL 与分享 ---------------- */

  app.get("/api/v1/assets/:id/acl", async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    return { assetId: id, acl: await ctx.store.listAcl(id) };
  });

  app.post("/api/v1/assets/:id/acl", async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ subject: z.string().min(1), role: z.enum(["editor", "viewer"]).default("viewer") })
      .parse(req.body);
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    if (
      asset.ownerSubject !== req.actor.subject &&
      !["owner", "admin"].includes(req.actor.workspaceRole)
    ) {
      throw forbidden("只有资产所有者或空间管理员可以管理共享权限");
    }
    await ctx.store.grantAcl(id, "user", body.subject, body.role);
    await ctx.store.createNotification({
      workspaceId: req.actor.workspaceId,
      subject: body.subject,
      type: "share",
      title: `你获得了「${asset.title}」的${body.role === "editor" ? "编辑" : "查看"}权限`,
      link: `/assets/${id}`,
    });
    await ctx.store.audit(req.actor.workspaceId, req.actor.subject, "asset.share", id, "success", {
      subject: body.subject,
      role: body.role,
    });
    return { ok: true };
  });

  app.delete("/api/v1/assets/:id/acl/:subject", async (req, reply) => {
    const { id, subject } = req.params as { id: string; subject: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    if (
      asset.ownerSubject !== req.actor.subject &&
      !["owner", "admin"].includes(req.actor.workspaceRole)
    ) {
      throw forbidden("只有资产所有者或空间管理员可以管理共享权限");
    }
    await ctx.store.revokeAcl(id, "user", subject);
    return reply.code(204).send();
  });

  app.post("/api/v1/assets/:id/share", async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ subject: z.string().min(1), role: z.enum(["editor", "viewer"]).default("viewer") })
      .parse(req.body);
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (!asset) throw notFound("资产");
    if (
      asset.ownerSubject !== req.actor.subject &&
      !["owner", "admin"].includes(req.actor.workspaceRole)
    ) {
      throw forbidden("只有资产所有者或空间管理员可以管理共享权限");
    }
    if (!["link", "public", "unlisted"].includes(asset.visibility)) {
      await ctx.store.updateAssetMeta(req.actor, id, { visibility: "link" });
    }
    await ctx.store.grantAcl(id, "user", body.subject, body.role);
    await ctx.store.createNotification({
      workspaceId: req.actor.workspaceId,
      subject: body.subject,
      type: "share",
      title: `有人与你分享了「${asset.title}」`,
      body: `角色：${body.role}`,
      link: `/assets/${id}`,
    });
    await ctx.store.audit(req.actor.workspaceId, req.actor.subject, "asset.share", id, "success", {
      subject: body.subject,
    });
    return { ok: true, sharedWith: body.subject, visibility: "link" };
  });
}
