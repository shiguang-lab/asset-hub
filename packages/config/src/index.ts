import { z } from "zod";

const hostSchema = z.string().min(1).default("0.0.0.0");

export interface ServiceConfig {
  host: string;
  port: number;
  name: string;
  env: "development" | "test" | "production";
  dataDir: string;
  publicApiBase: string;
  publicGatewayBase: string;
  webBase: string;
  devAuth: boolean;
  logLevel: string;
}

function loadCommon(name: string, defaultPort: number): Omit<ServiceConfig, "dataDir"> {
  const common = z
    .object({
      host: hostSchema,
      port: z.coerce.number().int().min(1).max(65535),
      env: z.enum(["development", "test", "production"]).default("development"),
      publicApiBase: z.string().default(`http://localhost:${defaultPort}`),
      publicGatewayBase: z.string().default("http://localhost:3004"),
      webBase: z.string().default("http://localhost:3000"),
      devAuth: z.coerce.boolean().default(true),
      logLevel: z.string().default("info"),
    })
    .parse({
      host: process.env.HOST,
      port: process.env.PORT ?? defaultPort,
      env: process.env.NODE_ENV,
      publicApiBase: process.env.PUBLIC_API_BASE ?? `http://localhost:${defaultPort}`,
      publicGatewayBase: process.env.PUBLIC_GATEWAY_BASE,
      webBase: process.env.WEB_BASE,
      devAuth: process.env.DEV_AUTH,
      logLevel: process.env.LOG_LEVEL,
    });
  return { ...common, name };
}

export function loadServiceConfig(defaultPort: number, name = "service"): ServiceConfig {
  const common = loadCommon(name, defaultPort);
  const dataDir =
    process.env.DATA_DIR ??
    (common.env === "production" ? `/var/lib/shiguang/${name}` : `${process.cwd()}/.data`);
  return { ...common, name, dataDir };
}

export interface DatabaseConfig {
  path: string;
  seedDemo: boolean;
  demoSubject: string;
  demoWorkspaceName: string;
}

export function loadDatabaseConfig(): DatabaseConfig {
  return {
    path: process.env.DATABASE_PATH ?? `${process.cwd()}/.data/shiguang.db`,
    seedDemo: (process.env.SEED_DEMO ?? "true") === "true",
    demoSubject: process.env.DEMO_SUBJECT ?? "dev-user",
    demoWorkspaceName: process.env.DEMO_WORKSPACE_NAME ?? "个人空间",
  };
}

export interface ObjectStoreConfig {
  rootDir: string;
  endpoint: string | null;
  bucket: string;
  region: string;
  accessKey: string | null;
  secretKey: string | null;
}

export function loadObjectStoreConfig(_serviceName = "api"): ObjectStoreConfig {
  const rootDir = process.env.OBJECT_STORE_DIR ?? `${process.cwd()}/.data/objects`;
  return {
    rootDir,
    endpoint: process.env.S3_ENDPOINT ?? null,
    bucket: process.env.S3_BUCKET ?? "asset-hub",
    region: process.env.S3_REGION ?? "us-east-1",
    accessKey: process.env.S3_ACCESS_KEY ?? null,
    secretKey: process.env.S3_SECRET_KEY ?? null,
  };
}

export interface ModelGatewayConfig {
  baseUrl: string | null;
  apiKey: string | null;
  timeoutMs: number;
  model: string;
}

export function loadModelGatewayConfig(): ModelGatewayConfig {
  return {
    baseUrl: process.env.MODEL_GATEWAY_URL ?? null,
    apiKey: process.env.MODEL_GATEWAY_API_KEY ?? null,
    timeoutMs: Number(process.env.MODEL_GATEWAY_TIMEOUT_MS ?? 120_000),
    model: process.env.MODEL_GATEWAY_MODEL ?? "gpt-4o-mini",
  };
}

export interface WorkerConfig {
  apiBase: string;
  workerToken: string;
  pollIntervalMs: number;
  maxConcurrent: number;
  profiles: string[];
  statePath: string;
}

export function loadWorkerConfig(): WorkerConfig {
  return {
    apiBase: process.env.API_INTERNAL_BASE ?? "http://localhost:3001",
    workerToken: process.env.WORKER_TOKEN ?? "dev-worker-token",
    pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 1500),
    maxConcurrent: Number(process.env.WORKER_MAX_CONCURRENT ?? 4),
    profiles: (process.env.WORKER_PROFILE ?? "all").split(","),
    statePath: process.env.WORKER_STATE_PATH ?? `${process.cwd()}/.data/worker-state.db`,
  };
}

export interface ComputeConfig {
  port: number;
  apiBase: string;
  computeToken: string;
  tempDir: string;
  maxRows: number;
  maxColumns: number;
  maxQueryMs: number;
}

export function loadComputeConfig(): ComputeConfig {
  return {
    port: Number(process.env.COMPUTE_PORT ?? 3002),
    apiBase: process.env.API_INTERNAL_BASE ?? "http://localhost:3001",
    computeToken: process.env.COMPUTE_TOKEN ?? "dev-compute-token",
    tempDir: process.env.COMPUTE_TEMP_DIR ?? `${process.cwd()}/.data/compute-tmp`,
    maxRows: Number(process.env.COMPUTE_MAX_ROWS ?? 1_000_000),
    maxColumns: Number(process.env.COMPUTE_MAX_COLUMNS ?? 200),
    maxQueryMs: Number(process.env.COMPUTE_MAX_QUERY_MS ?? 10_000),
  };
}

export interface PublicGatewayConfig {
  port: number;
  apiBase: string;
  gatewayToken: string;
  objectRoot: string;
  allowInsecure: boolean;
}

export function loadPublicGatewayConfig(): PublicGatewayConfig {
  return {
    port: Number(process.env.PORT ?? 3004),
    apiBase: process.env.API_INTERNAL_BASE ?? "http://localhost:3001",
    gatewayToken: process.env.PUBLIC_GATEWAY_TOKEN ?? "dev-gateway-token",
    objectRoot: process.env.OBJECT_STORE_DIR ?? `${process.cwd()}/.data/objects`,
    allowInsecure: (process.env.PUBLIC_GATEWAY_INSECURE ?? "true") === "true",
  };
}

export function installShutdownHandlers(service: string): void {
  const shutdown = (signal: NodeJS.Signals) => {
    console.info(`${service} received ${signal}`);
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
