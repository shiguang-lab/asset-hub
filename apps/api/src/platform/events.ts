import type { EventEnvelope, OutboxEvent } from "@shiguang/contracts";
import type { Store } from "@shiguang/database";
import { eventSubject, type NatsChannel } from "@shiguang/event-channel";
import type { Logger } from "@shiguang/observability";
import type { SseHub } from "./sse.js";

export interface EventBus {
  emit(envelope: EventEnvelope): Promise<OutboxEvent>;
  notify(
    workspaceId: string,
    subject: string,
    input: {
      type:
        | "task_completed"
        | "task_partial"
        | "task_failed"
        | "knowledge_indexed"
        | "knowledge_failed"
        | "share"
        | "publish"
        | "billing"
        | "system";
      title: string;
      body?: string | undefined;
      link?: string | null | undefined;
    },
  ): Promise<void>;
}

export function createEventBus(
  store: Store,
  sse: SseHub,
  logger: Logger,
  nats?: NatsChannel,
): EventBus {
  return {
    async emit(envelope: EventEnvelope): Promise<OutboxEvent> {
      const event = await store.appendOutbox({
        eventType: envelope.eventType,
        aggregateType: envelope.aggregate.type,
        aggregateId: envelope.aggregate.id,
        aggregateVersion: envelope.aggregate.version,
        workspaceId: envelope.tenantId,
        data: envelope.data,
      });
      const sseEventName = sseEventFor(envelope.eventType);
      if (sseEventName) {
        sse.broadcast(envelope.tenantId, {
          id: event.id,
          event: sseEventName,
          data: { ...envelope.data, aggregateId: envelope.aggregate.id },
        });
      }
      if (nats?.connected) {
        nats.publish(eventSubject(envelope.eventType), {
          eventId: event.id,
          eventType: envelope.eventType,
          aggregate: envelope.aggregate,
          tenantId: envelope.tenantId,
          occurredAt: envelope.occurredAt,
          data: envelope.data,
        });
      }
      logger.debug({ eventType: envelope.eventType, eventId: event.id }, "event emitted");
      return event;
    },
    async notify(workspaceId, subject, input): Promise<void> {
      const notification = await store.createNotification({
        workspaceId,
        subject,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
      });
      sse.broadcast(workspaceId, {
        id: notification.id,
        event: "notification.created",
        data: {
          notificationId: notification.id,
          title: notification.title,
          link: notification.link,
        },
      });
      if (nats?.connected) {
        nats.publish(eventSubject("notification.created"), {
          notificationId: notification.id,
          workspaceId,
          subject,
          type: input.type,
          title: input.title,
        });
      }
    },
  };
}

function sseEventFor(
  eventType: string,
):
  | "task.updated"
  | "task.completed"
  | "notification.created"
  | "knowledge.updated"
  | "asset.updated"
  | "credit.updated"
  | null {
  if (eventType.startsWith("task.completed")) return "task.completed";
  if (eventType.startsWith("task.")) return "task.updated";
  if (eventType.startsWith("knowledge.")) return "knowledge.updated";
  if (eventType.startsWith("asset.")) return "asset.updated";
  if (eventType.startsWith("credit.")) return "credit.updated";
  if (eventType === "notification.created") return "notification.created";
  return null;
}
