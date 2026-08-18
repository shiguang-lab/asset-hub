import { nextId, nowIso, researchCreateSchema, taskTypeSchema } from "@shiguang/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAssetAccess } from "../platform/authorization.js";
import { badRequest, notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";

export function estimateCredits(spec: {
  depth?: "quick" | "standard" | "deep" | undefined;
  quality?: "economy" | "balanced" | "best" | undefined;
  outputs?: string[] | undefined;
}): { min: number; max: number } {
  const base = spec.depth === "quick" ? 150 : spec.depth === "deep" ? 1200 : 400;
  const qualityMultiplier = spec.quality === "economy" ? 0.7 : spec.quality === "best" ? 1.8 : 1;
  const extra = (spec.outputs ?? []).reduce((acc, o) => {
    if (o === "dataset") return acc + 200;
    if (o === "presentation") return acc + 300;
    return acc;
  }, 0);
  const min = Math.round(base * qualityMultiplier);
  const max = Math.round((base + extra) * qualityMultiplier);
  return { min, max };
}

export function registerTasks(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  /* ---------------- research spec preview ---------------- */

  app.post("/api/v1/research/specs:preview", async (req) => {
    const body = z
      .object({ goal: z.string().min(1).max(500), region: z.string().optional() })
      .parse(req.body);
    const res = await ctx.ai.completeJson<{
      items: Array<{ id: string; label: string; enabled: boolean }>;
    }>(
      {
        messages: [
          {
            role: "system",
            content: "你是研究规划助手。将用户研究目标拆解为可执行的研究范围项，输出 JSON。",
          },
          {
            role: "user",
            content: `research-scope\ngoal: ${body.goal}\nregion: ${body.region ?? "全球"}\n输出 {items:[{id,label,enabled}]}`,
          },
        ],
        quality: "economy",
      },
      z.object({
        items: z.array(z.object({ id: z.string(), label: z.string(), enabled: z.boolean() })),
      }),
    );
    return {
      goal: body.goal,
      region: body.region ?? "全球",
      timeRange: "最近 12 个月",
      scope: res.data.items,
      provider: res.provider,
    };
  });

  /* ---------------- create research task ---------------- */

  app.post("/api/v1/research/tasks", async (req) => {
    const input = researchCreateSchema.parse(req.body);
    const estimate = estimateCredits(input);
    const account = await ctx.store.getCreditAccount(req.actor.workspaceId);
    if (!account || account.balance < estimate.min) {
      throw badRequest(
        "CREDIT_INSUFFICIENT",
        `Credits 不足：本任务预估需要 ${estimate.min}–${estimate.max} Credits，当前余额 ${account?.balance ?? 0}。可降低质量模式或购买 Credits。`,
        {},
      );
    }
    const spec = {
      goal: input.goal,
      region: input.region ?? "全球",
      timeRange: input.timeRange ?? "最近 12 个月",
      depth: input.depth ?? "standard",
      quality: input.quality ?? "balanced",
      outputs: input.outputs ?? ["report", "sources"],
      scope: input.scope ?? [],
    };
    await Promise.all(
      (input.inputAssetIds ?? []).map((assetId) =>
        requireAssetAccess(ctx, req.actor, assetId, "read"),
      ),
    );
    const task = await ctx.store.createTask(req.actor, {
      type: "research",
      goal: input.goal,
      spec: spec as unknown as Record<string, unknown>,
      ...(input.inputAssetIds !== undefined ? { inputAssetIds: input.inputAssetIds } : {}),
    });
    const operationId = `op_reserve_${task.id}`;
    const reserved = await ctx.store.reserveCredits(
      req.actor.workspaceId,
      task.id,
      estimate.max,
      operationId,
    );
    if (!reserved.ok) {
      throw badRequest(
        "CREDIT_INSUFFICIENT",
        `Credits 不足：需要 ${estimate.max}，当前余额 ${reserved.balance}`,
        {},
      );
    }
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "credit.reserved",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "task", id: task.id, version: 1 },
      trace: {},
      data: { taskId: task.id, amount: estimate.max },
    });
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "task.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "task", id: task.id, version: 1 },
      trace: {},
      data: { taskId: task.id, taskType: task.type, spec },
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "task.create",
      task.id,
      "success",
      {
        type: task.type,
        estimate,
      },
    );
    return { task, estimate, reserved: estimate.max };
  });

  app.post("/api/v1/tasks", async (req) => {
    const body = z
      .object({
        type: taskTypeSchema,
        goal: z.string().min(1).max(500),
        spec: z.record(z.string(), z.unknown()).optional(),
        inputAssetIds: z.array(z.string()).optional(),
        requireCredits: z.boolean().default(true),
      })
      .parse(req.body);
    await Promise.all(
      (body.inputAssetIds ?? []).map((assetId) =>
        requireAssetAccess(ctx, req.actor, assetId, "read"),
      ),
    );
    const estimate =
      body.type === "research" ? estimateCredits(body.spec as never) : { min: 100, max: 200 };
    const account = await ctx.store.getCreditAccount(req.actor.workspaceId);
    if (body.requireCredits && (!account || account.balance < estimate.min)) {
      throw badRequest("CREDIT_INSUFFICIENT", `Credits 不足：需要至少 ${estimate.min}`, {});
    }
    const task = await ctx.store.createTask(req.actor, {
      type: body.type,
      goal: body.goal,
      spec: body.spec ?? {},
      ...(body.inputAssetIds !== undefined ? { inputAssetIds: body.inputAssetIds } : {}),
    });
    const operationId = `op_reserve_${task.id}`;
    const reserved = await ctx.store.reserveCredits(
      req.actor.workspaceId,
      task.id,
      estimate.max,
      operationId,
    );
    if (!reserved.ok) {
      throw badRequest("CREDIT_INSUFFICIENT", `Credits 不足：需要 ${estimate.max}`, {});
    }
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "task.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "task", id: task.id, version: 1 },
      trace: {},
      data: { taskId: task.id, taskType: task.type, spec: body.spec ?? {} },
    });
    return { task, estimate, reserved: estimate.max };
  });

  /* ---------------- task read model ---------------- */

  app.get("/api/v1/tasks", async (req) => {
    const query = z
      .object({
        status: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
      })
      .parse(req.query);
    return await ctx.store.listTasks(req.actor.workspaceId, {
      status: query.status,
      limit: query.limit,
      after: query.cursor,
    });
  });

  app.get("/api/v1/tasks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await ctx.store.getTask(req.actor.workspaceId, id);
    if (!task) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    const steps = await ctx.store.listSteps(id);
    const evidence = await ctx.store.listEvidence(id);
    const outputs = (
      await Promise.all(
        task.outputAssetIds.map(async (assetId) => {
          try {
            return await requireAssetAccess(ctx, req.actor, assetId, "read");
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);
    return { ...task, steps, evidence, outputs };
  });

  app.post("/api/v1/tasks/:id/cancel", async (req) => {
    const { id } = req.params as { id: string };
    const task = await ctx.store.getTask(req.actor.workspaceId, id);
    if (!task) throw notFound("任务");
    if (["completed", "failed", "cancelled"].includes(task.status)) {
      throw badRequest("TASK_NOT_CANCELLABLE", "任务已结束，无法取消");
    }
    const updated = await ctx.store.requestCancel(req.actor.workspaceId, id);
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "task.cancel",
      id,
      "success",
      {},
    );
    return updated;
  });

  app.post("/api/v1/tasks/:id/retry", async (req) => {
    const { id } = req.params as { id: string };
    const task = await ctx.store.getTask(req.actor.workspaceId, id);
    if (!task) throw notFound("任务");
    if (!["failed", "partial_completed", "cancelled"].includes(task.status)) {
      throw badRequest("TASK_NOT_RETRYABLE", "只有失败、部分完成或已取消的任务可以重试");
    }
    await ctx.store.updateTask(req.actor.workspaceId, id, {
      status: "queued",
      progress: 0,
      error: null,
      cancelRequested: false,
    });
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "task.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "task", id, version: 1 },
      trace: {},
      data: { taskId: id, taskType: task.type, retry: true, spec: task.spec },
    });
    return { ok: true };
  });

  app.post("/api/v1/tasks/:id/pause", async (req) => {
    const { id } = req.params as { id: string };
    const task = await ctx.store.getTask(req.actor.workspaceId, id);
    if (!task) throw notFound("任务");
    const updated = await ctx.store.updateTask(req.actor.workspaceId, id, { status: "paused" });
    return updated;
  });

  app.post("/api/v1/tasks/:id/resume", async (req) => {
    const { id } = req.params as { id: string };
    const task = await ctx.store.getTask(req.actor.workspaceId, id);
    if (!task) throw notFound("任务");
    const updated = await ctx.store.updateTask(req.actor.workspaceId, id, {
      status: "queued",
      cancelRequested: false,
    });
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "task.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "task", id, version: 1 },
      trace: {},
      data: { taskId: id, taskType: task.type, resume: true, spec: task.spec },
    });
    return updated;
  });

  app.get("/api/v1/research/estimate", async (req) => {
    const query = z
      .object({
        depth: z.enum(["quick", "standard", "deep"]).optional(),
        quality: z.enum(["economy", "balanced", "best"]).optional(),
        outputs: z.array(z.string()).optional(),
      })
      .parse(req.query);
    return estimateCredits(query as never);
  });

  /* ---------------- 定时任务 ---------------- */

  app.get(
    "/api/v1/task-schedules",
    async (req) => await ctx.store.listSchedules(req.actor.workspaceId),
  );

  app.post("/api/v1/task-schedules", async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        taskType: taskTypeSchema.default("research"),
        goal: z.string().min(1),
        spec: z.record(z.string(), z.unknown()).optional(),
        cron: z.string().min(1),
      })
      .parse(req.body);
    const schedule = await ctx.store.createSchedule(req.actor.workspaceId, {
      name: body.name,
      taskType: body.taskType,
      goal: body.goal,
      spec: body.spec ?? {},
      cron: body.cron,
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "schedule.create",
      String(schedule.id),
      "success",
      {},
    );
    return schedule;
  });

  app.patch("/api/v1/task-schedules/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        enabled: z.boolean().optional(),
        name: z.string().optional(),
        goal: z.string().optional(),
        cron: z.string().optional(),
      })
      .parse(req.body);
    const schedule = await ctx.store.updateSchedule(req.actor.workspaceId, id, body);
    if (!schedule) throw notFound("定时任务");
    return schedule;
  });

  app.delete("/api/v1/task-schedules/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const schedule = await ctx.store.getSchedule(req.actor.workspaceId, id);
    if (!schedule) throw notFound("定时任务");
    await ctx.store.deleteSchedule(req.actor.workspaceId, id);
    return reply.code(204).send();
  });
}
