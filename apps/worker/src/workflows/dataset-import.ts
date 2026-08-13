import { inferSchema, parseDataset, profileDataset, qualityIssues } from "@shiguang/content";
import type { ObjectStore } from "@shiguang/database";
import { z } from "zod";
import { type StepContext, step } from "./helpers.js";

export async function runDatasetImportWorkflow(
  ctx: StepContext,
  spec: Record<string, unknown>,
  storage: ObjectStore,
): Promise<void> {
  const parsedSpec = z
    .object({
      datasetId: z.string(),
      objectKey: z.string(),
      fileName: z.string(),
      contentHash: z.string().optional(),
    })
    .parse(spec);

  await step(ctx, "dataset.parse", 40, "解析并推断 Schema", async () => {
    const buffer = await storage.get(parsedSpec.objectKey);
    if (!buffer) throw new Error(`dataset file not found: ${parsedSpec.objectKey}`);
    const parsed = parseDataset(buffer, parsedSpec.fileName);
    if (parsed.rows.length === 0) throw new Error("数据文件没有有效行");
    const schema = inferSchema(parsed.rows);
    const profile = profileDataset(parsed.rows, schema);
    const issues = qualityIssues(parsed.rows, schema);
    ctx.logger.info({ rows: parsed.rows.length, columns: schema.length }, "dataset parsed");
    await ctx.api.postComputeResults({
      kind: "dataset_import",
      taskId: ctx.taskId,
      runId: ctx.runId,
      data: {
        datasetId: parsedSpec.datasetId,
        fileName: parsedSpec.fileName,
        format: parsed.format,
        rowCount: parsed.rows.length,
        schema,
        profile,
        qualityIssues: issues,
        objectKey: parsedSpec.objectKey,
        contentHash: parsedSpec.contentHash ?? "",
      },
    });
  });
}
