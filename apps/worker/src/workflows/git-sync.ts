import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { type StepContext, step } from "./helpers.js";

interface GitConnection {
  id: string;
  name: string;
  provider: string;
  repo_url: string;
  branch: string;
  sync_path: string;
  local_dir: string | null;
  workspace_id: string;
}

export async function runGitSyncWorkflow(
  ctx: StepContext,
  spec: Record<string, unknown>,
): Promise<void> {
  const connectionId = String(spec.connectionId ?? "");
  const connection = await ctx.api.getInternal<GitConnection>(`/internal/v1/git/${connectionId}`);

  let files: Array<{ path: string; content: string }> = [];
  await step(ctx, "git.fetch", 40, "拉取仓库内容", async () => {
    files = await fetchRepoFiles(connection);
    if (files.length === 0) throw new Error("仓库中没有可导入的文档文件");
  });

  await step(ctx, "git.import", 90, "导入文档资产", async () => {
    const outputs = files.map((file) => ({
      kind: "git-document",
      assetType: "document",
      title: titleFromPath(file.path),
      content: { markdown: file.content.slice(0, 500_000) },
    }));
    const result = await ctx.api.projectResult({
      resultSchema: "git-sync-result/v1",
      taskId: ctx.taskId,
      runId: ctx.runId,
      attempt: 1,
      outputs,
      usage: { inputTokens: 0, outputTokens: 0, providerCostMicros: 0, creditUnits: 20 },
      failures: [],
    });
    if (!result.ok) throw new Error("git import projection failed");
    await ctx.api
      .postInternal(`/internal/v1/git/${connectionId}/status`, {
        status: "success",
        lastSyncStatus: `imported ${outputs.length} documents`,
      })
      .catch(() => undefined);
  });
}

function fetchRepoFiles(connection: GitConnection): Array<{ path: string; content: string }> {
  const sourceDir = resolveSourceDir(connection);
  const root = sourceDir ?? cloneRepo(connection);
  const syncPath = normalizeSyncPath(connection.sync_path);
  const base = root ? join(root, syncPath) : null;
  if (!base) return [];
  const out: Array<{ path: string; content: string }> = [];
  walk(base, out, "");
  if (root && !sourceDir) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  return out;
}

function resolveSourceDir(connection: GitConnection): string | null {
  if (!connection.local_dir) return null;
  try {
    if (statSync(connection.local_dir).isDirectory()) return connection.local_dir;
  } catch {
    return null;
  }
  return null;
}

function cloneRepo(connection: GitConnection): string {
  const dir = mkdtempSync(join(tmpdir(), "sg-git-"));
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--branch", connection.branch || "main", connection.repo_url, dir],
    { stdio: "pipe", timeout: 60_000 },
  );
  return dir;
}

function normalizeSyncPath(syncPath: string): string {
  const cleaned = syncPath.replace(/^\/+|\/+$/g, "");
  return cleaned === "" || cleaned === "." ? "" : cleaned;
}

function walk(dir: string, out: Array<{ path: string; content: string }>, prefix: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let info: ReturnType<typeof statSync>;
    try {
      info = statSync(full);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      if (!["node_modules", "dist", ".git"].includes(entry)) {
        walk(full, out, prefix ? `${prefix}/${entry}` : entry);
      }
      continue;
    }
    const lower = entry.toLowerCase();
    if (
      !lower.endsWith(".md") &&
      !lower.endsWith(".markdown") &&
      !lower.endsWith(".txt") &&
      !lower.endsWith(".html")
    ) {
      continue;
    }
    try {
      const content = readFileSync(full, "utf8");
      if (content.trim().length === 0) continue;
      out.push({ path: prefix ? `${prefix}/${entry}` : entry, content });
    } catch {
      /* skip unreadable */
    }
  }
}

function titleFromPath(path: string): string {
  const fileName = path.split(sep).pop() ?? path;
  return fileName
    .replace(/\.(md|markdown|txt|html)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export { relative };
