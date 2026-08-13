import type { FastifyInstance } from "fastify";
import type { AppContext } from "../types.js";
import { estimateCredits } from "./tasks.js";

export function registerBilling(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/credits", async (req) => {
    const account = ctx.store.getCreditAccount(req.actor.workspaceId);
    return {
      account,
      ledger: ctx.store.ledger(req.actor.workspaceId),
      usage: ctx.store.usageRecords(req.actor.workspaceId),
    };
  });

  app.post("/api/v1/credits/estimate", async (req) => {
    const body = (req.body ?? {}) as {
      depth?: "quick" | "standard" | "deep";
      quality?: "economy" | "balanced" | "best";
      outputs?: string[];
    };
    return estimateCredits(body);
  });

  app.get("/api/v1/credits/plan", async () => ({
    plans: [
      {
        id: "free",
        name: "免费版",
        credits: 10_000,
        price: 0,
        features: ["文档与知识库", "基础 Research", "公开发布"],
      },
      {
        id: "pro",
        name: "专业版",
        credits: 100_000,
        price: 29,
        features: ["深度 Research", "Dataset 分析", "在线演示", "MCP 接入"],
      },
      {
        id: "team",
        name: "团队版",
        credits: 500_000,
        price: 99,
        features: ["团队协作 P1", "自定义域名 P1", "优先队列"],
      },
    ],
  }));
}
