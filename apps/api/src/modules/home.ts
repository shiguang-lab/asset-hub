import type { FastifyInstance } from "fastify";
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
    const creditAccount = await ctx.store.getCreditAccount(req.actor.workspaceId);
    const templates = (await ctx.store.listTemplates(req.actor.workspaceId)).slice(0, 2);
    return {
      recentAssets,
      runningTasks,
      unreadNotifications,
      credits: creditAccount?.balance ?? 0,
      templates,
    };
  });

  app.get("/api/v1/me", async (req) => {
    const profile = await ctx.store.ensureUser({
      subject: req.actor.subject,
      workspaceId: req.actor.workspaceId,
    });
    const creditAccount = await ctx.store.getCreditAccount(req.actor.workspaceId);
    return { profile, workspaceId: req.actor.workspaceId, credits: creditAccount?.balance ?? 0 };
  });

  app.patch("/api/v1/me", async (req) => {
    const body = (req.body ?? {}) as {
      name?: string;
      defaultQuality?: "economy" | "balanced" | "best";
      defaultLanguage?: string;
      notifyEmail?: boolean;
    };
    const profile = await ctx.store.updateUserProfile(req.actor.subject, body);
    return profile;
  });

  app.get("/api/v1/audit", async (req) => {
    requireAdmin(req.actor);
    return await ctx.store.listAudit(req.actor.workspaceId, 100);
  });
}
