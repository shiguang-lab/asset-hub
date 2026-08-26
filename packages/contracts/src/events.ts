import { z } from "zod";

export const eventTypeSchema = z.enum([
  "asset.created",
  "asset.version.created",
  "asset.deleted",
  "asset.restored",
  "task.created",
  "task.updated",
  "task.completed",
  "task.partial",
  "task.failed",
  "knowledge.source.added",
  "knowledge.source.ready",
  "knowledge.source.failed",
  "publish.released",
  "publish.revoked",
  "notification.created",
  "dataset.version.ready",
  "presentation.generated",
]);
export type EventType = z.infer<typeof eventTypeSchema>;

export const eventPayloads = {
  "asset.created": z.object({ assetId: z.string(), assetType: z.string() }),
  "asset.version.created": z.object({
    assetId: z.string(),
    versionId: z.string(),
    contentHash: z.string(),
  }),
  "asset.deleted": z.object({ assetId: z.string(), deletedAt: z.string() }),
  "asset.restored": z.object({ assetId: z.string() }),
  "task.created": z.object({ taskId: z.string(), taskType: z.string() }),
  "task.updated": z.object({ taskId: z.string(), status: z.string(), progress: z.number() }),
  "task.completed": z.object({
    taskId: z.string(),
    outputAssetIds: z.array(z.string()),
  }),
  "task.partial": z.object({
    taskId: z.string(),
    outputAssetIds: z.array(z.string()),
    failures: z.array(z.string()),
  }),
  "task.failed": z.object({ taskId: z.string(), error: z.string() }),
  "knowledge.source.added": z.object({ sourceId: z.string(), kbId: z.string() }),
  "knowledge.source.ready": z.object({
    sourceId: z.string(),
    kbId: z.string(),
    chunkCount: z.number(),
  }),
  "knowledge.source.failed": z.object({
    sourceId: z.string(),
    kbId: z.string(),
    error: z.string(),
  }),
  "publish.released": z.object({
    publishId: z.string(),
    slug: z.string(),
    releaseId: z.string(),
  }),
  "publish.revoked": z.object({ publishId: z.string(), slug: z.string() }),
  "notification.created": z.object({ notificationId: z.string() }),
  "dataset.version.ready": z.object({ datasetId: z.string(), versionId: z.string() }),
  "presentation.generated": z.object({ assetId: z.string(), taskId: z.string() }),
} as const satisfies Record<string, z.ZodTypeAny>;

export type EventPayload<K extends EventType> = z.infer<(typeof eventPayloads)[K]>;
