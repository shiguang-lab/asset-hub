import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";

export function registerTemplates(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/templates", async (req) => {
    const query = z
      .object({ type: z.enum(["research", "presentation"]).optional() })
      .parse(req.query);
    return await ctx.store.listTemplates(req.actor.workspaceId, query.type);
  });

  app.get("/api/v1/templates/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const template = await ctx.store.getTemplate(req.actor.workspaceId, id);
    if (!template) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    return template;
  });

  app.post("/api/v1/templates", async (req) => {
    const body = z
      .object({
        type: z.enum(["research", "presentation"]),
        name: z.string().min(1),
        description: z.string().optional(),
        content: z.record(z.string(), z.unknown()),
      })
      .parse(req.body);
    return await ctx.store.createTemplate(req.actor, body);
  });

  app.post("/api/v1/templates/:id/use", async (req) => {
    const { id } = req.params as { id: string };
    const template = await ctx.store.getTemplate(req.actor.workspaceId, id);
    if (!template) throw notFound("模板");
    await ctx.store.bumpTemplateUsage(req.actor.workspaceId, id);
    return { ...template, content: template.content };
  });
}
