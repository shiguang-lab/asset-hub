import type { Logger } from "@shiguang/observability";
import type { FastifyReply } from "fastify";

interface Subscriber {
  workspaceId: string;
  reply: FastifyReply;
  lastEventId: string;
  closed: boolean;
}

export class SseHub {
  private subscribers = new Map<string, Subscriber>();
  private readonly heartbeats = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly logger: Logger,
    private readonly heartbeatMs = 15_000,
  ) {}

  subscribe(workspaceId: string, reply: FastifyReply): void {
    reply.raw.setHeader("content-type", "text/event-stream");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");
    reply.raw.setHeader("x-accel-buffering", "no");
    reply.raw.flushHeaders?.();

    const key = `${workspaceId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const subscriber: Subscriber = { workspaceId, reply, lastEventId: "", closed: false };
    this.subscribers.set(key, subscriber);

    const heartbeat = setInterval(() => {
      if (subscriber.closed) {
        clearInterval(heartbeat);
        return;
      }
      reply.raw.write(`: ping\n\n`);
    }, this.heartbeatMs);
    this.heartbeats.set(key, heartbeat);

    const onClose = () => {
      subscriber.closed = true;
      clearInterval(heartbeat);
      this.heartbeats.delete(key);
      this.subscribers.delete(key);
    };
    reply.raw.on("close", onClose);
    this.logger.debug({ workspaceId, clients: this.subscribers.size }, "sse subscribed");
  }

  broadcast(
    workspaceId: string,
    event: { id: string; event: string; data: Record<string, unknown> },
  ): void {
    const payload = `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.workspaceId === workspaceId && !subscriber.closed) {
        subscriber.lastEventId = event.id;
        subscriber.reply.raw.write(payload);
      }
    }
  }

  close(): void {
    for (const timer of this.heartbeats.values()) clearInterval(timer);
    this.heartbeats.clear();
    for (const subscriber of this.subscribers.values()) {
      subscriber.closed = true;
      subscriber.reply.raw.end();
    }
    this.subscribers.clear();
  }
}
