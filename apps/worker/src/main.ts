import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { loadHatchetConfig, loadObjectStoreConfig, loadWorkerConfig } from "@shiguang/config";
import { createObjectStore } from "@shiguang/database";
import { ASSET_HUB_SUBJECT_PREFIX, NatsChannel } from "@shiguang/event-channel";
import { createLogger } from "@shiguang/observability";
import { ApiClient } from "./api-client.js";
import { Executor } from "./executor.js";
import { HatchetRelay, HatchetRuntime } from "./hatchet.js";
import { Scheduler } from "./scheduler.js";
import { WorkerState } from "./state.js";
import { ThumbnailService } from "./thumbnail-service.js";

// Load the repo-root `.env` for local development (no-op when absent) so that
// optional integrations such as Hatchet can be configured without exporting
// variables into the shell manually.
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
if (existsSync(envPath)) {
  try {
    loadEnvFile(envPath);
  } catch (err) {
    console.warn(`[worker] failed to load ${envPath}:`, err);
  }
}

const config = loadWorkerConfig();
const logger = createLogger("worker", "info");
const state = new WorkerState(config.statePath);
const storage = createObjectStore(loadObjectStoreConfig("worker"));
const api = new ApiClient(config, logger);
const scheduler = new Scheduler(api, logger);
const thumbnails = new ThumbnailService(config, api, logger);

const hatchetConfig = loadHatchetConfig();
const hatchetRuntime = new HatchetRuntime(hatchetConfig, api, storage, logger);
const nats = new NatsChannel();

let stopExecutor: (() => void) | null = null;

async function start(): Promise<void> {
  if (process.env.NATS_URL) {
    try {
      await nats.connect(process.env.NATS_URL);
      nats.subscribe(`${ASSET_HUB_SUBJECT_PREFIX}.>`, async (event) => {
        logger.info({ event }, "worker received domain event via NATS");
        const envelope = event as { eventType?: string; data?: Record<string, unknown> };
        if (
          envelope.eventType === "asset.created" ||
          envelope.eventType === "asset.version.created"
        ) {
          const assetId = typeof envelope.data?.assetId === "string" ? envelope.data.assetId : "";
          if (assetId) {
            thumbnails.enqueue(assetId, envelope.eventType === "asset.version.created" ? 800 : 0);
          }
        }
      });
      logger.info({ url: process.env.NATS_URL }, "worker connected to NATS");
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "NATS connect failed");
    }
  }

  const hatchetStarted = await hatchetRuntime.start();
  if (hatchetStarted) {
    logger.info(
      { worker: hatchetConfig.workerName },
      "worker using shared Hatchet durable execution",
    );
    const relay = new HatchetRelay(
      hatchetRuntime,
      api,
      state,
      logger,
      config.pollIntervalMs,
      thumbnails,
    );
    relay.start();
    stopExecutor = () => relay.stop();
  } else {
    const executor = new Executor(api, state, storage, logger, config.maxConcurrent, thumbnails);
    const timer = setInterval(() => {
      void executor.poll();
    }, config.pollIntervalMs);
    void executor.poll();
    stopExecutor = () => {
      executor.stop();
      clearInterval(timer);
    };
  }
  scheduler.start();
  thumbnails.start();
  logger.info(
    {
      profiles: config.profiles,
      api: config.apiBase,
      web: config.webBase,
      pollMs: config.pollIntervalMs,
    },
    "worker ready",
  );
}

const shutdown = () => {
  stopExecutor?.();
  scheduler.stop();
  thumbnails.stop();
  void nats.close();
  state.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

void start();
