import { redirectToUnifiedLogin } from "../auth/session.js";

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/v1";
export const SSE_URL = (import.meta.env.VITE_SSE_URL as string | undefined) ?? "/api/v1/events";
export const PUBLIC_GATEWAY_BASE =
  (import.meta.env.VITE_PUBLIC_GATEWAY_BASE as string | undefined) ?? "http://localhost:3004";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly recoveries: string[] = [],
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    params?: Record<string, string | number | boolean | undefined>;
  } = {},
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };
  const res = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    if (res.status === 401) redirectToUnifiedLogin();
    let problem: { code?: string; detail?: string; recoveries?: string[] } = {};
    try {
      problem = (await res.json()) as typeof problem;
    } catch {
      problem = {};
    }
    throw new ApiError(
      res.status,
      problem.code ?? "ERROR",
      problem.detail ?? `请求失败 (${res.status})`,
      problem.recoveries ?? [],
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function uploadFile<T>(
  path: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<T> {
  return uploadFiles(path, [file], fields);
}

export async function uploadFiles<T>(
  path: string,
  files: File[],
  fields: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const file of files) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    form.append("file", file, relativePath || file.name);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    if (res.status === 401) redirectToUnifiedLogin();
    let problem: { code?: string; detail?: string } = {};
    try {
      problem = (await res.json()) as typeof problem;
    } catch {
      problem = {};
    }
    throw new ApiError(res.status, problem.code ?? "ERROR", problem.detail ?? "上传失败");
  }
  return (await res.json()) as T;
}

export async function downloadFile(path: string, fileName: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
  });
  if (!res.ok) {
    if (res.status === 401) redirectToUnifiedLogin();
    let problem: { code?: string; detail?: string } = {};
    try {
      problem = (await res.json()) as typeof problem;
    } catch {
      problem = {};
    }
    throw new ApiError(res.status, problem.code ?? "ERROR", problem.detail ?? "下载失败");
  }
  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = responseDownloadName(res.headers.get("content-disposition")) ?? fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function responseDownloadName(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename="?([^";]+)"?/i.exec(contentDisposition)?.[1] ?? null;
}

/* ---------------- shared types (lightweight mirrors) ---------------- */

export interface Asset {
  id: string;
  workspaceId: string;
  ownerSubject: string;
  ownerDisplayName?: string;
  type: string;
  title: string;
  description: string;
  visibility: string;
  status: string;
  tags: string[];
  sourceType: string;
  currentVersionId: string | null;
  lockVersion: number;
  deletedAt: string | null;
  publishedUrl: string | null;
  createdAt: string;
  updatedAt: string;
  content?: {
    kind: string;
    text?: string | null;
    manifest?: Record<string, unknown> | null;
    refs?: Array<{
      role: string;
      objectKey: string;
      contentHash: string;
      size: number;
      mediaType: string;
      fileName?: string;
    }>;
  };
}

export interface Task {
  id: string;
  workspaceId: string;
  ownerSubject?: string;
  type: string;
  goal: string;
  status: string;
  progress: number;
  currentStep: string;
  spec: Record<string, unknown>;
  plan?: Record<string, unknown> | null;
  checkpoint?: Record<string, unknown> | null;
  inputAssetIds?: string[];
  outputAssetIds: string[];
  creditsUsed: number;
  error: string | null;
  cancelRequested: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps?: TaskStep[];
  outputs?: Asset[];
  evidence?: Array<Record<string, unknown>>;
}

export interface TaskStep {
  id: string;
  taskId: string;
  type: string;
  status: string;
  progress: number;
  detail: string;
  error: string | null;
  attempt?: number;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface KnowledgeBase {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: string;
  sourceCount: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
  sources?: KnowledgeSource[];
}

export interface KnowledgeSource {
  id: string;
  kbId: string;
  sourceType: string;
  url: string | null;
  title: string;
  status: string;
  error: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Dataset {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  currentVersionId: string | null;
  status: string;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
  currentVersion?: DatasetVersion;
  views?: SavedView[];
  charts?: ChartSpec[];
}

export interface DatasetVersion {
  id: string;
  datasetId: string;
  version: number;
  fileName: string;
  format: string;
  rowCount: number;
  columnCount: number;
  schema: Array<{
    columnId: string;
    name: string;
    type: string;
    nullable: boolean;
    distinctCount: number;
  }>;
  profile: Record<string, unknown>;
  qualityIssues: Array<Record<string, unknown>>;
  status: string;
  createdAt: string;
}

export interface SavedView {
  id: string;
  datasetId: string;
  name: string;
  query: Record<string, unknown>;
}

export interface ChartSpec {
  id: string;
  datasetId: string;
  name: string;
  chartType: string;
  x: string | null;
  y: string | null;
  groupBy: string | null;
  aggregation: string;
}

export interface Publish {
  id: string;
  assetId: string;
  slug: string;
  shortSlug: string;
  visibility: string;
  expiresAt: string | null;
  allowDownload: boolean;
  allowCopy: boolean;
  activeReleaseId: string | null;
  viewCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  url?: string;
  shortUrl?: string;
  stats?: {
    views: number;
    uniqueVisitors: number;
    daily: Array<{ day: string; views: number; uniqueVisitors: number }>;
  };
}

export interface PublishStatsSummary {
  views: number;
  uniqueVisitors: number;
  averageLikes: number;
  averageWatchSeconds: number;
  growthRate: number;
  daily: Array<{ day: string; views: number; uniqueVisitors: number }>;
}

export async function publishedShortUrl(assetId: string): Promise<string | null> {
  const publishes = await api<Publish[]>("/publishes", { params: { assetId } });
  const active = publishes.find((publish) => publish.status === "active");
  return active?.shortUrl ?? null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface CreditAccount {
  id: string;
  workspaceId: string;
  balance: number;
  totalGranted: number;
  totalUsed: number;
}

export interface Template {
  id: string;
  type: string;
  name: string;
  description: string;
  content: Record<string, unknown>;
  usageCount: number;
}

export interface HomeData {
  recentAssets: Asset[];
  runningTasks: Task[];
  unreadNotifications: number;
  credits: number;
  templates: Template[];
}

export interface McpConfig {
  id: string;
  workspaceId: string;
  enabled: boolean;
  scope: string;
  scopeIds: string[];
  writeEnabled: boolean;
  serverUrl: string;
  updatedAt: string;
}

export interface ApiToken {
  id: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface SearchResult {
  assets: Asset[];
  tasks: Task[];
  knowledgeBases: KnowledgeBase[];
}
