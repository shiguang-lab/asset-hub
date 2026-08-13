import pino, { type Logger } from "pino";

export type { Logger };

export function createLogger(service: string, level?: string): Logger {
  return pino({
    name: service,
    level: level ?? process.env.LOG_LEVEL ?? "info",
    base: { service },
  });
}

export function createRequestId(): string {
  return `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function traceFromRequestId(requestId: string): string {
  return `00-${requestId.replace("req_", "").padEnd(32, "0")}-0000000000000001-01`;
}

export type { Logger as PinoLogger } from "pino";
