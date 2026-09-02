import {
  nextId,
  nowIso,
  researchCreateSchema,
  type Task,
  taskTypeSchema,
} from "@shiguang/contracts";
import type { ObjectStore } from "@shiguang/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAssetAccess } from "../platform/authorization.js";
import { badRequest, notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";

interface PresentationSnapshot {
  schema: string;
  html: string;
  updatedAt: string;
  review?: unknown;
  renderAudit?: unknown;
  repairPass?: number;
  repairFailedPages?: number[];
  previousRepairFailures?: string[];
}

/**
 * Load the presentation deck snapshot that visual review flagged, from the
 * durable review-resume blob. The review-resume is written before repair
 * starts, so its html is the exact version the review rejected — the version a
 * user should inspect to judge whether the failure is a real defect or a false
 * positive. Falls back to the repair-resume (the last post-repair state) when
 * no review snapshot exists. Returns null when neither is available.
 */
export async function buildPresentationSnapshotPayload(
  task: Pick<Task, "type" | "checkpoint">,
  storage: Pick<ObjectStore, "get">,
): Promise<PresentationSnapshot | null> {
  const checkpoint = task.checkpoint ?? {};
  const readResume = async (ref: unknown): Promise<PresentationSnapshot | null> => {
    if (!ref || typeof ref !== "object") return null;
    const objectKey = (ref as { objectKey?: unknown }).objectKey;
    if (typeof objectKey !== "string" || !objectKey) return null;
    const buffer = await storage.get(objectKey);
    if (!buffer) return null;
    try {
      const parsed = JSON.parse(buffer.toString("utf8")) as Record<string, unknown>;
      const html = parsed.html;
      if (typeof html !== "string" || !html) return null;
      return {
        schema: typeof parsed.schema === "string" ? parsed.schema : "",
        html,
        updatedAt:
          typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
        ...(parsed.review !== undefined ? { review: parsed.review } : {}),
        ...(parsed.renderAudit !== undefined ? { renderAudit: parsed.renderAudit } : {}),
        ...(typeof parsed.repairPass === "number" ? { repairPass: parsed.repairPass } : {}),
        ...(Array.isArray(parsed.previousRepairFailures)
          ? { previousRepairFailures: parsed.previousRepairFailures }
          : {}),
      };
    } catch {
      return null;
    }
  };
  const reviewSnapshot = await readResume(checkpoint.reviewResume);
  if (reviewSnapshot) return reviewSnapshot;
  const repairSnapshot = await readResume(checkpoint.repairResume);
  if (repairSnapshot) {
    return {
      ...repairSnapshot,
      repairPass:
        typeof checkpoint.repairResume === "object" &&
        checkpoint.repairResume !== null &&
        typeof (checkpoint.repairResume as { repairPass?: unknown }).repairPass === "number"
          ? (checkpoint.repairResume as { repairPass: number }).repairPass
          : repairSnapshot.repairPass,
    };
  }
  return null;
}

export function buildTaskRetryState(
  task: Pick<Task, "type" | "checkpoint">,
  updatedAt = nowIso(),
): {
  progress: number;
  currentStep: string;
  checkpoint: Record<string, unknown> | null;
} {
  const failedCheckpoint = task.checkpoint ?? {};
  const resume =
    typeof failedCheckpoint.renderingResume === "object" &&
    failedCheckpoint.renderingResume !== null
      ? (failedCheckpoint.renderingResume as Record<string, unknown>)
      : null;
  const completedPages = Number(failedCheckpoint.completedPages ?? 0);
  const estimatedPages = Number(failedCheckpoint.estimatedPages ?? 0);
  const pageTitles = Array.isArray(failedCheckpoint.pageTitles) ? failedCheckpoint.pageTitles : [];
  const hasPresentationResume =
    task.type === "presentation_generate" &&
    resume?.schema === "presentation-rendering-resume-ref/v2" &&
    typeof resume.objectKey === "string" &&
    Number.isInteger(resume.completedPages) &&
    resume.completedPages === completedPages &&
    completedPages >= 0 &&
    estimatedPages > 0 &&
    completedPages <= estimatedPages &&
    pageTitles.length === completedPages;
  if (!hasPresentationResume) {
    return { progress: 0, currentStep: "等待重试", checkpoint: null };
  }
  const checkpoint = Object.fromEntries(
    Object.entries({
      ...failedCheckpoint,
      phase: "rendering",
      phaseLabel: "等待从页面断点继续",
      activity: "waiting",
      updatedAt,
    }).filter(
      ([key]) =>
        !["stoppedAtPhase", "failureStage", "failureDetails", "errorCode", "errorMessage"].includes(
          key,
        ),
    ),
  ) as Record<string, unknown>;
  const failedPhase =
    typeof failedCheckpoint.stoppedAtPhase === "string"
      ? failedCheckpoint.stoppedAtPhase
      : typeof failedCheckpoint.failureStage === "string"
        ? failedCheckpoint.failureStage.split(".")[0]
        : "rendering";
  const retryingReview = failedPhase === "reviewing";
  const retryingRepair = failedPhase === "repairing";
  const retryingCompiling = failedPhase === "compiling";
  checkpoint.retryFromPhase = failedPhase;
  if (retryingReview) {
    checkpoint.phase = "reviewing";
    checkpoint.phaseLabel = "等待重新进行视觉审查";
    checkpoint.progress = 81;
    checkpoint.activity = "waiting";
  } else if (retryingRepair) {
    checkpoint.phase = "repairing";
    checkpoint.phaseLabel = "等待从失败页面继续定向修复";
    checkpoint.progress = 88;
    checkpoint.activity = "waiting";
  } else if (retryingCompiling) {
    checkpoint.phase = "compiling";
    checkpoint.phaseLabel = "等待重新编译编辑能力";
    checkpoint.progress = 95;
    checkpoint.activity = "waiting";
  }
  const safeCompletedPages = Number(checkpoint.completedPages ?? 0);
  const safeEstimatedPages = Math.max(Number(checkpoint.estimatedPages ?? 0), 1);
  return {
    progress: retryingReview
      ? 81
      : retryingRepair
        ? 88
        : retryingCompiling
          ? 95
          : 40 + Math.floor(Math.min(safeCompletedPages / safeEstimatedPages, 1) * 32),
    currentStep: retryingReview
      ? "等待重新进行视觉审查"
      : retryingRepair
        ? "等待从失败页面继续定向修复"
        : retryingCompiling
          ? "等待重新编译编辑能力"
          : "等待从失败页面继续",
    checkpoint,
  };
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
      { type: task.type },
    );
    return { task };
  });

  app.post("/api/v1/tasks", async (req) => {
    const body = z
      .object({
        type: taskTypeSchema,
        goal: z.string().min(1).max(500),
        spec: z.record(z.string(), z.unknown()).optional(),
        inputAssetIds: z.array(z.string()).optional(),
      })
      .parse(req.body);
    await Promise.all(
      (body.inputAssetIds ?? []).map((assetId) =>
        requireAssetAccess(ctx, req.actor, assetId, "read"),
      ),
    );
    const task = await ctx.store.createTask(req.actor, {
      type: body.type,
      goal: body.goal,
      spec: body.spec ?? {},
      ...(body.inputAssetIds !== undefined ? { inputAssetIds: body.inputAssetIds } : {}),
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
      data: { taskId: task.id, taskType: task.type, spec: body.spec ?? {} },
    });
    return { task };
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

  /**
   * Snapshot of the presentation deck as it stood when visual review flagged it
   * (or the last post-repair state when no review snapshot exists). Served so
   * a failed generation can be inspected directly — the user judges whether the
   * failure was a real defect or a false positive in the detection logic.
   */
  app.get("/api/v1/tasks/:id/presentation-snapshot", async (req, reply) => {
    const { id } = req.params as { id: string };
    const task = await ctx.store.getTask(req.actor.workspaceId, id);
    if (!task) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    if (task.type !== "presentation_generate") {
      return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    }
    const snapshot = await buildPresentationSnapshotPayload(task, ctx.storage);
    if (!snapshot) return reply.code(404).send({ code: "SNAPSHOT_NOT_FOUND" });
    return snapshot;
  });

  app.get("/api/v1/tasks/:id/stream", async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = z
      .object({
        runId: z.string().optional(),
        after: z.coerce.number().int().nonnegative().optional(),
        limit: z.coerce.number().int().min(1).max(2000).default(500),
      })
      .parse(req.query);
    const task = await ctx.store.getTask(req.actor.workspaceId, id);
    if (!task) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    return {
      taskId: id,
      events: await ctx.store.listTaskStreamEvents(req.actor.workspaceId, id, query),
    };
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
    const retryState = buildTaskRetryState(task);
    await ctx.store.updateTask(req.actor.workspaceId, id, {
      status: "queued",
      ...retryState,
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
