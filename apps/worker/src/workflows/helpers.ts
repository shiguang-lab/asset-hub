import type { Logger } from "@shiguang/observability";
import type { ApiClient } from "../api-client.js";

export interface StepContext {
  taskId: string;
  runId: string;
  sequence: number;
  api: ApiClient;
  logger: Logger;
}

export async function step(
  ctx: StepContext,
  type: string,
  progress: number,
  detail: string,
  fn: () => Promise<void>,
): Promise<void> {
  ctx.sequence += 1;
  await ctx.api.reportProgress({
    taskId: ctx.taskId,
    runId: ctx.runId,
    sequence: ctx.sequence,
    status: "running",
    progress,
    detail,
  });
  ctx.logger.info({ taskId: ctx.taskId, step: type, progress }, detail);
  try {
    await fn();
    ctx.sequence += 1;
    await ctx.api.reportProgress({
      taskId: ctx.taskId,
      runId: ctx.runId,
      sequence: ctx.sequence,
      progress,
      detail: `${detail} ✓`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error({ taskId: ctx.taskId, step: type, err: message }, "step failed");
    throw err;
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
