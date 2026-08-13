import type { WorkerConfig } from "@shiguang/config";
import type { Logger } from "@shiguang/observability";

interface OutboxEvent {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

export class ApiClient {
  constructor(
    private readonly config: WorkerConfig,
    private readonly logger: Logger,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.apiBase}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-internal-token": this.config.workerToken,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`api ${res.status} ${path}: ${body.slice(0, 300)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async claimOutbox(limit = 5): Promise<OutboxEvent[]> {
    const res = await this.request<{ events: OutboxEvent[] }>("/internal/v1/outbox/claim", {
      method: "POST",
      body: JSON.stringify({ limit }),
    });
    return res.events;
  }

  async ackOutbox(eventId: string): Promise<void> {
    await this.request(`/internal/v1/outbox/${eventId}/ack`, { method: "POST", body: "{}" });
  }

  async nackOutbox(eventId: string): Promise<void> {
    await this.request(`/internal/v1/outbox/${eventId}/nack`, { method: "POST", body: "{}" });
  }

  async reportProgress(input: {
    taskId: string;
    runId: string;
    sequence: number;
    status?: string;
    progress?: number;
    stepId?: string;
    stepStatus?: string;
    detail?: string;
  }): Promise<void> {
    try {
      await this.request("/internal/v1/progress", {
        method: "POST",
        body: JSON.stringify(input),
      });
    } catch (err) {
      this.logger.warn({ taskId: input.taskId, err: String(err) }, "progress report failed");
    }
  }

  async projectResult(
    input: Record<string, unknown>,
  ): Promise<{ ok: boolean; replayed?: boolean }> {
    return this.request("/internal/v1/task-results:project", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async postComputeResults(input: Record<string, unknown>): Promise<{ ok: boolean }> {
    return this.request("/internal/v1/compute/results", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
