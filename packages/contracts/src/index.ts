import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Identifiers                                                          */
/* ------------------------------------------------------------------ */

export const idSchema = z.string().regex(/^[a-z0-9]+_[a-z0-9]{8,40}$/i, "expected prefixed id");

export const workspaceIdSchema = idSchema;
export const assetIdSchema = idSchema;
export const assetVersionIdSchema = idSchema;
export const taskIdSchema = idSchema;
export const kbIdSchema = idSchema;
export const sourceIdSchema = idSchema;
export const datasetIdSchema = idSchema;
export const publishIdSchema = idSchema;
export const templateIdSchema = idSchema;
export const tokenIdSchema = idSchema;

/* ------------------------------------------------------------------ */
/* Enums                                                                */
/* ------------------------------------------------------------------ */

export const assetTypeSchema = z.enum([
  "document",
  "html",
  "report",
  "dataset",
  "presentation",
  "chart",
  "source",
  "file",
]);
export type AssetType = z.infer<typeof assetTypeSchema>;

export const assetStatusSchema = z.enum(["normal", "processing", "error", "archived", "deleted"]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const visibilitySchema = z.enum([
  "private",
  "link",
  "public",
  "unlisted",
  "password",
  "member_only",
]);
export type Visibility = z.infer<typeof visibilitySchema>;

export const taskStatusSchema = z.enum([
  "created",
  "planning",
  "queued",
  "running",
  "waiting_user",
  "paused",
  "completed",
  "partial_completed",
  "failed",
  "cancelled",
  "cancelling",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskTypeSchema = z.enum([
  "research",
  "knowledge_index",
  "presentation_generate",
  "export",
  "publish_bundle",
  "file_process",
  "dataset_import",
  "dataset_query",
]);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const sourceStatusSchema = z.enum(["pending", "parsing", "indexing", "ready", "failed"]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const relationTypeSchema = z.enum([
  "generated_from",
  "derived_from",
  "knowledge_source_of",
  "output_of",
  "references",
  "version_of",
  "source_of",
]);
export type RelationType = z.infer<typeof relationTypeSchema>;

export const creditEntryTypeSchema = z.enum([
  "grant",
  "reserve",
  "settle",
  "release",
  "refund",
  "expire",
]);
export type CreditEntryType = z.infer<typeof creditEntryTypeSchema>;

export const notifyTypeSchema = z.enum([
  "task_completed",
  "task_partial",
  "task_failed",
  "knowledge_indexed",
  "knowledge_failed",
  "share",
  "publish",
  "billing",
  "system",
]);
export type NotifyType = z.infer<typeof notifyTypeSchema>;

/* ------------------------------------------------------------------ */
/* Core entities                                                        */
/* ------------------------------------------------------------------ */

export const assetSchema = z.object({
  id: assetIdSchema,
  workspaceId: workspaceIdSchema,
  ownerSubject: z.string(),
  type: assetTypeSchema,
  title: z.string(),
  description: z.string().default(""),
  visibility: visibilitySchema.default("private"),
  status: assetStatusSchema.default("normal"),
  tags: z.array(z.string()).default([]),
  sourceType: z
    .enum(["manual", "upload", "research", "agent", "api", "git", "template"])
    .default("manual"),
  currentVersionId: z.string().nullable().default(null),
  lockVersion: z.number().default(1),
  deletedAt: z.string().nullable().default(null),
  publishedUrl: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Asset = z.infer<typeof assetSchema>;

export const assetVersionSchema = z.object({
  id: assetVersionIdSchema,
  assetId: assetIdSchema,
  sequence: z.number(),
  changeKind: z
    .enum(["create", "edit", "draft", "ai_patch", "restore", "import", "task"])
    .default("edit"),
  contentHash: z.string(),
  size: z.number(),
  mediaType: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
});
export type AssetVersion = z.infer<typeof assetVersionSchema>;

export const assetRelationSchema = z.object({
  id: idSchema,
  sourceAssetId: assetIdSchema,
  targetAssetId: assetIdSchema,
  relationType: relationTypeSchema,
  provenance: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
});
export type AssetRelation = z.infer<typeof assetRelationSchema>;

export const assetContentSchema = z.object({
  kind: z.enum(["markdown", "html", "manifest", "presentation", "source", "blob"]),
  text: z.string().nullable().default(null),
  manifest: z.record(z.string(), z.unknown()).nullable().default(null),
  refs: z
    .array(
      z.object({
        role: z.string(),
        objectKey: z.string(),
        contentHash: z.string(),
        size: z.number(),
        mediaType: z.string(),
      }),
    )
    .default([]),
});
export type AssetContent = z.infer<typeof assetContentSchema>;

export const taskStepSchema = z.object({
  id: idSchema,
  taskId: taskIdSchema,
  type: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]).default("pending"),
  progress: z.number().default(0),
  detail: z.string().default(""),
  error: z.string().nullable().default(null),
  attempt: z.number().default(1),
  outputs: z.record(z.string(), z.unknown()).default({}),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
});
export type TaskStep = z.infer<typeof taskStepSchema>;

export const taskSchema = z.object({
  id: taskIdSchema,
  workspaceId: workspaceIdSchema,
  ownerSubject: z.string(),
  type: taskTypeSchema,
  goal: z.string(),
  status: taskStatusSchema.default("created"),
  progress: z.number().default(0),
  currentStep: z.string().default(""),
  spec: z.record(z.string(), z.unknown()).default({}),
  plan: z.record(z.string(), z.unknown()).nullable().default(null),
  inputAssetIds: z.array(assetIdSchema).default([]),
  outputAssetIds: z.array(assetIdSchema).default([]),
  creditsUsed: z.number().default(0),
  error: z.string().nullable().default(null),
  cancelRequested: z.boolean().default(false),
  checkpoint: z.record(z.string(), z.unknown()).nullable().default(null),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;

export const knowledgeBaseSchema = z.object({
  id: kbIdSchema,
  workspaceId: workspaceIdSchema,
  name: z.string(),
  description: z.string().default(""),
  status: z.enum(["active", "archived"]).default("active"),
  sourceCount: z.number().default(0),
  chunkCount: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>;

export const knowledgeSourceSchema = z.object({
  id: sourceIdSchema,
  kbId: kbIdSchema,
  workspaceId: workspaceIdSchema,
  sourceType: z.enum(["asset", "upload", "url"]),
  assetVersionId: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
  title: z.string(),
  status: sourceStatusSchema.default("pending"),
  error: z.string().nullable().default(null),
  contentHash: z.string().nullable().default(null),
  chunkCount: z.number().default(0),
  retryCount: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export const knowledgeChunkSchema = z.object({
  id: idSchema,
  kbId: kbIdSchema,
  sourceId: sourceIdSchema,
  ordinal: z.number(),
  headingPath: z.string().default(""),
  text: z.string(),
  textHash: z.string(),
  charStart: z.number(),
  charEnd: z.number(),
});
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;

export const datasetSchema = z.object({
  id: datasetIdSchema,
  workspaceId: workspaceIdSchema,
  name: z.string(),
  description: z.string().default(""),
  currentVersionId: z.string().nullable().default(null),
  status: z.enum(["normal", "processing", "error"]).default("normal"),
  rowCount: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Dataset = z.infer<typeof datasetSchema>;

export const datasetVersionSchema = z.object({
  id: idSchema,
  datasetId: datasetIdSchema,
  version: z.number(),
  fileName: z.string(),
  format: z.enum(["csv", "json", "xlsx", "tsv"]),
  rowCount: z.number(),
  columnCount: z.number(),
  schema: z
    .array(
      z.object({
        columnId: z.string(),
        name: z.string(),
        type: z.enum(["string", "number", "integer", "boolean", "date", "null"]),
        nullable: z.boolean(),
        distinctCount: z.number().default(0),
      }),
    )
    .default([]),
  profile: z.record(z.string(), z.unknown()).default({}),
  qualityIssues: z
    .array(
      z.object({
        severity: z.enum(["info", "warning", "error"]),
        row: z.number().nullable(),
        column: z.string().nullable(),
        message: z.string(),
      }),
    )
    .default([]),
  status: z.enum(["processing", "ready", "failed"]).default("processing"),
  error: z.string().nullable().default(null),
  createdAt: z.string(),
  objectKey: z.string().nullable().optional(),
  contentHash: z.string().nullable().optional(),
});
export type DatasetVersion = z.infer<typeof datasetVersionSchema>;

export const savedViewSchema = z.object({
  id: idSchema,
  datasetId: datasetIdSchema,
  workspaceId: workspaceIdSchema,
  name: z.string(),
  query: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type SavedView = z.infer<typeof savedViewSchema>;

export const chartSpecSchema = z.object({
  id: idSchema,
  datasetId: datasetIdSchema,
  workspaceId: workspaceIdSchema,
  name: z.string(),
  chartType: z.enum(["bar", "line", "pie", "scatter", "table"]),
  x: z.string().nullable().default(null),
  y: z.string().nullable().default(null),
  groupBy: z.string().nullable().default(null),
  aggregation: z.enum(["sum", "avg", "count", "min", "max", "none"]).default("sum"),
  createdAt: z.string(),
});
export type ChartSpec = z.infer<typeof chartSpecSchema>;

export const presentationThemeSchema = z.enum(["light", "dark", "brand", "minimal", "gradient"]);
export const presentationLayoutSchema = z.enum([
  "title",
  "section",
  "content",
  "two-column",
  "quote",
  "data",
  "image",
  "closing",
]);

export const slideBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["heading", "text", "bullet", "image", "chart", "quote", "table", "code"]),
  content: z.string(),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type SlideBlock = z.infer<typeof slideBlockSchema>;

export const slideSchema = z.object({
  id: z.string(),
  layout: presentationLayoutSchema,
  title: z.string(),
  blocks: z.array(slideBlockSchema).default([]),
  notes: z.string().default(""),
});
export type Slide = z.infer<typeof slideSchema>;

export const presentationDocumentSchema = z.object({
  theme: presentationThemeSchema.default("light"),
  aspectRatio: z.enum(["16:9", "4:3", "9:16"]).default("16:9"),
  slides: z.array(slideSchema).default([]),
});
export type PresentationDocument = z.infer<typeof presentationDocumentSchema>;

export const templateSchema = z.object({
  id: templateIdSchema,
  workspaceId: workspaceIdSchema,
  type: z.enum(["research", "presentation"]),
  name: z.string(),
  description: z.string().default(""),
  content: z.record(z.string(), z.unknown()),
  version: z.number().default(1),
  published: z.boolean().default(false),
  usageCount: z.number().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Template = z.infer<typeof templateSchema>;

export const publishSchema = z.object({
  id: publishIdSchema,
  workspaceId: workspaceIdSchema,
  assetId: assetIdSchema,
  slug: z.string(),
  shortSlug: z.string(),
  visibility: visibilitySchema.default("public"),
  passwordHash: z.string().nullable().default(null),
  passwordSalt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  allowDownload: z.boolean().default(true),
  allowCopy: z.boolean().default(true),
  activeReleaseId: z.string().nullable().default(null),
  viewCount: z.number().default(0),
  status: z.enum(["active", "revoked", "expired", "deleted"]).default("active"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Publish = z.infer<typeof publishSchema>;

export const publishReleaseSchema = z.object({
  id: idSchema,
  publishId: publishIdSchema,
  assetVersionId: assetVersionIdSchema,
  etag: z.string(),
  manifest: z.record(z.string(), z.unknown()),
  status: z.enum(["building", "ready", "failed", "superseded"]).default("building"),
  createdAt: z.string(),
});
export type PublishRelease = z.infer<typeof publishReleaseSchema>;

export const shortLinkSchema = z.object({
  id: idSchema,
  publishId: publishIdSchema,
  shortSlug: z.string(),
  destination: z.string(),
  revokedAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type ShortLink = z.infer<typeof shortLinkSchema>;

export const notificationSchema = z.object({
  id: idSchema,
  workspaceId: workspaceIdSchema,
  subject: z.string(),
  type: notifyTypeSchema,
  title: z.string(),
  body: z.string().default(""),
  link: z.string().nullable().default(null),
  readAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const creditAccountSchema = z.object({
  id: idSchema,
  workspaceId: workspaceIdSchema,
  balance: z.number(),
  totalGranted: z.number(),
  totalUsed: z.number(),
  updatedAt: z.string(),
});
export type CreditAccount = z.infer<typeof creditAccountSchema>;

export const creditLedgerEntrySchema = z.object({
  id: idSchema,
  workspaceId: workspaceIdSchema,
  entryType: creditEntryTypeSchema,
  amount: z.number(),
  operationId: z.string(),
  taskId: z.string().nullable().default(null),
  description: z.string().default(""),
  createdAt: z.string(),
});
export type CreditLedgerEntry = z.infer<typeof creditLedgerEntrySchema>;

export const apiTokenSchema = z.object({
  id: tokenIdSchema,
  workspaceId: workspaceIdSchema,
  name: z.string(),
  secretHash: z.string(),
  scopes: z.array(z.enum(["read", "write"])).default(["read"]),
  expiresAt: z.string().nullable().default(null),
  revokedAt: z.string().nullable().default(null),
  lastUsedAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type ApiToken = z.infer<typeof apiTokenSchema>;

export const mcpConfigSchema = z.object({
  id: idSchema,
  workspaceId: workspaceIdSchema,
  enabled: z.boolean().default(false),
  scope: z.enum(["all", "knowledge_bases", "assets"]).default("all"),
  scopeIds: z.array(z.string()).default([]),
  writeEnabled: z.boolean().default(false),
  serverUrl: z.string().default("http://localhost:3001/mcp"),
  updatedAt: z.string(),
});
export type McpConfig = z.infer<typeof mcpConfigSchema>;

export const auditEventSchema = z.object({
  id: idSchema,
  workspaceId: workspaceIdSchema,
  actor: z.string(),
  action: z.string(),
  resource: z.string(),
  outcome: z.enum(["success", "denied", "failed"]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const outboxEventSchema = z.object({
  id: idSchema,
  eventType: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  aggregateVersion: z.number(),
  workspaceId: workspaceIdSchema,
  data: z.record(z.string(), z.unknown()),
  status: z.enum(["pending", "dispatched", "failed"]).default("pending"),
  createdAt: z.string(),
  dispatchedAt: z.string().nullable().default(null),
});
export type OutboxEvent = z.infer<typeof outboxEventSchema>;

/* ------------------------------------------------------------------ */
/* Research                                                             */
/* ------------------------------------------------------------------ */

export const researchScopeItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  enabled: z.boolean().default(true),
});
export type ResearchScopeItem = z.infer<typeof researchScopeItemSchema>;

export const researchSpecSchema = z.object({
  goal: z.string().min(1),
  scope: z.array(researchScopeItemSchema).default([]),
  region: z.string().default("全球"),
  timeRange: z.string().default("最近 12 个月"),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  quality: z.enum(["economy", "balanced", "best"]).default("balanced"),
  outputs: z
    .array(z.enum(["report", "sources", "dataset", "presentation"]))
    .default(["report", "sources"]),
});
export type ResearchSpec = z.infer<typeof researchSpecSchema>;

export const evidenceItemSchema = z.object({
  id: idSchema,
  taskId: taskIdSchema,
  claim: z.string(),
  sourceTitle: z.string(),
  sourceUrl: z.string().nullable().default(null),
  sourceAssetVersionId: z.string().nullable().default(null),
  locator: z.string().nullable().default(null),
  excerptHash: z.string().nullable().default(null),
  excerpt: z.string().default(""),
  retrievedAt: z.string(),
  confidence: z.number().default(0.5),
  verificationStatus: z.enum(["unverified", "verified", "contradicted"]).default("unverified"),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

/* ------------------------------------------------------------------ */
/* Dataset query AST                                                    */
/* ------------------------------------------------------------------ */

export const queryFilterSchema = z.object({
  column: z.string(),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in", "is_null"]),
  value: z.unknown().optional(),
});

export const datasetQuerySchema = z.object({
  datasetVersionId: z.string(),
  select: z.array(z.string()).default([]),
  filters: z.array(queryFilterSchema).default([]),
  sort: z.array(z.object({ column: z.string(), direction: z.enum(["asc", "desc"]) })).default([]),
  groupBy: z.array(z.string()).default([]),
  aggregations: z
    .array(
      z.object({
        column: z.string(),
        op: z.enum(["sum", "avg", "count", "min", "max"]),
        as: z.string(),
      }),
    )
    .default([]),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
});
export type DatasetQuery = z.infer<typeof datasetQuerySchema>;

export const datasetQueryResultSchema = z.object({
  columns: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
  rows: z.array(z.record(z.string(), z.unknown())),
  total: z.number(),
  limited: z.boolean(),
  elapsedMs: z.number(),
  warnings: z.array(z.string()).default([]),
});
export type DatasetQueryResult = z.infer<typeof datasetQueryResultSchema>;

/* ------------------------------------------------------------------ */
/* Event envelope + SSE                                                 */
/* ------------------------------------------------------------------ */

export const eventEnvelopeSchema = z.object({
  eventId: idSchema,
  eventType: z.string(),
  schemaVersion: z.number().default(1),
  occurredAt: z.string(),
  producer: z.string(),
  tenantId: workspaceIdSchema,
  aggregate: z.object({
    type: z.string(),
    id: z.string(),
    version: z.number(),
  }),
  trace: z
    .object({ traceparent: z.string().nullable().default(null) })
    .partial()
    .default({}),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const sseEventSchema = z.object({
  id: z.string(),
  event: z.enum([
    "task.updated",
    "task.completed",
    "notification.created",
    "knowledge.updated",
    "asset.updated",
    "credit.updated",
    "ping",
  ]),
  data: z.record(z.string(), z.unknown()),
});
export type SseEvent = z.infer<typeof sseEventSchema>;

/* ------------------------------------------------------------------ */
/* Problem details                                                      */
/* ------------------------------------------------------------------ */

export const problemDetailsSchema = z.object({
  type: z.string().url().or(z.string()).default("about:blank"),
  title: z.string(),
  status: z.number(),
  code: z.string(),
  detail: z.string(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  recoveries: z.array(z.string()).default([]),
  fields: z.record(z.string(), z.array(z.string())).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/* ------------------------------------------------------------------ */
/* MCP                                                                  */
/* ------------------------------------------------------------------ */

export const mcpToolInputs = {
  searchAssets: z.object({
    query: z.string(),
    types: z.array(assetTypeSchema).optional(),
    scope: z.enum(["all", "knowledge_bases", "assets"]).optional(),
    scopeIds: z.array(z.string()).optional(),
    cursor: z.string().optional(),
  }),
  readAsset: z.object({
    assetId: assetIdSchema,
    versionId: z.string().optional(),
    format: z.enum(["markdown", "html", "json", "text"]).optional(),
  }),
  searchKnowledge: z.object({
    knowledgeBaseId: kbIdSchema,
    query: z.string(),
    limit: z.number().min(1).max(50).default(10),
  }),
  createAsset: z.object({
    type: assetTypeSchema,
    title: z.string(),
    description: z.string().optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
  }),
  updateAsset: z.object({
    assetId: assetIdSchema,
    expectedVersion: z.number().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    content: z.record(z.string(), z.unknown()).optional(),
  }),
  createTask: z.object({
    type: taskTypeSchema,
    goal: z.string(),
    spec: z.record(z.string(), z.unknown()).optional(),
  }),
  publishAsset: z.object({
    assetId: assetIdSchema,
    visibility: visibilitySchema,
    expiresAt: z.string().optional(),
  }),
} as const;

export type McpToolName =
  | "search_assets"
  | "read_asset"
  | "search_knowledge"
  | "create_asset"
  | "update_asset"
  | "create_task"
  | "publish_asset";

export const mcpToolNames: readonly McpToolName[] = [
  "search_assets",
  "read_asset",
  "search_knowledge",
  "create_asset",
  "update_asset",
  "create_task",
  "publish_asset",
];

/* ------------------------------------------------------------------ */
/* Workflow result contract                                             */
/* ------------------------------------------------------------------ */

export const blobRefSchema = z.object({
  objectKey: z.string(),
  contentHash: z.string(),
  mediaType: z.string(),
  size: z.number(),
});
export type BlobRef = z.infer<typeof blobRefSchema>;

export const workflowResultSchema = z.object({
  resultSchema: z.string(),
  taskId: taskIdSchema,
  runId: z.string(),
  attempt: z.number().default(1),
  outputs: z
    .array(
      z.object({
        kind: z.string(),
        assetType: assetTypeSchema.optional(),
        title: z.string().optional(),
        blob: blobRefSchema.optional(),
        content: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .default([]),
  usage: z
    .object({
      inputTokens: z.number().default(0),
      outputTokens: z.number().default(0),
      providerCostMicros: z.number().default(0),
      creditUnits: z.number().default(0),
    })
    .partial()
    .default({}),
  failures: z
    .array(
      z.object({
        item: z.string(),
        reason: z.string(),
        retryable: z.boolean().default(false),
      }),
    )
    .default([]),
  evidence: z
    .array(
      z.object({
        claim: z.string(),
        sourceTitle: z.string(),
        sourceUrl: z.string().nullable().optional(),
        sourceAssetVersionId: z.string().nullable().optional(),
        locator: z.string().nullable().optional(),
        excerptHash: z.string().nullable().optional(),
        excerpt: z.string().default(""),
        retrievedAt: z.string().optional(),
        confidence: z.number().default(0.5),
        verificationStatus: z
          .enum(["unverified", "verified", "contradicted"])
          .default("unverified"),
      }),
    )
    .default([]),
});
export type WorkflowResult = z.infer<typeof workflowResultSchema>;

export const progressEventSchema = z.object({
  taskId: taskIdSchema,
  runId: z.string(),
  sequence: z.number(),
  status: taskStatusSchema.optional(),
  progress: z.number().optional(),
  stepId: z.string().optional(),
  stepStatus: z.enum(["pending", "running", "completed", "failed", "skipped"]).optional(),
  detail: z.string().optional(),
  message: z.string().optional(),
});
export type ProgressEvent = z.infer<typeof progressEventSchema>;

/* ------------------------------------------------------------------ */
/* API request/response DTOs                                            */
/* ------------------------------------------------------------------ */

export const listAssetsQuerySchema = z.object({
  type: assetTypeSchema.optional(),
  q: z.string().optional(),
  tag: z.string().optional(),
  status: assetStatusSchema.optional(),
  visibility: visibilitySchema.optional(),
  sort: z.enum(["updated_at", "created_at", "title"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  includeDeleted: z.coerce.boolean().optional(),
});

export const createAssetInputSchema = z.object({
  type: assetTypeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  visibility: visibilitySchema.optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

export const saveDraftInputSchema = z.object({
  content: z.string(),
  baseVersionId: z.string().optional(),
  changeKind: z.enum(["draft", "edit", "ai_patch"]).optional(),
});

export const publishInputSchema = z.object({
  visibility: z.enum(["public", "unlisted", "password"]).optional(),
  password: z.string().optional(),
  expiresAt: z.string().optional(),
  allowDownload: z.boolean().optional(),
  allowCopy: z.boolean().optional(),
});

export const researchCreateSchema = z.object({
  goal: z.string().min(1),
  region: z.string().optional(),
  timeRange: z.string().optional(),
  depth: z.enum(["quick", "standard", "deep"]).optional(),
  quality: z.enum(["economy", "balanced", "best"]).optional(),
  outputs: z.array(z.enum(["report", "sources", "dataset", "presentation"])).optional(),
  scope: z.array(researchScopeItemSchema).optional(),
  inputAssetIds: z.array(assetIdSchema).optional(),
});

export const knowledgeAskSchema = z.object({
  query: z.string().min(1),
  topK: z.number().min(1).max(20).optional(),
});

export const aiDocumentActionSchema = z.object({
  action: z.enum(["rewrite", "summarize", "expand", "translate", "explain"]),
  selection: z.string(),
  language: z.string().optional(),
  tone: z.string().optional(),
});

export const presentationGenerateSchema = z.object({
  assetId: assetIdSchema.optional(),
  title: z.string().optional(),
  sourceText: z.string().optional(),
  theme: presentationThemeSchema.optional(),
  layoutStyle: z.string().optional(),
});

export const datasetImportSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const apiTokenCreateSchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.enum(["read", "write"])).default(["read"]),
  expiresAt: z.string().nullable().optional(),
});

export const mcpConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  scope: z.enum(["all", "knowledge_bases", "assets"]).optional(),
  scopeIds: z.array(z.string()).optional(),
  writeEnabled: z.boolean().optional(),
});

export const taskActionSchema = z.object({
  reason: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/* Common service types                                                 */
/* ------------------------------------------------------------------ */

export const actorContextSchema = z.object({
  subject: z.string(),
  workspaceId: workspaceIdSchema,
  requestId: z.string(),
  isService: z.boolean().default(false),
  tokenScopes: z.array(z.enum(["read", "write"])).default([]),
});
export type ActorContext = z.infer<typeof actorContextSchema>;

export const healthSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded", "down"]),
  timestamp: z.string(),
  version: z.string().optional(),
  checks: z.record(z.string(), z.enum(["ok", "degraded", "down"])).optional(),
});

export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number(),
  });

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
  total: number;
};

export const assetSummarySchema = assetSchema.pick({
  id: true,
  type: true,
  title: true,
  status: true,
  visibility: true,
  tags: true,
  updatedAt: true,
  createdAt: true,
});
export type AssetSummary = z.infer<typeof assetSummarySchema>;

export const workspaceSchema = z.object({
  id: workspaceIdSchema,
  type: z.enum(["personal", "team"]).default("personal"),
  ownerSubject: z.string(),
  name: z.string(),
  createdAt: z.string(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const userProfileSchema = z.object({
  subject: z.string(),
  name: z.string().default(""),
  email: z.string().nullable().default(null),
  avatarUrl: z.string().nullable().default(null),
  defaultQuality: z.enum(["economy", "balanced", "best"]).default("balanced"),
  defaultLanguage: z.string().default("zh-CN"),
  notifyEmail: z.boolean().default(false),
  workspaceId: workspaceIdSchema,
  createdAt: z.string(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/* ------------------------------------------------------------------ */
/* Barrel                                                                */
/* ------------------------------------------------------------------ */

export * as events from "./events.js";

export const nowIso = (): string => new Date().toISOString();

export const nextId = (prefix: string): string => {
  const uuid = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
  return `${prefix}_${uuid}`;
};
