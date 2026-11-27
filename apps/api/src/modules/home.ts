import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../platform/authorization.js";
import type { AppContext } from "../types.js";

export function registerHome(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/home", async (req) => {
    const recentAssets = (
      await ctx.store.listAssets(req.actor.workspaceId, {
        limit: 6,
        subject: req.actor.subject,
        workspaceRole: req.actor.workspaceRole,
      })
    ).items;
    const runningTasks = (await ctx.store.listTasks(req.actor.workspaceId, { limit: 10 })).items
      .filter((t) =>
        ["created", "planning", "queued", "running", "waiting_user"].includes(t.status),
      )
      .slice(0, 5);
    const unreadNotifications = await ctx.store.unreadNotificationCount(
      req.actor.workspaceId,
      req.actor.subject,
    );
    const templates = (await ctx.store.listTemplates(req.actor.workspaceId)).slice(0, 2);
    return {
      recentAssets,
      runningTasks,
      unreadNotifications,
      templates,
    };
  });

  app.get("/api/v1/me", async (req) => {
    const profile = await ctx.store.ensureUser({
      subject: req.actor.subject,
      workspaceId: req.actor.workspaceId,
    });
    return { profile, workspaceId: req.actor.workspaceId };
  });

  app.patch("/api/v1/me", async (req) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        avatarUrl: z.string().url().max(2000).nullable().optional(),
        defaultQuality: z.enum(["economy", "balanced", "best"]).optional(),
        defaultLanguage: z.string().min(2).max(20).optional(),
        notifyEmail: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const profile = await ctx.store.updateUserProfile(req.actor.subject, body);
    return profile;
  });

  app.get("/api/v1/audit", async (req) => {
    requireAdmin(req.actor);
    return await ctx.store.listAudit(req.actor.workspaceId, 100);
  });
}
