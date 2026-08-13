import {
  type ActorContext,
  type Asset,
  type AssetType,
  type McpToolName,
  mcpToolInputs,
  mcpToolNames,
  nextId,
  nowIso,
} from "@shiguang/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { forbidden, unauthorized } from "../platform/errors.js";
import type { AppContext } from "../types.js";

interface ToolDef {
  name: McpToolName;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: z.infer<z.ZodTypeAny>, ctx: AppContext) => Promise<unknown>;
}

export function registerMcp(app: FastifyInstance, ctx: AppContext): void {
  const tools: ToolDef[] = [
    {
      name: "search_assets",
      description: "按名称/标签/类型检索工作区中的数字资产（文档、报告、数据、演示等）。",
      inputSchema: mcpToolInputs.searchAssets,
      handler: async (input) => {
        const actor = getActor(ctx);
        const q = input as z.infer<typeof mcpToolInputs.searchAssets>;
        const assets = ctx.store.searchAssets(actor.workspaceId, q.query, 20);
        const scoped = applyScope(assets, q.scope, q.scopeIds);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                scoped.map((a) => ({
                  id: a.id,
                  type: a.type,
                  title: a.title,
                  tags: a.tags,
                  visibility: a.visibility,
                  updatedAt: a.updatedAt,
                  uri: `shiguang://assets/${a.id}`,
                })),
                null,
                2,
              ),
            },
          ],
          structuredContent: {
            assets: scoped.map((a) => ({ id: a.id, type: a.type, title: a.title })),
          },
        };
      },
    },
    {
      name: "read_asset",
      description:
        "读取资产内容；document/report 返回 Markdown，html 返回源码，dataset/presentation 返回结构化 JSON。",
      inputSchema: mcpToolInputs.readAsset,
      handler: async (input) => {
        const actor = getActor(ctx);
        const q = input as z.infer<typeof mcpToolInputs.readAsset>;
        const asset = ctx.store.getAsset(actor.workspaceId, q.assetId);
        if (!asset) {
          return { content: [{ type: "text", text: "资产不存在或无权访问" }], isError: true };
        }
        const content = await ctx.store.readContent(q.assetId, q.versionId);
        const format =
          q.format ??
          (asset.type === "html"
            ? "html"
            : asset.type === "presentation" || asset.type === "dataset"
              ? "json"
              : "markdown");
        let text = content?.text ?? "";
        if (format === "json") {
          text = JSON.stringify(content?.manifest ?? { text: content?.text ?? "" }, null, 2);
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  asset: {
                    id: asset.id,
                    type: asset.type,
                    title: asset.title,
                    tags: asset.tags,
                    visibility: asset.visibility,
                    versionId: asset.currentVersionId,
                    updatedAt: asset.updatedAt,
                  },
                  content: text.slice(0, 100_000),
                  uri: `shiguang://assets/${asset.id}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    },
    {
      name: "search_knowledge",
      description: "在指定知识库中检索相关片段，返回 Source 与原文定位。",
      inputSchema: mcpToolInputs.searchKnowledge,
      handler: async (input) => {
        const actor = getActor(ctx);
        const q = input as z.infer<typeof mcpToolInputs.searchKnowledge>;
        const kb = ctx.store.getKnowledgeBase(actor.workspaceId, q.knowledgeBaseId);
        if (!kb) {
          return { content: [{ type: "text", text: "知识库不存在或无权访问" }], isError: true };
        }
        const results = ctx.store.searchChunks(q.knowledgeBaseId, q.query, q.limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                results.map((r) => ({
                  sourceId: r.chunk.sourceId,
                  sourceTitle: r.source.title,
                  ordinal: r.chunk.ordinal,
                  headingPath: r.chunk.headingPath,
                  excerpt: r.chunk.text.slice(0, 1000),
                  locator: { charStart: r.chunk.charStart, charEnd: r.chunk.charEnd },
                })),
                null,
                2,
              ),
            },
          ],
        };
      },
    },
    {
      name: "create_asset",
      description: "创建新的数字资产（Write 权限）。",
      inputSchema: mcpToolInputs.createAsset,
      handler: async (input) => {
        requireWrite(ctx, "create_asset");
        const actor = getActor(ctx);
        const q = input as z.infer<typeof mcpToolInputs.createAsset>;
        const asset = ctx.store.createAsset(actor, {
          type: q.type as AssetType,
          title: q.title,
          description: q.description,
          tags: q.tags,
          content: q.content
            ? {
                kind: q.type === "html" ? "html" : "markdown",
                text: String(q.content.text ?? q.content.markdown ?? ""),
                manifest: null,
                refs: [],
              }
            : undefined,
        });
        ctx.bus.emit({
          eventId: nextId("evt"),
          eventType: "asset.created",
          schemaVersion: 1,
          occurredAt: nowIso(),
          producer: "mcp",
          tenantId: actor.workspaceId,
          aggregate: { type: "asset", id: asset.id, version: 1 },
          trace: {},
          data: { assetId: asset.id, assetType: asset.type },
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ id: asset.id, uri: `shiguang://assets/${asset.id}` }),
            },
          ],
        };
      },
    },
    {
      name: "update_asset",
      description: "更新资产标题或内容（Write 权限，携带期望版本以检测冲突）。",
      inputSchema: mcpToolInputs.updateAsset,
      handler: async (input) => {
        requireWrite(ctx, "update_asset");
        const actor = getActor(ctx);
        const q = input as z.infer<typeof mcpToolInputs.updateAsset>;
        if (q.content) {
          const asset = ctx.store.getAsset(actor.workspaceId, q.assetId);
          if (!asset) throw unauthorized("资产不存在");
          const saved = ctx.store.saveContent(
            actor,
            q.assetId,
            {
              kind: asset.type === "html" ? "html" : "markdown",
              text: String(q.content.text ?? q.content.markdown ?? ""),
              manifest: null,
              refs: [],
            },
            { expectedLockVersion: q.expectedVersion },
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ id: saved.asset.id, lockVersion: saved.asset.lockVersion }),
              },
            ],
          };
        }
        const updated = ctx.store.updateAssetMeta(
          actor,
          q.assetId,
          {
            title: q.title,
            description: q.description,
          },
          q.expectedVersion,
        );
        return { content: [{ type: "text", text: JSON.stringify(updated ?? {}) }] };
      },
    },
    {
      name: "create_task",
      description: "创建后台任务（Research/导入等，Write 权限）。",
      inputSchema: mcpToolInputs.createTask,
      handler: async (input) => {
        requireWrite(ctx, "create_task");
        const actor = getActor(ctx);
        const q = input as z.infer<typeof mcpToolInputs.createTask>;
        const task = ctx.store.createTask(actor, {
          type: q.type,
          goal: q.goal,
          spec: q.spec ?? {},
        });
        ctx.bus.emit({
          eventId: nextId("evt"),
          eventType: "task.created",
          schemaVersion: 1,
          occurredAt: nowIso(),
          producer: "mcp",
          tenantId: actor.workspaceId,
          aggregate: { type: "task", id: task.id, version: 1 },
          trace: {},
          data: { taskId: task.id, taskType: task.type },
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ id: task.id, status: task.status }) }],
        };
      },
    },
    {
      name: "publish_asset",
      description: "将资产发布为公开/未列出/密码访问的稳定 URL（Write 权限 + 高风险操作）。",
      inputSchema: mcpToolInputs.publishAsset,
      handler: async (input) => {
        requireWrite(ctx, "publish_asset");
        const actor = getActor(ctx);
        const q = input as z.infer<typeof mcpToolInputs.publishAsset>;
        const asset = ctx.store.getAsset(actor.workspaceId, q.assetId);
        if (!asset) throw unauthorized("资产不存在");
        const publish = ctx.store.createPublish(actor, {
          assetId: q.assetId,
          visibility: q.visibility,
          password: null,
          expiresAt: q.expiresAt ?? null,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                publishId: publish.id,
                url: `${ctx.config.publicGatewayBase}/p/${publish.slug}`,
                visibility: publish.visibility,
              }),
            },
          ],
        };
      },
    },
  ];

  /* ---------------- HTTP routing ---------------- */

  app.post("/mcp", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await resolveMcpActor(ctx, req);
    if (!actor) {
      return reply.code(401).send({ code: "UNAUTHORIZED" });
    }
    const body = (req.body ?? {}) as {
      jsonrpc?: string;
      id?: number | string | null;
      method?: string;
      params?: Record<string, unknown>;
    };
    const messageId = body.id ?? null;
    const sessionId =
      takeHeader(req.headers, "mcp-session-id") ?? `mcp_${crypto.randomUUID().replaceAll("-", "")}`;

    try {
      const result = await handleRpc(body.method ?? "", body.params ?? {}, ctx, tools, actor);
      const payload = {
        jsonrpc: "2.0",
        id: messageId,
        ...(body.method === "initialize"
          ? {
              result: {
                protocolVersion: "2025-06-18",
                capabilities: { tools: {} },
                serverInfo: { name: "shiguang-asset-hub", version: "0.0.1" },
              },
            }
          : result),
      };
      sendMcpResponse(reply, payload, sessionId, body.method === "notifications/initialized");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendMcpResponse(
        reply,
        { jsonrpc: "2.0", id: messageId, error: { code: -32000, message } },
        sessionId,
        false,
      );
    }
  });

  app.get("/mcp", async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = await resolveMcpActor(ctx, req);
    if (!actor) {
      return reply.code(401).send({ code: "UNAUTHORIZED" });
    }
    const accept = String(req.headers.accept ?? "");
    if (!accept.includes("text/event-stream")) {
      return reply.code(406).send({ code: "NOT_ACCEPTABLE" });
    }
    reply.raw.setHeader("content-type", "text/event-stream");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");
    reply.raw.setHeader("x-accel-buffering", "no");
    reply.raw.flushHeaders?.();
    const keepAlive = setInterval(() => reply.raw.write(": keep-alive\n\n"), 15_000);
    reply.raw.on("close", () => clearInterval(keepAlive));
  });

  app.delete("/mcp", async (_req, reply) => reply.code(200).send());
}

/* ---------------- protocol helpers ---------------- */

async function handleRpc(
  method: string,
  params: Record<string, unknown>,
  ctx: AppContext,
  tools: ToolDef[],
  actor: ActorContext,
): Promise<Record<string, unknown>> {
  switch (method) {
    case "initialize":
      ctx.actor = actor;
      return {};
    case "notifications/initialized":
      return { result: null as unknown as Record<string, unknown> };
    case "ping":
      return { result: {} };
    case "tools/list": {
      return {
        result: {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: zodToJsonSchema(t.inputSchema),
          })),
        },
      };
    }
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const tool = tools.find((t) => t.name === name);
      if (!tool) {
        return { error: { code: -32602, message: `Unknown tool: ${name}` } };
      }
      ctx.actor = actor;
      const parsed = tool.inputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          error: { code: -32602, message: `Invalid arguments: ${parsed.error.message}` },
        };
      }
      const output = await tool.handler(parsed.data, ctx);
      return { result: output as Record<string, unknown> };
    }
    default:
      return { error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

function sendMcpResponse(
  reply: FastifyReply,
  payload: Record<string, unknown>,
  sessionId: string,
  notification: boolean,
): void {
  reply.header("mcp-session-id", sessionId);
  if (notification) {
    return void reply.code(202).send();
  }
  const accept = String(reply.request.headers.accept ?? "");
  if (accept.includes("text/event-stream")) {
    reply.raw.setHeader("content-type", "text/event-stream");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");
    reply.raw.setHeader("x-accel-buffering", "no");
    reply.raw.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
    reply.raw.end();
  } else {
    reply.header("content-type", "application/json");
    reply.send(payload);
  }
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const shape = (schema as { shape?: Record<string, z.ZodTypeAny> }).shape;
  if (!shape) return { type: "object", properties: {} };
  const properties: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(shape)) {
    properties[key] = describeZod(field);
  }
  return { type: "object", properties };
}

function describeZod(field: unknown): Record<string, unknown> {
  const f = field as z.ZodTypeAny;
  const description: Record<string, unknown> = {};
  if (f instanceof z.ZodString) description.type = "string";
  else if (f instanceof z.ZodNumber) description.type = "number";
  else if (f instanceof z.ZodBoolean) description.type = "boolean";
  else if (f instanceof z.ZodArray) {
    description.type = "array";
    description.items = describeZod(f.element);
  } else if (f instanceof z.ZodEnum) {
    description.type = "string";
    description.enum = f.options;
  } else if (f instanceof z.ZodOptional || f instanceof z.ZodDefault) {
    const inner =
      (f as { unwrap?: () => unknown }).unwrap?.() ?? (f as { innerType?: unknown }).innerType;
    if (inner && inner !== f) {
      return describeZod(inner);
    }
    description.type = "unknown";
  } else if (f instanceof z.ZodObject) {
    description.type = "object";
    const nested = (f as { shape?: Record<string, z.ZodTypeAny> }).shape;
    if (nested) {
      description.properties = Object.fromEntries(
        Object.entries(nested).map(([k, v]) => [k, describeZod(v)]),
      );
    }
  }
  if (f.description) description.description = f.description;
  return description;
}

async function resolveMcpActor(ctx: AppContext, req: FastifyRequest): Promise<ActorContext | null> {
  try {
    const actor = await ctx.identity.resolve(
      req.headers as Record<string, string | string[] | undefined>,
    );
    const config = ctx.store.getMcpConfig(actor.workspaceId);
    if (!config?.enabled) return null;
    ctx.actor = actor;
    ctx.mcpConfig = config;
    return actor;
  } catch {
    return null;
  }
}

function requireWrite(ctx: AppContext, tool: string): void {
  if (!ctx.mcpConfig?.writeEnabled) {
    throw forbidden("MCP Write 权限未开启，请先在设置中确认开启后再使用写工具");
  }
  const actor = getActor(ctx);
  ctx.identity.requireWrite(actor);
  ctx.store.audit(actor.workspaceId, actor.subject, `mcp.${tool}`, "mcp", "success", {});
}

function applyScope(
  assets: Asset[],
  scope?: "all" | "knowledge_bases" | "assets",
  scopeIds?: string[],
): Asset[] {
  if (!scope || scope === "all") return assets;
  if (scopeIds && scopeIds.length > 0) {
    return assets.filter((a) => scopeIds.includes(a.id));
  }
  return [];
}

function getActor(ctx: AppContext): ActorContext {
  if (!ctx.actor) {
    throw unauthorized("MCP 会话未初始化");
  }
  return ctx.actor;
}

function takeHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export const mcpToolNameList: readonly string[] = mcpToolNames;
