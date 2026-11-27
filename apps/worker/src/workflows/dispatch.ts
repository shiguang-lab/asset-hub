import type { ObjectStore } from "@shiguang/database";
import { runDatasetQueryWorkflow, runFileProcessWorkflow } from "./data-query.js";
import { runDatasetImportWorkflow } from "./dataset-import.js";
import { runExportWorkflow } from "./export.js";
import { runGitSyncWorkflow } from "./git-sync.js";
import type { StepContext } from "./helpers.js";
import { runPresentationWorkflow } from "./presentation.js";
import { runResearchWorkflow } from "./research.js";

export async function runTaskWorkflow(
  ctx: StepContext,
  data: Record<string, unknown>,
  storage: ObjectStore,
): Promise<void> {
  const taskType = String(data.taskType ?? "");
  const spec = (data.spec ?? {}) as Record<string, unknown>;
  ctx.logger.info({ taskId: ctx.taskId, taskType }, "task workflow started");

  switch (taskType) {
    case "research":
      await runResearchWorkflow(ctx, spec);
      break;
    case "presentation_generate":
      await runPresentationWorkflow(ctx, spec, storage);
      break;
    case "dataset_import":
      await runDatasetImportWorkflow(ctx, spec, storage);
      break;
    case "git_sync":
      await runGitSyncWorkflow(ctx, spec);
      break;
    case "export":
      await runExportWorkflow(ctx, spec, storage);
      break;
    case "dataset_query":
      await runDatasetQueryWorkflow(ctx, spec, storage);
      break;
    case "file_process":
      await runFileProcessWorkflow(ctx, spec, storage);
      break;
    case "knowledge_index":
    case "publish_bundle":
      await ctx.api.projectResult({
        resultSchema: "noop/v1",
        taskId: ctx.taskId,
        runId: ctx.runId,
        attempt: 1,
        outputs: [],
        failures: [],
      });
      break;
    default:
      throw new Error(`unknown task type: ${taskType}`);
  }
}
