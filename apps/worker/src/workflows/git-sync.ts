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

  try {
    let files: Array<{ path: string; content: string }> = [];
    await step(ctx, "git.fetch", 40, "拉取仓库内容", async () => {
      files = fetchRepoFiles(connection);
      if (files.length === 0) throw new Error("仓库中没有可导入的文档文件");
    });

    await step(ctx, "git.import", 90, "导入文档资产", async () => {
      const outputs = files.map((file) => {
        const isHtml = file.path.toLowerCase().endsWith(".html");
        return {
          kind: "git-document",
          assetType: isHtml ? "html" : "document",
          title: titleFromPath(file.path),
          content: {
            kind: isHtml ? "html" : "markdown",
            text: file.content.slice(0, 500_000),
          },
        };
      });
      const result = await ctx.api.projectResult({
        resultSchema: "git-sync-result/v1",
        taskId: ctx.taskId,
        runId: ctx.runId,
        attempt: 1,
        outputs,
        failures: [],
      });
      if (!result.ok) throw new Error("git import projection failed");
      await ctx.api
        .postInternal(`/internal/v1/git/${connectionId}/status`, {
          status: "idle",
          lastSyncStatus: `imported ${outputs.length} documents`,
        })
        .catch(() => undefined);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.api
      .postInternal(`/internal/v1/git/${connectionId}/status`, {
        status: "failed",
        lastSyncStatus: "failed",
        lastError: message,
      })
      .catch(() => undefined);
    throw err;
  }
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
  const candidates = [
    connection.local_dir,
    connection.provider === "local" ? connection.repo_url : null,
  ].filter((v): v is string => Boolean(v && v.trim()));
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // try next candidate
    }
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
