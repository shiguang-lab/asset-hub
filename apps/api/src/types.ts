import type { AiService } from "@shiguang/ai-core";
import type { ServiceConfig } from "@shiguang/config";
import type { ActorContext, McpConfig } from "@shiguang/contracts";
import type { ObjectStore, Store } from "@shiguang/database";
import type { Logger } from "@shiguang/observability";
import type { EventBus } from "./platform/events.js";
import type { IdentityService } from "./platform/identity.js";
import type { SseHub } from "./platform/sse.js";

export interface AppContext {
  config: ServiceConfig;
  store: Store;
  storage: ObjectStore;
  sse: SseHub;
  bus: EventBus;
  identity: IdentityService;
  logger: Logger;
  ai: AiService;
  actor?: ActorContext;
  mcpConfig?: McpConfig;
  mcpServer?: unknown;
}

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    actor: ActorContext;
    idempotencyKey?: string;
  }
}

export type { ObjectStore, Store };
