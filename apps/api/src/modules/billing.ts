import type { FastifyInstance } from "fastify";
import type { AppContext } from "../types.js";

export function registerBilling(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/credits", async (req) => {
    const balance = await ctx.store.getCreditBalance(req.actor.workspaceId);
    // Credits are owned by the external points service. This endpoint is a
    // read-only compatibility boundary and intentionally exposes only balance.
    return { balance: balance?.balance ?? 0 };
  });
}
