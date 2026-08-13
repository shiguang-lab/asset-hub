import type { ObjectStore } from "@shiguang/database";
import type { Logger } from "@shiguang/observability";
import type { ApiClient } from "./api-client.js";
import type { WorkerState } from "./state.js";
import { runDatasetImportWorkflow } from "./workflows/dataset-import.js";
import { runGitSyncWorkflow } from "./workflows/git-sync.js";
import { runKnowledgeWorkflow } from "./workflows/knowledge.js";
import { runPresentationWorkflow } from "./workflows/presentation.js";
import { runResearchWorkflow } from "./workflows/research.js";

interface OutboxEvent {
  id: string;
  eventType: string;
  workspaceId: string;
  data: Record<string, unknown>;
}

export class Executor {
  private readonly active = new Set<string>();
  private stopped = false;

  constructor(
    private readonly api: ApiClient,
    private readonly state: WorkerState,
    private readonly storage: ObjectStore,
    private readonly logger: Logger,
    private readonly maxConcurrent: number,
  ) {}

  async poll(): Promise<void> {
    if (this.stopped) return;
    const available = Math.max(0, this.maxConcurrent - this.active.size);
    if (available === 0) return;
    let events: OutboxEvent[] = [];
    try {
      events = await this.api.claimOutbox(available);
    } catch (err) {
      this.logger.warn({ err: String(err) }, "claim outbox failed");
      return;
    }
    for (const event of events) {
      if (this.stopped) return;
      if (this.state.hasEvent(event.id)) {
        await this.api.ackOutbox(event.id).catch(() => undefined);
        continue;
      }
      this.state.markEvent(event.id, event.eventType);
      void this.dispatch(event);
    }
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    const runId = `run_${event.id}`;
    this.active.add(runId);
    try {
      const taskId = String(event.data.taskId ?? event.data.sourceId ?? event.id);
      this.state.startRun(runId, taskId, event.eventType);
      const ctx = {
        taskId,
        runId,
        sequence: 0,
        api: this.api,
        logger: this.logger,
      };
      if (event.eventType === "task.created") {
        await this.runTaskWorkflow(ctx, event.data);
      } else if (event.eventType === "knowledge.source.added") {
        await runKnowledgeWorkflow(ctx, event.data, this.storage);
      } else {
        this.logger.info({ eventType: event.eventType }, "no handler, acking");
      }
      await this.api.ackOutbox(event.id);
      this.state.finishRun(runId, "completed");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ eventId: event.id, err: message }, "workflow failed");
      this.state.finishRun(runId, "failed");
      const taskId = String(event.data.taskId ?? event.data.sourceId ?? event.id);
      await this.api
        .projectResult({
          resultSchema: "failure/v1",
          taskId,
          runId,
          attempt: 1,
          outputs: [],
          usage: { creditUnits: 0 },
          failures: [{ item: "workflow", reason: message, retryable: true }],
        })
        .catch(() => undefined);
      await this.api.nackOutbox(event.id).catch(() => undefined);
    } finally {
      this.active.delete(runId);
    }
  }

  private async runTaskWorkflow(
    ctx: {
      taskId: string;
      runId: string;
      sequence: number;
      api: ApiClient;
      logger: Logger;
    },
    data: Record<string, unknown>,
  ): Promise<void> {
    const taskType = String(data.taskType ?? "");
    const spec = (data.spec ?? {}) as Record<string, unknown>;
    this.logger.info({ taskId: ctx.taskId, taskType }, "task workflow started");
    switch (taskType) {
      case "research":
        await runResearchWorkflow(ctx, spec);
        break;
      case "presentation_generate":
        await runPresentationWorkflow(ctx, spec, this.storage);
        break;
      case "dataset_import":
        await runDatasetImportWorkflow(ctx, spec, this.storage);
        break;
      case "git_sync":
        await runGitSyncWorkflow(ctx, spec);
        break;
      case "knowledge_index":
      case "publish_bundle":
      case "export":
      case "file_process":
      case "dataset_query":
        this.logger.info({ taskType }, "task type handled by sync path, acking");
        await this.api.projectResult({
          resultSchema: "noop/v1",
          taskId: ctx.taskId,
          runId: ctx.runId,
          attempt: 1,
          outputs: [],
          usage: { creditUnits: 0 },
          failures: [],
        });
        break;
      default:
        throw new Error(`unknown task type: ${taskType}`);
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
