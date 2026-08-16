import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { loadServiceConfig } from "@shiguang/config";
import { buildApp } from "./bootstrap/app.js";

// Load repo-root `.env` so local `pnpm dev` picks up the shared NAS services.
const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
if (existsSync(envPath)) {
  try {
    loadEnvFile(envPath);
  } catch (err) {
    console.warn(`[api] failed to load ${envPath}:`, err);
  }
}

const config = loadServiceConfig(3001, "api");
const app = await buildApp(config);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
