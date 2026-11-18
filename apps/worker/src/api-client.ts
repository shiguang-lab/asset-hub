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
    checkpoint?: Record<string, unknown>;
    stream?: {
      phase: string;
      activity: "content" | "reasoning" | "heartbeat" | "finished" | "failed";
      delta?: string;
      receivedChars?: number;
      finishReason?: string | null;
      usage?: { inputTokens: number; outputTokens: number };
    };
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

  async getInternal<T>(path: string): Promise<T> {
    const res = await fetch(`${this.config.apiBase}${path}`, {
      headers: { "x-internal-token": this.config.workerToken },
    });
    if (!res.ok) throw new Error(`api ${res.status} ${path}`);
    return (await res.json()) as T;
  }

  async postInternal<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(path, { method: "POST", body: JSON.stringify(body) });
  }

  async getTaskState(taskId: string): Promise<{
    status: string;
    cancelRequested: boolean;
    progress: number;
    checkpoint: Record<string, unknown> | null;
  }> {
    return this.getInternal(`/internal/v1/tasks/${encodeURIComponent(taskId)}/state`);
  }

  async listPendingThumbnails(limit = 8): Promise<
    Array<{
      id: string;
      workspaceId: string;
      type: string;
      title: string;
      currentVersionId: string;
    }>
  > {
    const res = await this.getInternal<{
      items: Array<{
        id: string;
        workspaceId: string;
        type: string;
        title: string;
        currentVersionId: string;
      }>;
    }>(`/internal/v1/thumbnails/pending?limit=${limit}`);
    return res.items;
  }

  async getThumbnailSource(assetId: string): Promise<{
    id: string;
    workspaceId: string;
    type: string;
    title: string;
    currentVersionId: string;
    hasCurrentThumbnail: boolean;
    content: {
      kind: string;
      text?: string | null;
      manifest?: Record<string, unknown> | null;
    } | null;
  } | null> {
    const res = await fetch(
      `${this.config.apiBase}/internal/v1/assets/${encodeURIComponent(assetId)}/thumbnail-source`,
      {
        headers: { "x-internal-token": this.config.workerToken },
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`api ${res.status} thumbnail-source`);
    return (await res.json()) as {
      id: string;
      workspaceId: string;
      type: string;
      title: string;
      currentVersionId: string;
      hasCurrentThumbnail: boolean;
      content: {
        kind: string;
        text?: string | null;
        manifest?: Record<string, unknown> | null;
      } | null;
    };
  }

  async fetchInternalAssetBlob(
    assetId: string,
  ): Promise<{ body: Buffer; contentType: string } | null> {
    const res = await fetch(
      `${this.config.apiBase}/internal/v1/assets/${encodeURIComponent(assetId)}/blob`,
      {
        headers: { "x-internal-token": this.config.workerToken },
      },
    );
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return {
      body: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async uploadThumbnail(
    assetId: string,
    versionId: string,
    data: Buffer,
    mediaType: "image/jpeg" | "image/webp" | "image/png" = "image/jpeg",
  ): Promise<{ ok: boolean; thumbnailRef: string }> {
    return this.postInternal(`/internal/v1/assets/${encodeURIComponent(assetId)}/thumbnail`, {
      versionId,
      mediaType,
      dataBase64: data.toString("base64"),
    });
  }
}
