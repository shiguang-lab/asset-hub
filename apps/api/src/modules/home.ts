import type { FastifyInstance } from "fastify";
import type { AppContext } from "../types.js";

export function registerHome(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/home", async (req) => {
    const recentAssets = ctx.store.listAssets(req.actor.workspaceId, { limit: 6 }).items;
    const runningTasks = ctx.store
      .listTasks(req.actor.workspaceId, { limit: 10 })
      .items.filter((t) =>
        ["created", "planning", "queued", "running", "waiting_user"].includes(t.status),
      )
      .slice(0, 5);
    const unreadNotifications = ctx.store.unreadNotificationCount(
      req.actor.workspaceId,
      req.actor.subject,
    );
    const creditAccount = ctx.store.getCreditAccount(req.actor.workspaceId);
    const templates = ctx.store.listTemplates(req.actor.workspaceId).slice(0, 2);
    return {
      recentAssets,
      runningTasks,
      unreadNotifications,
      credits: creditAccount?.balance ?? 0,
      templates,
    };
  });

  app.get("/api/v1/me", async (req) => {
    const profile = ctx.store.ensureUser({
      subject: req.actor.subject,
      workspaceId: req.actor.workspaceId,
    });
    const creditAccount = ctx.store.getCreditAccount(req.actor.workspaceId);
    return { profile, workspaceId: req.actor.workspaceId, credits: creditAccount?.balance ?? 0 };
  });

  app.patch("/api/v1/me", async (req) => {
    const body = (req.body ?? {}) as {
      name?: string;
      defaultQuality?: "economy" | "balanced" | "best";
      defaultLanguage?: string;
      notifyEmail?: boolean;
    };
    const profile = ctx.store.updateUserProfile(req.actor.subject, body);
    return profile;
  });

  app.get("/api/v1/audit", async (req) => {
    return ctx.store.listAudit(req.actor.workspaceId, 100);
  });
}
