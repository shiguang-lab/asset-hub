import pino from "pino";

export function createLogger(service: string) {
  return pino({ name: service });
}
