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

const internalTokens = (): string[] => {
  const configured = [
    process.env.INTERNAL_TOKEN,
    process.env.WORKER_TOKEN,
    process.env.COMPUTE_TOKEN,
    process.env.PUBLIC_GATEWAY_TOKEN,
  ].filter((t): t is string => Boolean(t));
  if (process.env.NODE_ENV === "production") return configured;
  return [
    ...configured,
    "dev-internal-token",
    "dev-worker-token",
    "dev-compute-token",
    "dev-gateway-token",
  ];
};

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
    workspaceType: "team",
    workspaceRole: "admin",
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
    const events = await ctx.store.claimOutbox(body.limit);
    return { events };
  });

  app.post("/internal/v1/outbox/:id/ack", async (req) => {
    const { id } = req.params as { id: string };
    await ctx.store.markOutboxDispatched(id);
    return { ok: true };
  });

  app.post("/internal/v1/outbox/:id/nack", async (req) => {
    const { id } = req.params as { id: string };
    await ctx.store.markOutboxFailed(id);
    return { ok: true };
  });

  app.get("/internal/v1/objects", async (req, reply) => {
    const { key } = z.object({ key: z.string().min(1).max(2048) }).parse(req.query);
    const contents = await ctx.storage.get(key);
    if (!contents) {
      return reply.status(404).send({ code: "NOT_FOUND", detail: "对象不存在" });
    }
    return reply.type("application/octet-stream").send(contents);
  });

  /* ---------------- task progress ---------------- */

  app.post("/internal/v1/progress", async (req) => {
    const event = progressEventSchema.parse(req.body);
    const task = await ctx.store.getTaskAny(event.taskId);
    if (!task) return { ok: false, reason: "task_not_found" };
    const patch: {
      status?: typeof task.status;
      progress?: number;
      currentStep?: string;
    } = {};
    if (event.status) patch.status = event.status;
    if (event.progress !== undefined) patch.progress = event.progress;
    if (event.detail) patch.currentStep = event.detail;
    const updated = await ctx.store.updateTask(task.workspaceId, task.id, patch);
    if (event.stepId) {
      const step = (await ctx.store
        .getDb()
        .prepare("SELECT * FROM task_steps WHERE id = ?")
        .get(event.stepId)) as Record<string, unknown> | undefined;
      if (step) {
        await ctx.store.upsertStep({
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
    const task = await ctx.store.getTaskAny(result.taskId);
    if (!task) return { ok: false, reason: "task_not_found" };
    const inboxKey = `result:${result.runId}:${result.attempt}`;
    if (await ctx.store.hasInbox(inboxKey, "task-results")) {
      return { ok: true, replayed: true };
    }

    const outputAssetIds: string[] = [];
    const failures = result.failures ?? [];
    for (const evidence of result.evidence ?? []) {
      await ctx.store.createEvidence(task.workspaceId, task.id, {
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
          const datasetRecord = await ctx.store.createDatasetRecord(
            task.workspaceId,
            output.title ?? manifest.name ?? "数据集",
          );
          const datasetAsset = await ctx.store.createAssetWithVersion(
            {
              subject: task.ownerSubject,
              workspaceId: task.workspaceId,
              workspaceType: "team",
              workspaceRole: "admin",
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
          const _version = await ctx.store.addDatasetVersion(task.workspaceId, datasetRecord.id, {
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
            await ctx.store.addRelation(
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
        kind: "markdown" | "html" | "manifest" | "blob";
        text?: string;
        manifest?: Record<string, unknown>;
        refs?: Array<{
          role: string;
          objectKey: string;
          contentHash: string;
          size: number;
          mediaType: string;
        }>;
      } | null = null;
      if (output.content) {
        const htmlText = (output.content as { html?: string }).html;
        if (typeof htmlText === "string") {
          // presentation Artifact：直接存 HTML
          content = { kind: "html", text: htmlText };
        } else {
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
        }
      } else if (output.blob) {
        const isText = ["text/markdown", "text/plain", "text/html"].includes(output.blob.mediaType);
        const isManifest = output.assetType === "presentation" || output.assetType === "dataset";
        if (!isText && !isManifest) {
          content = {
            kind: "blob",
            refs: [{ role: "content", ...output.blob }],
          };
        } else {
          const data = await ctx.storage.get(output.blob.objectKey);
          if (data) {
            const kind =
              output.blob.mediaType === "text/html" ? "html" : isManifest ? "manifest" : "markdown";
            content =
              kind === "manifest"
                ? { kind, manifest: JSON.parse(data.toString("utf8")) as Record<string, unknown> }
                : { kind, text: data.toString("utf8") };
          }
        }
      }
      const asset = await ctx.store.createAssetWithVersion(
        {
          subject: task.ownerSubject,
          workspaceId: task.workspaceId,
          workspaceType: "team",
          workspaceRole: "admin",
          requestId: "internal",
          isService: true,
          tokenScopes: ["read", "write"],
        },
        {
          type: output.assetType ?? (output.kind === "report-draft" ? "report" : "file"),
          title: output.title ?? output.blob?.objectKey.split("/").at(-1) ?? task.goal,
          sourceType: "research",
          content: content
            ? {
                kind: content.kind,
                text: content.text ?? null,
                manifest: content.manifest ?? null,
                refs: content.refs ?? [],
              }
            : undefined,
        },
      );
      outputAssetIds.push(asset.asset.id);
      const inputAssetId = task.inputAssetIds[0];
      if (inputAssetId) {
        await ctx.store.addRelation(
          task.workspaceId,
          inputAssetId,
          asset.asset.id,
          output.assetType === "presentation" ? "generated_from" : "derived_from",
          { taskId: task.id },
        );
      }
    }

    for (const failure of failures) {
      await ctx.store.createNotification({
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
    await ctx.store.updateTask(task.workspaceId, task.id, {
      status,
      progress: status === "completed" ? 100 : 85,
      currentStep: status === "failed" ? "任务失败" : "任务完成",
      error: status === "failed" ? failures.map((f) => f.reason).join("; ") : null,
      creditsUsed,
    });
    for (const assetId of outputAssetIds) {
      await ctx.store.addOutput(task.workspaceId, task.id, assetId);
    }
    await ctx.store.settleCredits(
      task.workspaceId,
      task.id,
      creditsUsed,
      `op_settle_${task.id}_${result.runId}`,
    );
    await ctx.store.insertInbox(inboxKey, "task-results");
    await ctx.store.audit(
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

    await ctx.bus.emit({
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
    await ctx.bus.notify(task.workspaceId, task.ownerSubject, {
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
    if (await ctx.store.hasInbox(inboxKey, "compute-results")) return { ok: true, replayed: true };

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
      const dataset = await ctx.store.getDatasetAny(d.datasetId);
      if (!dataset) return { ok: false, reason: "dataset_not_found" };
      const version = await ctx.store.addDatasetVersion(dataset.workspaceId, d.datasetId, {
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
      await ctx.store.insertInbox(inboxKey, "compute-results");
      await ctx.store.audit(
        dataset.workspaceId,
        "internal",
        "dataset.version.ready",
        d.datasetId,
        "success",
        { version: version.version },
      );
      await ctx.bus.emit({
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
      const source = await ctx.store.getKnowledgeSource(d.kbId, d.sourceId);
      if (!source) return { ok: false, reason: "source_not_found" };
      await ctx.store.replaceChunks(d.kbId, d.sourceId, d.chunks);
      await ctx.store.insertInbox(inboxKey, "compute-results");
      await ctx.bus.emit({
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
      const ownerSubject =
        (await ctx.store.getWorkspaceOwnerSubject(source.workspaceId)) ?? "dev-user";
      await ctx.bus.notify(source.workspaceId, ownerSubject, {
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
    const row = (await ctx.store
      .getDb()
      .prepare("SELECT * FROM git_connections WHERE id = ?")
      .get(id)) as Record<string, unknown> | undefined;
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
    schedules: (await ctx.store.getDueSchedules()).map((s) => ({
      id: s.id,
      workspaceId: s.workspace_id,
      name: s.name,
      goal: s.goal,
      spec: parseJson(s.spec_json),
    })),
  }));

  app.post("/internal/v1/schedules/:id/run", async (req) => {
    const { id } = req.params as { id: string };
    await ctx.store.markScheduleRun(id);
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
    const owner = await ctx.store.getWorkspaceOwnerSubject(body.workspaceId);
    if (!owner) return { ok: false, reason: "workspace_not_found" };
    const actor = {
      subject: owner,
      workspaceId: body.workspaceId,
      workspaceType: "team" as const,
      workspaceRole: "admin" as const,
      requestId: `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
      isService: true,
      tokenScopes: ["read", "write"] as Array<"read" | "write">,
    };
    const task = await ctx.store.createTask(actor, {
      type: body.type as "research",
      goal: body.goal,
      spec: body.spec,
    });
    await ctx.store.reserveCredits(body.workspaceId, task.id, 400, `op_reserve_${task.id}`);
    await ctx.bus.emit({
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
    const domain = await ctx.store.getCustomDomainByDomain(host);
    if (!domain || String(domain.status) !== "verified" || !domain.publish_id) {
      return reply.status(404).send({ code: "DOMAIN_NOT_FOUND" });
    }
    const publish = (await ctx.store
      .getDb()
      .prepare("SELECT * FROM publishes WHERE id = ?")
      .get(String(domain.publish_id))) as Record<string, unknown> | undefined;
    if (!publish) return reply.status(404).send({ code: "PUBLISH_NOT_FOUND" });
    const slug = (publish as { slug?: string }).slug ?? String(domain.publish_id);
    return { publishId: domain.publish_id, slug };
  });

  app.get("/internal/v1/publishes/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const publish =
      (await ctx.store.getPublishBySlug(slug)) ?? (await ctx.store.getPublishByShortSlug(slug));
    if (!publish || publish.status === "revoked" || publish.status === "deleted") {
      return reply.status(404).send({ code: "NOT_FOUND" });
    }
    if (
      publish.status === "expired" ||
      (publish.expiresAt && new Date(publish.expiresAt).getTime() < Date.now())
    ) {
      await ctx.store.updatePublish(publish.workspaceId, publish.id, { status: "expired" });
      return reply.status(410).send({ code: "EXPIRED", expiresAt: publish.expiresAt });
    }
    const release = publish.activeReleaseId
      ? await ctx.store.getRelease(publish.activeReleaseId)
      : null;
    const asset = await ctx.store.getAssetAny(publish.assetId);
    const publisher = asset ? await ctx.store.getUserProfile(asset.ownerSubject) : null;
    const visitorCount = await ctx.store.getPublishVisitorCount(publish.id);
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
      asset: asset
        ? {
            id: asset.id,
            type: asset.type,
            title: asset.title,
            ownerSubject: asset.ownerSubject,
            ownerDisplayName: asset.ownerDisplayName ?? null,
          }
        : null,
      publisher: publisher
        ? {
            name: publisher.name,
            avatarUrl: publisher.avatarUrl,
          }
        : null,
      stats: {
        uniqueVisitors: visitorCount,
      },
    };
  });

  app.get("/internal/v1/release-files", async (req, reply) => {
    const query = z
      .object({ publishId: z.string(), releaseId: z.string(), path: z.string() })
      .parse(req.query);
    const relativePath = normalizeReleasePath(query.path);
    if (!relativePath) {
      return reply.status(400).send({ code: "INVALID_RELEASE_PATH" });
    }
    const release = (await ctx.store
      .getDb()
      .prepare("SELECT id FROM publish_releases WHERE id = ? AND publish_id = ?")
      .get(query.releaseId, query.publishId)) as Record<string, unknown> | undefined;
    if (!release) return reply.status(404).send({ code: "RELEASE_NOT_FOUND" });
    const objectKey = `publishes/${query.publishId}/releases/${query.releaseId}/${relativePath}`;
    const data = await ctx.storage.get(objectKey);
    if (!data) return reply.status(404).send({ code: "RELEASE_FILE_NOT_FOUND" });
    return reply
      .type(releaseMediaType(relativePath))
      .header("content-length", String(data.byteLength))
      .send(data);
  });

  app.post("/internal/v1/publishes/:slug/unlock", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = z.object({ password: z.string() }).parse(req.body);
    const publish =
      (await ctx.store.getPublishBySlug(slug)) ?? (await ctx.store.getPublishByShortSlug(slug));
    if (publish?.status !== "active") {
      return reply.status(404).send({ code: "NOT_FOUND" });
    }
    if (!(await ctx.store.verifyPassword(publish, body.password))) {
      await ctx.store.audit(
        publish.workspaceId,
        "anonymous",
        "publish.unlock",
        publish.id,
        "denied",
        {},
      );
      return reply.status(401).send({ code: "INVALID_PASSWORD" });
    }
    const secret = process.env.PUBLISH_HMAC_SECRET ?? "dev-publish-secret";
    const exp = Date.now() + 12 * 3600 * 1000;
    const payload = JSON.stringify({ publishId: publish.id, exp });
    const token = `${Buffer.from(payload).toString("base64url")}.${signHmac(payload, secret)}`;
    await ctx.store.audit(
      publish.workspaceId,
      "anonymous",
      "publish.unlock",
      publish.id,
      "success",
      {},
    );
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
    await ctx.store.recordAccessEvent(body);
    return { ok: true };
  });

  app.post("/internal/v1/presence", async (req) => {
    const body = z
      .object({
        publishId: z.string(),
        releaseId: z.string().optional().nullable(),
        visitorKey: z.string().min(8).max(180),
        userId: z.string().max(180).optional().nullable(),
        displayName: z.string().max(120).optional().nullable(),
        avatarUrl: z.string().url().max(2_000).optional().nullable(),
        referrerDomain: z.string().max(255).optional().nullable(),
        deviceClass: z.string().max(40).optional().nullable(),
      })
      .parse(req.body);
    return await ctx.store.recordPresence(body);
  });

  // Published-page comments are read through the anonymous public data plane:
  // the gateway resolves slug -> publish/release and forwards this request.
  app.get("/internal/v1/comments", async (req) => {
    const query = z
      .object({
        publishId: z.string().min(1).max(100),
        releaseId: z.string().min(1).max(100).optional().nullable(),
      })
      .parse(req.query);
    return { comments: await ctx.store.listComments(query.publishId, query.releaseId ?? null) };
  });
}

export function normalizeReleasePath(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  return normalized;
}

function releaseMediaType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
