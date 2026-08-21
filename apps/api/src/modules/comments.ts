import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";

/**
 * Published-page comments, anchored to a publish release (version).
 *
 * Identity is resolved server-side: the edge's forward-auth converts the
 * session cookie into `X-SG-Identity`, which `identity.resolve` turns into
 * `req.actor`. The client never supplies `userId`/`displayName`, so anonymous
 * callers are rejected by forward-auth before they ever reach this route.
 */
export function registerComments(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.post("/api/v1/comments", async (req) => {
    const body = z
      .object({
        publishId: z.string().min(1).max(100),
        releaseId: z.string().min(1).max(100),
        content: z.string().trim().min(1).max(2_000),
      })
      .parse(req.body);

    const publish = await ctx.store.getPublishById(body.publishId);
    if (!publish || publish.status !== "active") throw notFound("发布");

    const comment = await ctx.store.createComment({
      publishId: publish.id,
      releaseId: body.releaseId,
      authorSubject: req.actor.subject,
      authorName: (req.actor.displayName?.trim() || req.actor.subject).slice(0, 120),
      content: body.content,
    });
    return { comment };
  });
}
