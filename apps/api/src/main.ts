import { loadServiceConfig } from "@shiguang/config";
import { buildApp } from "./bootstrap/app.js";

const config = loadServiceConfig(3001, "api");
const app = buildApp(config);

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
