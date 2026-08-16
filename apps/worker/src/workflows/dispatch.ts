import type { ObjectStore } from "@shiguang/database";
import { runDatasetImportWorkflow } from "./dataset-import.js";
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
    case "knowledge_index":
    case "publish_bundle":
    case "export":
    case "file_process":
    case "dataset_query":
      await ctx.api.projectResult({
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
