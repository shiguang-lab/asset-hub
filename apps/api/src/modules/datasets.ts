import {
  executeDatasetQuery,
  inferSchema,
  parseDataset,
  profileDataset,
  qualityIssues,
} from "@shiguang/content";
import { datasetQuerySchema, nextId, nowIso } from "@shiguang/contracts";
import { hashBuffer } from "@shiguang/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";

export function registerDatasets(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.post("/api/v1/datasets/import", async (req, reply) => {
    const part = await req.file();
    if (!part) throw badRequest("FILE_REQUIRED", "请上传 CSV/JSON/TSV 文件");
    const buffer = Buffer.from(await part.toBuffer());
    if (buffer.byteLength > 50 * 1024 * 1024)
      throw badRequest("FILE_TOO_LARGE", "文件不能超过 50MB");
    const fileName = part.filename;
    const nameField = Array.isArray(part.fields.name) ? part.fields.name[0] : part.fields.name;
    const descField = Array.isArray(part.fields.description)
      ? part.fields.description[0]
      : part.fields.description;
    const name =
      (nameField && "value" in nameField ? String(nameField.value) : "").trim() ||
      fileName.replace(/\.[^.]+$/, "");
    const description = descField && "value" in descField ? String(descField.value) : "";
    const dataset = await ctx.store.createDataset(req.actor, { name, description });
    const objectKey = `datasets/${req.actor.workspaceId}/${dataset.id}/${Date.now()}-${fileName}`;
    await ctx.storage.put(objectKey, buffer, part.mimetype || "text/csv");
    const task = await ctx.store.createTask(req.actor, {
      type: "dataset_import",
      goal: `导入数据集 ${fileName}`,
      spec: {
        datasetId: dataset.id,
        objectKey,
        fileName,
        contentHash: hashBuffer(buffer),
        size: buffer.byteLength,
      },
      inputAssetIds: [],
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
      data: {
        taskId: task.id,
        taskType: "dataset_import",
        spec: {
          datasetId: dataset.id,
          objectKey,
          fileName,
          contentHash: hashBuffer(buffer),
        },
      },
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "dataset.import",
      dataset.id,
      "success",
      { fileName },
    );
    return reply.code(202).send({ dataset, task });
  });

  app.get("/api/v1/datasets", async (req) => await ctx.store.listDatasets(req.actor.workspaceId));

  app.get("/api/v1/datasets/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const dataset = await ctx.store.getDataset(req.actor.workspaceId, id);
    if (!dataset) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    const version = dataset.currentVersionId
      ? await ctx.store.getDatasetVersion(id, dataset.currentVersionId)
      : null;
    const views = await ctx.store.listSavedViews(id);
    const charts = await ctx.store.listChartSpecs(id);
    return { ...dataset, currentVersion: version, views, charts };
  });

  app.get("/api/v1/datasets/:id/versions", async (req) => {
    const { id } = req.params as { id: string };
    const dataset = await ctx.store.getDataset(req.actor.workspaceId, id);
    if (!dataset) throw notFound("数据集");
    return await ctx.store.listDatasetVersions(id);
  });

  app.post("/api/v1/datasets/:id/query", async (req) => {
    const { id } = req.params as { id: string };
    const query = datasetQuerySchema.parse(req.body);
    const dataset = await ctx.store.getDataset(req.actor.workspaceId, id);
    if (!dataset) throw notFound("数据集");
    const version = await ctx.store.getDatasetVersion(id, query.datasetVersionId);
    if (version?.status !== "ready") throw badRequest("DATASET_NOT_READY", "数据集版本未就绪");
    const computeResult = await queryComputeWorker(
      ctx,
      query,
      version.objectKey ?? undefined,
    ).catch(() => null);
    if (computeResult) return computeResult;
    const data = await ctx.storage.get(version.objectKey ?? "");
    if (!data) throw badRequest("DATASET_DATA_MISSING", "数据集数据缺失，请重新导入");
    const parsed = parseDataset(data, version.fileName);
    const result = executeDatasetQuery(parsed.rows, version.schema, query);
    return result;
  });

  app.post("/api/v1/datasets/:id/views", async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ name: z.string().min(1).max(80), query: datasetQuerySchema })
      .parse(req.body);
    return await ctx.store.createSavedView(req.actor, id, body);
  });

  app.get("/api/v1/datasets/:id/views", async (req) => {
    const { id } = req.params as { id: string };
    return await ctx.store.listSavedViews(id);
  });

  app.post("/api/v1/datasets/:id/charts", async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1),
        chartType: z.enum(["bar", "line", "pie", "scatter", "table"]),
        x: z.string().nullable().optional(),
        y: z.string().nullable().optional(),
        groupBy: z.string().nullable().optional(),
        aggregation: z.enum(["sum", "avg", "count", "min", "max", "none"]).default("sum"),
      })
      .parse(req.body);
    return await ctx.store.createChartSpec(req.actor, id, {
      name: body.name,
      chartType: body.chartType,
      x: body.x ?? null,
      y: body.y ?? null,
      groupBy: body.groupBy ?? null,
      aggregation: body.aggregation,
    });
  });

  app.get("/api/v1/datasets/:id/charts", async (req) => {
    const { id } = req.params as { id: string };
    return await ctx.store.listChartSpecs(id);
  });

  app.post("/api/v1/datasets/:id/ai-insights", async (req) => {
    const { id } = req.params as { id: string };
    const dataset = await ctx.store.getDataset(req.actor.workspaceId, id);
    if (!dataset) throw notFound("数据集");
    const version = dataset.currentVersionId
      ? await ctx.store.getDatasetVersion(id, dataset.currentVersionId)
      : null;
    if (!version) throw badRequest("DATASET_NOT_READY", "数据集没有可用版本");
    const res = await ctx.ai.completeJson<{ insights: string[] }>(
      {
        messages: [
          {
            role: "system",
            content: "你是数据分析助手，只基于提供的统计结果生成结构化洞察，不编造数字。",
          },
          {
            role: "user",
            content: `dataset-insights\nstats: ${JSON.stringify(version.profile)}\n输出 {insights:[string]}`,
          },
        ],
        quality: "balanced",
      },
      z.object({ insights: z.array(z.string()) }),
    );
    return { insights: res.data.insights, provider: res.provider };
  });

  app.post("/api/v1/datasets/analyze", async (req) => {
    const body = z.object({ content: z.string().max(5_000_000) }).parse(req.body);
    const parsed = parseDataset(Buffer.from(body.content, "utf8"), "inline.csv");
    const schema = inferSchema(parsed.rows);
    const profile = profileDataset(parsed.rows, schema);
    const issues = qualityIssues(parsed.rows, schema);
    return {
      rowCount: parsed.rows.length,
      schema,
      profile,
      qualityIssues: issues,
      warnings: parsed.warnings,
    };
  });
}

async function queryComputeWorker(
  _ctx: AppContext,
  query: z.infer<typeof datasetQuerySchema>,
  dataKey?: string,
): Promise<unknown | null> {
  const base = process.env.COMPUTE_URL ?? "http://localhost:3002";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${base}/internal/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": process.env.COMPUTE_TOKEN ?? "dev-compute-token",
      },
      body: JSON.stringify({ ...query, dataKey }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
