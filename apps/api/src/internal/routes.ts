import {
  type ActorContext,
  nextId,
  nowIso,
  progressEventSchema,
  workflowResultSchema,
} from "@shiguang/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { unauthorized } from "../platform/errors.js";
import { signHmac } from "../platform/identity.js";

const internalTokens = (): string[] =>
  [
    process.env.INTERNAL_TOKEN,
    process.env.WORKER_TOKEN,
    process.env.COMPUTE_TOKEN,
    process.env.PUBLIC_GATEWAY_TOKEN,
    "dev-internal-token",
    "dev-worker-token",
    "dev-compute-token",
    "dev-gateway-token",
  ].filter((t): t is string => Boolean(t));

function internalActor(req: {
  headers: Record<string, string | string[] | undefined>;
}): ActorContext {
  const header = Array.isArray(req.headers["x-internal-token"])
    ? req.headers["x-internal-token"][0]
    : req.headers["x-internal-token"];
  if (!header || !internalTokens().includes(header)) {
    throw unauthorized("内部接口凭证无效");
  }
  return {
    subject: "internal",
    workspaceId: "wsp_internal",
    requestId: nextId("req"),
    isService: true,
    tokenScopes: ["read", "write"],
  };
}

const resultProjectionSchema = workflowResultSchema;

export function registerInternalRoutes(app: FastifyInstance): void {
  const { ctx } = app;

  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/internal/")) {
      try {
        req.actor = internalActor(req);
      } catch {
        reply.status(401).send({ code: "UNAUTHORIZED", detail: "内部接口凭证无效" });
        return reply;
      }
    }
  });

  /* ---------------- outbox ---------------- */

  app.post("/internal/v1/outbox/claim", async (req) => {
    const body = z.object({ limit: z.number().min(1).max(50).default(10) }).parse(req.body ?? {});
    const events = ctx.store.claimOutbox(body.limit);
    return { events };
  });

  app.post("/internal/v1/outbox/:id/ack", async (req) => {
    const { id } = req.params as { id: string };
    ctx.store.markOutboxDispatched(id);
    return { ok: true };
  });

  app.post("/internal/v1/outbox/:id/nack", async (req) => {
    const { id } = req.params as { id: string };
    ctx.store.markOutboxFailed(id);
    return { ok: true };
  });

  /* ---------------- task progress ---------------- */

  app.post("/internal/v1/progress", async (req) => {
    const event = progressEventSchema.parse(req.body);
    const task = ctx.store.getTaskAny(event.taskId);
    if (!task) return { ok: false, reason: "task_not_found" };
    const patch: {
      status?: typeof task.status;
      progress?: number;
      currentStep?: string;
    } = {};
    if (event.status) patch.status = event.status;
    if (event.progress !== undefined) patch.progress = event.progress;
    if (event.detail) patch.currentStep = event.detail;
    const updated = ctx.store.updateTask(task.workspaceId, task.id, patch);
    if (event.stepId) {
      const step = ctx.store
        .getDb()
        .prepare("SELECT * FROM task_steps WHERE id = ?")
        .get(event.stepId) as Record<string, unknown> | undefined;
      if (step) {
        ctx.store.upsertStep({
          id: event.stepId,
          taskId: task.id,
          type: String(step.type),
          status: (event.stepStatus ?? step.status) as
            | "pending"
            | "running"
            | "completed"
            | "failed"
            | "skipped",
          progress: event.progress ?? Number(step.progress),
          detail: event.detail ?? String(step.detail),
          error: null,
          attempt: Number(step.attempt),
          outputs: {},
          startedAt: step.started_at as string | null,
          completedAt:
            event.stepStatus === "completed" || event.stepStatus === "failed"
              ? nowIso()
              : (step.completed_at as string | null),
        });
      }
    }
    ctx.sse.broadcast(task.workspaceId, {
      id: nextId("evt"),
      event: "task.updated",
      data: {
        taskId: task.id,
        status: updated?.status,
        progress: updated?.progress,
        detail: event.detail,
      },
    });
    return { ok: true };
  });

  /* ---------------- task result projection ---------------- */

  app.post("/internal/v1/task-results:project", async (req) => {
    const result = resultProjectionSchema.parse(req.body);
    const task = ctx.store.getTaskAny(result.taskId);
    if (!task) return { ok: false, reason: "task_not_found" };
    const inboxKey = `result:${result.runId}:${result.attempt}`;
    if (ctx.store.hasInbox(inboxKey, "task-results")) {
      return { ok: true, replayed: true };
    }

    const outputAssetIds: string[] = [];
    const failures = result.failures ?? [];
    for (const evidence of result.evidence ?? []) {
      ctx.store.createEvidence(task.workspaceId, task.id, {
        claim: evidence.claim,
        sourceTitle: evidence.sourceTitle,
        sourceUrl: evidence.sourceUrl ?? null,
        sourceAssetVersionId: evidence.sourceAssetVersionId ?? null,
        locator: evidence.locator ?? null,
        excerptHash: evidence.excerptHash ?? null,
        excerpt: evidence.excerpt,
        confidence: evidence.confidence,
        verificationStatus: evidence.verificationStatus,
      });
    }
    for (const output of result.outputs) {
      if (output.assetType === "dataset") {
        const manifest = output.content?.manifest as
          | {
              name?: string;
              fileName?: string;
              format?: string;
              rows?: Array<Record<string, unknown>>;
              schema?: Array<Record<string, unknown>>;
              profile?: Record<string, unknown>;
              qualityIssues?: Array<Record<string, unknown>>;
            }
          | undefined;
        if (manifest) {
          const datasetRecord = ctx.store.createDatasetRecord(
            task.workspaceId,
            output.title ?? manifest.name ?? "数据集",
          );
          const datasetAsset = ctx.store.createAssetWithVersion(
            {
              subject: task.ownerSubject,
              workspaceId: task.workspaceId,
              requestId: "internal",
              isService: true,
              tokenScopes: ["read", "write"],
            },
            {
              type: "dataset",
              title: output.title ?? manifest.name ?? "数据集",
              sourceType: "research",
              content: {
                kind: "manifest",
                text: null,
                manifest: { rows: manifest.rows ?? [] },
                refs: [],
              },
            },
          );
          const objectKey = `datasets/${task.workspaceId}/${datasetAsset.asset.id}/${Date.now()}-${manifest.fileName ?? "data.json"}`;
          await ctx.storage.put(
            objectKey,
            Buffer.from(JSON.stringify(manifest.rows ?? []), "utf8"),
            "application/json",
          );
          const _version = ctx.store.addDatasetVersion(task.workspaceId, datasetRecord.id, {
            fileName: manifest.fileName ?? "data.json",
            format: (manifest.format ?? "json") as "csv" | "json" | "tsv" | "xlsx",
            rowCount: manifest.rows?.length ?? 0,
            schema: (manifest.schema ?? []).map((c) => ({
              columnId: String(c.columnId ?? ""),
              name: String(c.name ?? ""),
              type: String(c.type ?? "string") as
                | "string"
                | "number"
                | "integer"
                | "boolean"
                | "date"
                | "null",
              nullable: Boolean(c.nullable),
              distinctCount: Number(c.distinctCount ?? 0),
            })),
            profile: manifest.profile ?? {},
            qualityIssues: (manifest.qualityIssues ?? []) as never,
            objectKey,
            contentHash: "",
          });
          outputAssetIds.push(datasetAsset.asset.id);
          const datasetInput = task.inputAssetIds[0];
          if (datasetInput) {
            ctx.store.addRelation(
              task.workspaceId,
              datasetInput,
              datasetAsset.asset.id,
              "derived_from",
              { taskId: task.id },
            );
          }
          continue;
        }
      }
      let content: {
        kind: "markdown" | "html" | "manifest";
        text?: string;
        manifest?: Record<string, unknown>;
        refs?: unknown[];
      } | null = null;
      if (output.content) {
        const kind =
          output.assetType === "presentation"
            ? "manifest"
            : output.assetType === "html"
              ? "html"
              : "markdown";
        content =
          kind === "manifest"
            ? {
                kind,
                manifest:
                  (output.content as { manifest?: Record<string, unknown> }).manifest ??
                  (output.content as Record<string, unknown>),
              }
            : { kind, text: String(output.content.text ?? output.content.source ?? "") };
      } else if (output.blob) {
        const data = await ctx.storage.get(output.blob.objectKey);
        if (data) {
          const kind =
            output.blob.mediaType === "text/html"
              ? "html"
              : output.assetType === "presentation" || output.assetType === "dataset"
                ? "manifest"
                : "markdown";
          content =
            kind === "manifest"
              ? { kind, manifest: JSON.parse(data.toString("utf8")) as Record<string, unknown> }
              : { kind, text: data.toString("utf8") };
        }
      }
      const asset = ctx.store.createAssetWithVersion(
        {
          subject: task.ownerSubject,
          workspaceId: task.workspaceId,
          requestId: "internal",
          isService: true,
          tokenScopes: ["read", "write"],
        },
        {
          type: output.assetType ?? (output.kind === "report-draft" ? "report" : "file"),
          title: output.title ?? task.goal,
          sourceType: "research",
          content: content
            ? {
                kind: content.kind,
                text: content.text ?? null,
                manifest: content.manifest ?? null,
                refs: [],
              }
            : undefined,
        },
      );
      outputAssetIds.push(asset.asset.id);
      if (output.assetType === "presentation") {
        const presentationInput = task.inputAssetIds[0];
        if (presentationInput) {
          ctx.store.addRelation(
            task.workspaceId,
            presentationInput,
            asset.asset.id,
            "generated_from",
            { taskId: task.id },
          );
        }
      }
    }

    for (const failure of failures) {
      ctx.store.createNotification({
        workspaceId: task.workspaceId,
        subject: task.ownerSubject,
        type: "task_partial",
        title: `任务“${task.goal}”有失败项`,
        body: `${failure.item}: ${failure.reason}`,
        link: `/tasks/${task.id}`,
      });
    }

    const status =
      failures.length > 0 && outputAssetIds.length > 0
        ? "partial_completed"
        : failures.length > 0
          ? "failed"
          : "completed";
    const creditsUsed = result.usage?.creditUnits ?? 0;
    ctx.store.updateTask(task.workspaceId, task.id, {
      status,
      progress: status === "completed" ? 100 : 85,
      currentStep: status === "failed" ? "任务失败" : "任务完成",
      error: status === "failed" ? failures.map((f) => f.reason).join("; ") : null,
      creditsUsed,
    });
    for (const assetId of outputAssetIds) {
      ctx.store.addOutput(task.workspaceId, task.id, assetId);
    }
    ctx.store.settleCredits(
      task.workspaceId,
      task.id,
      creditsUsed,
      `op_settle_${task.id}_${result.runId}`,
    );
    ctx.store.insertInbox(inboxKey, "task-results");
    ctx.store.audit(
      task.workspaceId,
      task.ownerSubject,
      "task.result.project",
      task.id,
      "success",
      {
        status,
        outputs: outputAssetIds.length,
        failures: failures.length,
      },
    );

    ctx.bus.emit({
      eventId: nextId("evt"),
      eventType:
        status === "completed"
          ? "task.completed"
          : status === "partial_completed"
            ? "task.partial"
            : "task.failed",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "worker",
      tenantId: task.workspaceId,
      aggregate: { type: "task", id: task.id, version: 1 },
      trace: {},
      data: {
        taskId: task.id,
        outputAssetIds,
        creditsUsed,
        error: status === "failed" ? failures.map((f) => f.reason).join("; ") : undefined,
      },
    });
    ctx.bus.notify(task.workspaceId, task.ownerSubject, {
      type:
        status === "completed"
          ? "task_completed"
          : status === "partial_completed"
            ? "task_partial"
            : "task_failed",
      title:
        status === "completed"
          ? `任务“${task.goal}”已完成`
          : status === "partial_completed"
            ? `任务“${task.goal}”部分完成`
            : `任务“${task.goal}”失败`,
      body: `已生成 ${outputAssetIds.length} 个结果，消耗 ${creditsUsed} Credits。`,
      link: `/tasks/${task.id}`,
    });
    ctx.sse.broadcast(task.workspaceId, {
      id: nextId("evt"),
      event: "task.completed",
      data: { taskId: task.id, status, outputAssetIds },
    });
    return { ok: true, taskId: task.id, status, outputAssetIds, replayed: false };
  });

  /* ---------------- compute results ---------------- */

  app.post("/internal/v1/compute/results", async (req) => {
    const body = z
      .object({
        kind: z.enum(["dataset_import", "knowledge.indexed"]),
        taskId: z.string(),
        runId: z.string(),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(req.body);
    const inboxKey = `compute:${body.kind}:${body.runId}`;
    if (ctx.store.hasInbox(inboxKey, "compute-results")) return { ok: true, replayed: true };

    if (body.kind === "dataset_import") {
      const d = z
        .object({
          datasetId: z.string(),
          fileName: z.string(),
          format: z.enum(["csv", "json", "tsv", "xlsx"]),
          rowCount: z.number(),
          schema: z.array(
            z.object({
              columnId: z.string(),
              name: z.string(),
              type: z.string(),
              nullable: z.boolean(),
              distinctCount: z.number(),
            }),
          ),
          profile: z.record(z.string(), z.unknown()),
          qualityIssues: z.array(z.record(z.string(), z.unknown())),
          objectKey: z.string(),
          contentHash: z.string(),
        })
        .parse(body.data);
      const dataset = ctx.store.getDatasetAny(d.datasetId);
      if (!dataset) return { ok: false, reason: "dataset_not_found" };
      const version = ctx.store.addDatasetVersion(dataset.workspaceId, d.datasetId, {
        fileName: d.fileName,
        format: d.format,
        rowCount: d.rowCount,
        schema: d.schema.map((c) => ({
          columnId: c.columnId,
          name: c.name,
          type: c.type as "string" | "number" | "integer" | "boolean" | "date" | "null",
          nullable: c.nullable,
          distinctCount: c.distinctCount,
        })),
        profile: d.profile,
        qualityIssues: d.qualityIssues as never,
        objectKey: d.objectKey,
        contentHash: d.contentHash,
      });
      ctx.store.insertInbox(inboxKey, "compute-results");
      ctx.store.audit(
        dataset.workspaceId,
        "internal",
        "dataset.version.ready",
        d.datasetId,
        "success",
        { version: version.version },
      );
      ctx.bus.emit({
        eventId: nextId("evt"),
        eventType: "dataset.version.ready",
        schemaVersion: 1,
        occurredAt: nowIso(),
        producer: "compute-worker",
        tenantId: dataset.workspaceId,
        aggregate: { type: "dataset", id: d.datasetId, version: version.version },
        trace: {},
        data: { datasetId: d.datasetId, versionId: version.id },
      });
      return { ok: true, datasetId: d.datasetId, versionId: version.id };
    }

    if (body.kind === "knowledge.indexed") {
      const d = z
        .object({
          kbId: z.string(),
          sourceId: z.string(),
          chunks: z.array(
            z.object({
              ordinal: z.number(),
              headingPath: z.string(),
              text: z.string(),
              charStart: z.number(),
              charEnd: z.number(),
            }),
          ),
        })
        .parse(body.data);
      const source = ctx.store.getKnowledgeSource(d.kbId, d.sourceId);
      if (!source) return { ok: false, reason: "source_not_found" };
      ctx.store.replaceChunks(d.kbId, d.sourceId, d.chunks);
      ctx.store.insertInbox(inboxKey, "compute-results");
      ctx.bus.emit({
        eventId: nextId("evt"),
        eventType: "knowledge.source.ready",
        schemaVersion: 1,
        occurredAt: nowIso(),
        producer: "compute-worker",
        tenantId: source.workspaceId,
        aggregate: { type: "knowledge_source", id: d.sourceId, version: 1 },
        trace: {},
        data: { sourceId: d.sourceId, kbId: d.kbId, chunkCount: d.chunks.length },
      });
      const ownerSubject = ctx.store.getWorkspaceOwnerSubject(source.workspaceId) ?? "dev-user";
      ctx.bus.notify(source.workspaceId, ownerSubject, {
        type: "knowledge_indexed",
        title: `知识库来源已索引：${source.title}`,
        body: `共 ${d.chunks.length} 个分块，可开始搜索与 Ask。`,
        link: `/knowledge/${d.kbId}`,
      });
      return { ok: true, sourceId: d.sourceId, chunkCount: d.chunks.length };
    }
    return { ok: false, reason: "unknown_kind" };
  });

  /* ---------------- publish metadata for public-gateway ---------------- */

  /* ---------------- git / schedules / domains internals ---------------- */

  app.get("/internal/v1/git/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = ctx.store.getDb().prepare("SELECT * FROM git_connections WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) return reply.status(404).send({ code: "NOT_FOUND" });
    return row;
  });

  app.post("/internal/v1/git/:id/status", async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        status: z.string(),
        lastSyncStatus: z.string().optional(),
        lastError: z.string().optional(),
      })
      .parse(req.body);
    ctx.store
      .getDb()
      .prepare(
        "UPDATE git_connections SET status = ?, last_sync_at = ?, last_sync_status = ?, last_error = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        body.status,
        nowIso(),
        body.lastSyncStatus ?? null,
        body.lastError ?? null,
        nowIso(),
        id,
      );
    return { ok: true };
  });

  app.get("/internal/v1/schedules/due", async () => ({
    schedules: ctx.store.getDueSchedules().map((s) => ({
      id: s.id,
      workspaceId: s.workspace_id,
      name: s.name,
      goal: s.goal,
      spec: parseJson(s.spec_json),
    })),
  }));

  app.post("/internal/v1/schedules/:id/run", async (req) => {
    const { id } = req.params as { id: string };
    ctx.store.markScheduleRun(id);
    return { ok: true };
  });

  app.post("/internal/v1/tasks:create", async (req) => {
    const body = z
      .object({
        workspaceId: z.string(),
        type: z.string().default("research"),
        goal: z.string(),
        spec: z.record(z.string(), z.unknown()).default({}),
      })
      .parse(req.body);
    const owner = ctx.store.getWorkspaceOwnerSubject(body.workspaceId);
    if (!owner) return { ok: false, reason: "workspace_not_found" };
    const actor = {
      subject: owner,
      workspaceId: body.workspaceId,
      requestId: `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      isService: true,
      tokenScopes: ["read", "write"] as Array<"read" | "write">,
    };
    const task = ctx.store.createTask(actor, {
      type: body.type as "research",
      goal: body.goal,
      spec: body.spec,
    });
    ctx.store.reserveCredits(body.workspaceId, task.id, 400, `op_reserve_${task.id}`);
    ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "task.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "scheduler",
      tenantId: body.workspaceId,
      aggregate: { type: "task", id: task.id, version: 1 },
      trace: {},
      data: { taskId: task.id, taskType: "research", spec: { ...body.spec, goal: body.goal } },
    });
    return { ok: true, taskId: task.id };
  });

  app.get("/internal/v1/domains/resolve", async (req, reply) => {
    const query = z.object({ host: z.string() }).parse(req.query);
    const host = query.host.toLowerCase();
    const domain = ctx.store.getCustomDomainByDomain(host);
    if (!domain || String(domain.status) !== "verified" || !domain.publish_id) {
      return reply.status(404).send({ code: "DOMAIN_NOT_FOUND" });
    }
    const publish = ctx.store
      .getDb()
      .prepare("SELECT * FROM publishes WHERE id = ?")
      .get(String(domain.publish_id)) as Record<string, unknown> | undefined;
    if (!publish) return reply.status(404).send({ code: "PUBLISH_NOT_FOUND" });
    const slug = (publish as { slug?: string }).slug ?? String(domain.publish_id);
    return { publishId: domain.publish_id, slug };
  });

  app.get("/internal/v1/publishes/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const publish = ctx.store.getPublishBySlug(slug) ?? ctx.store.getPublishByShortSlug(slug);
    if (!publish || publish.status === "revoked" || publish.status === "deleted") {
      return reply.status(404).send({ code: "NOT_FOUND" });
    }
    if (
      publish.status === "expired" ||
      (publish.expiresAt && new Date(publish.expiresAt).getTime() < Date.now())
    ) {
      ctx.store.updatePublish(publish.workspaceId, publish.id, { status: "expired" });
      return reply.status(410).send({ code: "EXPIRED", expiresAt: publish.expiresAt });
    }
    const release = publish.activeReleaseId ? ctx.store.getRelease(publish.activeReleaseId) : null;
    const asset = ctx.store.getAssetAny(publish.assetId);
    return {
      publish: {
        id: publish.id,
        slug: publish.slug,
        shortSlug: publish.shortSlug,
        visibility: publish.visibility,
        expiresAt: publish.expiresAt,
        allowDownload: publish.allowDownload,
        allowCopy: publish.allowCopy,
        status: publish.status,
      },
      release: release
        ? {
            id: release.id,
            etag: release.etag,
            manifest: release.manifest,
            createdAt: release.createdAt,
          }
        : null,
      asset: asset ? { id: asset.id, type: asset.type, title: asset.title } : null,
    };
  });

  app.post("/internal/v1/publishes/:slug/unlock", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = z.object({ password: z.string() }).parse(req.body);
    const publish = ctx.store.getPublishBySlug(slug) ?? ctx.store.getPublishByShortSlug(slug);
    if (publish?.status !== "active") {
      return reply.status(404).send({ code: "NOT_FOUND" });
    }
    if (!ctx.store.verifyPassword(publish, body.password)) {
      ctx.store.audit(publish.workspaceId, "anonymous", "publish.unlock", publish.id, "denied", {});
      return reply.status(401).send({ code: "INVALID_PASSWORD" });
    }
    const secret = process.env.PUBLISH_HMAC_SECRET ?? "dev-publish-secret";
    const exp = Date.now() + 12 * 3600 * 1000;
    const payload = JSON.stringify({ publishId: publish.id, exp });
    const token = `${Buffer.from(payload).toString("base64url")}.${signHmac(payload, secret)}`;
    ctx.store.audit(publish.workspaceId, "anonymous", "publish.unlock", publish.id, "success", {});
    return { token, expiresAt: new Date(exp).toISOString() };
  });

  app.post("/internal/v1/access", async (req) => {
    const body = z
      .object({
        publishId: z.string(),
        releaseId: z.string().optional().nullable(),
        tsBucket: z.string(),
        referrerDomain: z.string().optional().nullable(),
        deviceClass: z.string().optional().nullable(),
        hashedVisitor: z.string().optional().nullable(),
        statusCode: z.number().optional(),
      })
      .parse(req.body);
    ctx.store.recordAccessEvent(body);
    return { ok: true };
  });
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
