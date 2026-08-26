import { HatchetClient, type JsonObject } from "@hatchet-dev/typescript-sdk";
import type { HatchetConfig } from "@shiguang/config";
import type { ObjectStore } from "@shiguang/database";
import type { Logger } from "@shiguang/observability";
import type { ApiClient } from "./api-client.js";
import type { WorkerState } from "./state.js";
import { runTaskWorkflow } from "./workflows/dispatch.js";
import type { StepContext } from "./workflows/helpers.js";
import { runKnowledgeWorkflow } from "./workflows/knowledge.js";

interface OutboxEvent {
  id: string;
  eventType: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

interface TaskEnqueue {
  taskId: string;
  taskType: string;
  spec: Record<string, unknown>;
  outboxEventId: string;
}

interface KnowledgeEnqueue {
  sourceId: string;
  kbId: string;
  outboxEventId: string;
}

export class HatchetRuntime {
  private client: HatchetClient | null = null;
  private taskWorkflowName: string;
  private knowledgeWorkflowName: string;

  constructor(
    private readonly config: HatchetConfig,
    private readonly api: ApiClient,
    private readonly storage: ObjectStore,
    private readonly logger: Logger,
  ) {
    this.taskWorkflowName = `${config.workflowPrefix}-task`;
    this.knowledgeWorkflowName = `${config.workflowPrefix}-knowledge-index`;
  }

  isEnabled(): boolean {
    return this.config.enabled && Boolean(this.config.clientToken);
  }

  async start(): Promise<boolean> {
    if (!this.isEnabled()) return false;

    try {
      const client = new HatchetClient({
        token: this.config.clientToken ?? "",
        tls_config: { tls_strategy: this.config.tlsStrategy },
        ...(this.config.hostPort ? { host_port: this.config.hostPort } : {}),
        ...(this.config.apiUrl ? { api_url: this.config.apiUrl } : {}),
      });
      this.client = client;

      const worker = await client.worker(this.config.workerName, {
        labels: this.config.workerLabels,
      });
      await worker.registerWorkflows([this.taskWorkflow(client), this.knowledgeWorkflow(client)]);

      // Hatchet's worker.start() is a long-lived run loop: it only resolves
      // when the worker stops. Awaiting it here prevents the relay/local
      // executor from ever starting, leaving outbox-backed tasks in `created`
      // with 0% progress even though the Hatchet connection is healthy.
      const startPromise = worker.start();
      startPromise.catch((err) => {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "hatchet worker stopped unexpectedly",
        );
      });
      await worker.waitUntilReady(15_000);

      this.logger.info(
        {
          worker: this.config.workerName,
          labels: this.config.workerLabels,
          workflows: [this.taskWorkflowName, this.knowledgeWorkflowName],
        },
        "hatchet worker started",
      );
      return true;
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "hatchet worker failed to start; falling back to local polling",
      );
      this.client = null;
      return false;
    }
  }

  async enqueueTask(input: TaskEnqueue): Promise<void> {
    if (!this.client) throw new Error("hatchet client is not initialized");
    await this.client.admin.runWorkflow(this.taskWorkflowName, input);
  }

  async enqueueKnowledge(input: KnowledgeEnqueue): Promise<void> {
    if (!this.client) throw new Error("hatchet client is not initialized");
    await this.client.admin.runWorkflow(this.knowledgeWorkflowName, input);
  }

  private taskWorkflow(client: HatchetClient) {
    const api = this.api;
    const storage = this.storage;
    const logger = this.logger;

    return client.task({
      name: this.taskWorkflowName,
      // Presentation generation contains several independently bounded model
      // streams. Keep orchestration above the 30m per-stream ceiling so Hatchet
      // never abandons a healthy run while the provider is still reasoning.
      executionTimeout: "90m",
      fn: async (input: JsonObject) => {
        const payload = input as unknown as TaskEnqueue;
        const ctx: StepContext = {
          taskId: payload.taskId,
          runId: `run_${payload.outboxEventId}`,
          sequence: 0,
          api,
          logger,
        };
        try {
          await runTaskWorkflow(ctx, { taskType: payload.taskType, spec: payload.spec }, storage);
          await api.ackOutbox(payload.outboxEventId).catch(() => undefined);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await api
            .projectResult({
              resultSchema: "failure/v1",
              taskId: payload.taskId,
              runId: ctx.runId,
              attempt: 1,
              outputs: [],
              failures: [{ item: "workflow", reason: message, retryable: true }],
            })
            .catch(() => undefined);
          await api.nackOutbox(payload.outboxEventId).catch(() => undefined);
          throw err;
        }
      },
    });
  }

  private knowledgeWorkflow(client: HatchetClient) {
    const api = this.api;
    const storage = this.storage;
    const logger = this.logger;

    return client.task({
      name: this.knowledgeWorkflowName,
      executionTimeout: "3m",
      fn: async (input: JsonObject) => {
        const payload = input as unknown as KnowledgeEnqueue;
        const ctx: StepContext = {
          taskId: payload.sourceId,
          runId: `run_${payload.outboxEventId}`,
          sequence: 0,
          api,
          logger,
        };
        try {
          await runKnowledgeWorkflow(
            ctx,
            { sourceId: payload.sourceId, kbId: payload.kbId },
            storage,
          );
          await api.ackOutbox(payload.outboxEventId).catch(() => undefined);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await api
            .projectResult({
              resultSchema: "failure/v1",
              taskId: payload.sourceId,
              runId: ctx.runId,
              attempt: 1,
              outputs: [],
              failures: [{ item: "knowledge", reason: message, retryable: true }],
            })
            .catch(() => undefined);
          await api.nackOutbox(payload.outboxEventId).catch(() => undefined);
          throw err;
        }
      },
    });
  }
}

export class HatchetRelay {
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly runtime: HatchetRuntime,
    private readonly api: ApiClient,
    private readonly state: WorkerState,
    private readonly logger: Logger,
    private readonly pollIntervalMs: number,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.poll(), this.pollIntervalMs);
    void this.poll();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;

    let events: OutboxEvent[] = [];
    try {
      events = await this.api.claimOutbox(10);
    } catch (err) {
      this.logger.warn({ err: String(err) }, "hatchet relay claim failed");
      return;
    }

    for (const event of events) {
      if (this.stopped) return;
      if (this.state.hasEvent(event.id)) {
        await this.api.ackOutbox(event.id).catch(() => undefined);
        continue;
      }
      // Only mark the event as handed off after it has been successfully
      // enqueued to Hatchet. Marking before the enqueue would let a failed
      // enqueue get acknowledged as a no-op on the next poll, silently dropping
      // the event.
      if (await this.dispatch(event)) {
        this.state.markEvent(event.id, event.eventType);
      }
    }
  }

  private async dispatch(event: OutboxEvent): Promise<boolean> {
    try {
      if (event.eventType === "task.created") {
        await this.runtime.enqueueTask({
          taskId: String(event.data.taskId ?? event.id),
          taskType: String(event.data.taskType ?? ""),
          spec: (event.data.spec ?? {}) as Record<string, unknown>,
          outboxEventId: event.id,
        });
        return true;
      } else if (event.eventType === "knowledge.source.added") {
        await this.runtime.enqueueKnowledge({
          sourceId: String(event.data.sourceId ?? event.id),
          kbId: String(event.data.kbId ?? ""),
          outboxEventId: event.id,
        });
        return true;
      } else {
        await this.api.ackOutbox(event.id).catch(() => undefined);
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ eventId: event.id, err: message }, "hatchet enqueue failed");
      const taskId = String(event.data.taskId ?? event.data.sourceId ?? event.id);
      await this.api
        .projectResult({
          resultSchema: "failure/v1",
          taskId,
          runId: `run_${event.id}`,
          attempt: 1,
          outputs: [],
          failures: [{ item: "dispatch", reason: message, retryable: true }],
        })
        .catch(() => undefined);
      await this.api.nackOutbox(event.id).catch(() => undefined);
      return false;
    }
  }
}
