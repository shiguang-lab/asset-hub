import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { createAiService } from "@shiguang/ai-core";
import { loadDatabaseConfig, loadObjectStoreConfig, type ServiceConfig } from "@shiguang/config";
import { createObjectStore, createStore, openDatabase } from "@shiguang/database";
import { createLogger } from "@shiguang/observability";
import Fastify, { type FastifyInstance } from "fastify";
import { registerInternalRoutes } from "../internal/routes.js";
import { registerMcp } from "../mcp/server.js";
import { registerModules } from "../modules/index.js";
import { toProblem } from "../platform/errors.js";
import { createEventBus } from "../platform/events.js";
import { IdentityService } from "../platform/identity.js";
import { SseHub } from "../platform/sse.js";
import type { AppContext } from "../types.js";

export function buildApp(config: ServiceConfig): FastifyInstance {
  const logger = createLogger("api", config.logLevel);
  const app = Fastify({
    logger: { level: config.logLevel, name: "api" },
    bodyLimit: 16 * 1024 * 1024,
    requestTimeout: 60_000,
  });

  void app.register(cors, {
    origin: true,
    credentials: true,
    exposedHeaders: ["etag", "x-request-id"],
  });
  void app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  const dbConfig = loadDatabaseConfig();
  const db = openDatabase({
    path: dbConfig.path,
    seedDemo: config.env !== "test",
    demoSubject: dbConfig.demoSubject,
    demoWorkspaceName: dbConfig.demoWorkspaceName,
  });
  const storage = createObjectStore(loadObjectStoreConfig("api").rootDir);
  const store = createStore(db, storage);
  const sse = new SseHub(logger);
  const identity = new IdentityService(store, {
    devAuth: config.devAuth,
    demoSubject: dbConfig.demoSubject,
  });
  const bus = createEventBus(store, sse, logger);
  const ai = createAiService({ quality: "balanced" });
  const ctx: AppContext = {
    config,
    store,
    storage,
    sse,
    bus,
    identity,
    logger,
    ai,
  };
  app.decorate("ctx", ctx);

  app.addHook("onRequest", async (req) => {
    req.actor = await identity.resolve(req.headers as Record<string, string | undefined>);
    req.idempotencyKey = takeHeader(req.headers, "idempotency-key");
  });

  app.addHook("onSend", async (req, reply, payload) => {
    if (req.actor?.requestId && !reply.hasHeader("x-request-id")) {
      reply.header("x-request-id", req.actor.requestId);
    }
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, "request failed");
    const fastifyErr = err as {
      validation?: Array<{ instancePath?: string; path?: string; message: string }>;
    };
    if (fastifyErr.validation) {
      const fields: Record<string, string[]> = {};
      for (const issue of fastifyErr.validation) {
        const key = String(issue.instancePath ?? issue.path ?? "body");
        fields[key] = [...(fields[key] ?? []), issue.message];
      }
      reply
        .status(400)
        .header("content-type", "application/problem+json")
        .send(
          toProblem(
            {
              message: "请求参数不合法",
              code: "VALIDATION_ERROR",
              status: 400,
              recoveries: [],
              fields,
            } as unknown as Error & {
              status: number;
              code: string;
              recoveries: string[];
              fields: Record<string, string[]>;
            },
            req.actor?.requestId,
          ),
        );
      return;
    }
    const problem = toProblem(err, req.actor?.requestId);
    reply.status(problem.status).header("content-type", "application/problem+json").send(problem);
  });

  app.get("/healthz", async () => ({
    service: "api",
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.0.0",
    checks: { database: "ok", storage: "ok" },
  }));

  app.get("/api/v1/events", async (req, reply) => {
    const lastEventId = takeHeader(req.headers, "last-event-id");
    reply.raw.setHeader("content-type", "text/event-stream");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");
    reply.raw.flushHeaders?.();
    if (lastEventId) {
      reply.raw.write(`id: ${lastEventId}\nevent: ping\ndata: {"resume":true}\n\n`);
    } else {
      reply.raw.write(`event: ping\ndata: {"connected":true}\n\n`);
    }
    ctx.sse.subscribe(req.actor.workspaceId, reply);
  });

  registerInternalRoutes(app);
  registerModules(app);
  registerMcp(app, ctx);

  app.addHook("onClose", async () => {
    sse.close();
    db.close();
  });

  return app;
}

function takeHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}
