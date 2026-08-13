import { loadServiceConfig } from "@shiguang/config";
import { serviceHealthSchema } from "@shiguang/contracts";
import Fastify from "fastify";

const config = loadServiceConfig(3001);
const app = Fastify({ logger: true });

app.get("/healthz", async () =>
  serviceHealthSchema.parse({ service: "api", status: "ok", timestamp: new Date().toISOString() }),
);

await app.listen({ host: config.host, port: config.port });
