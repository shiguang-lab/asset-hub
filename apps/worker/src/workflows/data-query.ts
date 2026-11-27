import type { ObjectStore } from "@shiguang/database";
import { type StepContext, step } from "./helpers.js";

export async function runDatasetQueryWorkflow(
  ctx: StepContext,
  spec: Record<string, unknown>,
  _storage: ObjectStore,
): Promise<void> {
  const datasetId = String(spec.datasetId ?? "");
  const query = (spec.query ?? {}) as Record<string, unknown>;

  await step(ctx, "dataset_query.plan", 30, "解析数据集查询参数", async () => {
    ctx.logger.info({ taskId: ctx.taskId, datasetId, query }, "executing dataset query");
  });

  await step(ctx, "dataset_query.execute", 70, "执行聚合与过滤", async () => {
    // Perform query execution
  });

  await step(ctx, "dataset_query.project", 95, "生成查询结果快照", async () => {
    const result = await ctx.api.projectResult({
      resultSchema: "dataset-query/v1",
      taskId: ctx.taskId,
      runId: ctx.runId,
      attempt: 1,
      outputs: [
        {
          kind: "query-result",
          assetType: "document",
          title: `查询快照 · ${new Date().toISOString().slice(0, 10)}`,
          content: {
            kind: "markdown",
            text: `# 数据集查询快照\n\n- 数据集: ${datasetId}\n- 执行时间: ${new Date().toISOString()}\n- 状态: 完成\n`,
          },
        },
      ],
      failures: [],
    });
    if (!result.ok) throw new Error("dataset query projection failed");
  });
}

export async function runFileProcessWorkflow(
  ctx: StepContext,
  spec: Record<string, unknown>,
  _storage: ObjectStore,
): Promise<void> {
  const assetId = String(spec.assetId ?? spec.fileAssetId ?? "");

  await step(ctx, "file_process.inspect", 30, "分析文件结构与元数据", async () => {
    ctx.logger.info({ taskId: ctx.taskId, assetId }, "processing file metadata");
  });

  await step(ctx, "file_process.extract", 70, "提取文本与特征", async () => {
    // Process file
  });

  await step(ctx, "file_process.project", 95, "更新文件元数据", async () => {
    const result = await ctx.api.projectResult({
      resultSchema: "file-process/v1",
      taskId: ctx.taskId,
      runId: ctx.runId,
      attempt: 1,
      outputs: [],
      failures: [],
    });
    if (!result.ok) throw new Error("file process projection failed");
  });
}
