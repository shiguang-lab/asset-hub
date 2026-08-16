import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../types.js";

export function registerNotifications(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/notifications", async (req) => {
    const query = z
      .object({ limit: z.coerce.number().min(1).max(100).default(50) })
      .parse(req.query);
    return await ctx.store.listNotifications(req.actor.workspaceId, req.actor.subject, query.limit);
  });

  app.get("/api/v1/notifications/unread-count", async (req) => ({
    count: await ctx.store.unreadNotificationCount(req.actor.workspaceId, req.actor.subject),
  }));

  app.post("/api/v1/notifications/:id/read", async (req, reply) => {
    const { id } = req.params as { id: string };
    await ctx.store.markNotificationRead(req.actor.workspaceId, req.actor.subject, id);
    return reply.code(204).send();
  });

  app.post("/api/v1/notifications/read-all", async (req) => {
    await ctx.store.markAllNotificationsRead(req.actor.workspaceId, req.actor.subject);
    return { ok: true };
  });
}
