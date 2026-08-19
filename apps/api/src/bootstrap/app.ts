import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { createAiService } from "@shiguang/ai-core";
import { loadDatabaseConfig, loadObjectStoreConfig, type ServiceConfig } from "@shiguang/config";
import { createObjectStore, createStore, openDatabase } from "@shiguang/database";
import { NatsChannel } from "@shiguang/event-channel";
import { createLogger } from "@shiguang/observability";
import Fastify, { type FastifyInstance } from "fastify";
import { registerInternalRoutes } from "../internal/routes.js";
import { registerMcp } from "../mcp/server.js";
import { registerModules } from "../modules/index.js";
import { enforceRequestAuthorization, requiresWorkspaceWrite } from "../platform/authorization.js";
import { toProblem } from "../platform/errors.js";
import { createEventBus } from "../platform/events.js";
import { IdentityService } from "../platform/identity.js";
import { SgIdentityVerifier } from "../platform/sg-identity.js";
import { SseHub } from "../platform/sse.js";
import type { AppContext } from "../types.js";

export async function buildApp(config: ServiceConfig): Promise<FastifyInstance> {
  const logger = createLogger("api", config.logLevel);
  const app = Fastify({
    logger: { level: config.logLevel, name: "api" },
    bodyLimit: 64 * 1024 * 1024,
    requestTimeout: 60_000,
  });

  void app.register(cors, {
    origin: true,
    credentials: true,
    exposedHeaders: ["etag", "x-request-id"],
  });
  void app.register(multipart, {
    // Directory imports arrive as one multipart part per file. Keep the per-file
    // limit while allowing a reasonably sized documentation tree.
    preservePath: true,
    limits: { fileSize: 50 * 1024 * 1024, files: 2_000 },
  });

  const dbConfig = loadDatabaseConfig();
  // Storage is created before the DB so the demo-data seed can persist content blobs.
  const storage = createObjectStore(loadObjectStoreConfig("api"));
  const db = await openDatabase({
    url: dbConfig.url,
    seedDemo: config.env !== "test" && dbConfig.seedDemo,
    demoSubject: dbConfig.demoSubject,
    demoWorkspaceName: dbConfig.demoWorkspaceName,
    storage,
  });
  const store = createStore(db, storage);
  const sse = new SseHub(logger);
  const verifier = new SgIdentityVerifier({
    issuer: process.env.SG_IDENTITY_ISSUER ?? "https://shiguanglab.com",
    audience: process.env.SG_IDENTITY_AUDIENCE ?? "asset-hub-api",
    entitlement: process.env.SG_IDENTITY_ENTITLEMENT ?? "asset-hub:access",
    jwksUrl:
      process.env.SG_IDENTITY_JWKS_URL ??
      "https://shiguanglab.com/.well-known/sg-identity-jwks.json",
    jwksFile: process.env.SG_IDENTITY_JWKS_FILE,
  });
  const identity = new IdentityService(store, {
    devAuth: config.devAuth,
    demoSubject: dbConfig.demoSubject,
    verifyAssertion: (token) => verifier.verify(token),
  });
  const nats = new NatsChannel();
  if (process.env.NATS_URL) {
    try {
      await nats.connect(process.env.NATS_URL);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "NATS connect failed");
    }
  }
  const bus = createEventBus(store, sse, logger, nats);
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
    if (bypassesBrowserIdentity(req.url)) return;
    req.actor = await identity.resolve(req.headers as Record<string, string | undefined>);
    req.idempotencyKey = takeHeader(req.headers, "idempotency-key");
    if (req.url.startsWith("/api/v1/") && requiresWorkspaceWrite(req)) {
      identity.requireWrite(req.actor);
    }
    await enforceRequestAuthorization(ctx, req);
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
    await nats.close();
    await db.pool.end();
  });

  return app;
}

export function bypassesBrowserIdentity(url: string): boolean {
  const path = url.split("?", 1)[0] ?? url;
  return path === "/healthz" || path.startsWith("/internal/");
}

function takeHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}
