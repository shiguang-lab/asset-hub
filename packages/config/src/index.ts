import { z } from "zod";

const hostSchema = z.string().min(1).default("0.0.0.0");

export function loadServiceConfig(defaultPort: number) {
  return z
    .object({
      host: hostSchema,
      port: z.coerce.number().int().min(1).max(65535),
    })
    .parse({
      host: process.env.HOST,
      port: process.env.PORT ?? defaultPort,
    });
}

export function installShutdownHandlers(service: string): void {
  const shutdown = (signal: NodeJS.Signals) => {
    console.info(`${service} received ${signal}`);
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
