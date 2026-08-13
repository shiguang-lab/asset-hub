import { loadObjectStoreConfig, loadWorkerConfig } from "@shiguang/config";
import { createObjectStore } from "@shiguang/database";
import { createLogger } from "@shiguang/observability";
import { ApiClient } from "./api-client.js";
import { Executor } from "./executor.js";
import { WorkerState } from "./state.js";

const config = loadWorkerConfig();
const logger = createLogger("worker", "info");
const state = new WorkerState(config.statePath);
const storage = createObjectStore(loadObjectStoreConfig("worker").rootDir);
const api = new ApiClient(config, logger);
const executor = new Executor(api, state, storage, logger, config.maxConcurrent);

logger.info(
  { profiles: config.profiles, api: config.apiBase, pollMs: config.pollIntervalMs },
  "worker ready",
);

const timer = setInterval(() => {
  void executor.poll();
}, config.pollIntervalMs);
void executor.poll();

const shutdown = async () => {
  executor.stop();
  clearInterval(timer);
  state.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
