import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  type AssetLinkResolver,
  renderPresentationHtml,
  stripPresentationPlatformShell,
  rewriteAssetLinks,
  validatePresentationHtml,
  validatePresentationHtmlVisualQuality,
} from "@shiguang/content";
import type { PresentationDocument } from "@shiguang/contracts";

const require = createRequire(import.meta.url);
let cachedEchartsJs: string | null = null;

/** 读取内联 ECharts 压缩包（approved dependency）；不可用时返回空串，SG.chart 回退原生 SVG。 */
export function loadEchartsJs(): string {
  if (cachedEchartsJs === null) {
    try {
      cachedEchartsJs = readFileSync(require.resolve("echarts/dist/echarts.min.js"), "utf8");
    } catch {
      cachedEchartsJs = "";
    }
  }
  return cachedEchartsJs;
}

/** 把 manifest（dataset/chart/source 等结构化内容）渲染为一个可读的 JSON 查看页。 */
export function renderManifestHtml(title: string, data: unknown): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #f7f8fb; color: #172033; }
  main { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
  h1 { font-size: 20px; border-bottom: 1px solid #e5e7ef; padding-bottom: 12px; }
  pre { white-space: pre-wrap; word-break: break-word; background: #fff; border: 1px solid #e5e7ef; border-radius: 8px; padding: 16px; font-size: 13px; line-height: 1.6; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<pre>${escapeHtml(JSON.stringify(data ?? {}, null, 2))}</pre>
</main>
</body>
</html>`;
}

export function buildReleaseBundle(input: {
  assetType: string;
  title: string;
  markdown?: string;
  html?: string;
  presentation?: PresentationDocument;
  resolveAssetLink?: AssetLinkResolver;
}): {
  files: Array<{ path: string; content: string; mediaType: string }>;
  manifest: Record<string, unknown>;
} {
  const files: Array<{ path: string; content: string; mediaType: string }> = [];
  const resolve = input.resolveAssetLink;
  if (input.assetType === "presentation") {
    const presentationHtml =
      input.html ??
      (input.presentation
        ? renderPresentationHtml(input.presentation, input.title, { echartsJs: loadEchartsJs() })
        : "");
    const sourcePresentationHtml = stripPresentationPlatformShell(
      resolve ? rewriteAssetLinks(presentationHtml, resolve) : presentationHtml,
    );
    const issues = validatePresentationHtml(sourcePresentationHtml);
    if (issues.length > 0) {
      throw new Error(`演示 HTML 校验失败: ${issues.map((issue) => issue.message).join("; ")}`);
    }
    const visualIssues = validatePresentationHtmlVisualQuality(sourcePresentationHtml);
    const blockingVisualIssues = visualIssues.filter((issue) => issue.severity === "error");
    if (blockingVisualIssues.length > 0) {
      throw new Error(
        `演示视觉 QA 失败: ${blockingVisualIssues.map((issue) => issue.message).join("; ")}`,
      );
    }
    // Presentations are served from the asset version and composed by SSR at
    // request time. Do not persist a platform-owned index.html in the release.
  } else if (input.assetType === "html" && input.html) {
    const rendered = resolve ? rewriteAssetLinks(input.html, resolve) : input.html;
    files.push({ path: "index.html", content: rendered, mediaType: "text/html" });
  } else {
    const markdown = input.markdown ?? "";
    files.push({ path: "index.md", content: markdown, mediaType: "text/markdown" });
  }
  const manifest = {
    schemaVersion: 1,
    entrypoint:
      input.assetType === "document" || input.assetType === "report" || input.assetType === "file"
        ? "index.md"
        : input.assetType === "presentation"
          ? "presentation-source"
          : "index.html",
    title: input.title,
    assetType: input.assetType,
    files: files.map((f) => ({
      path: f.path,
      mediaType: f.mediaType,
      size: Buffer.byteLength(f.content),
    })),
    csp: "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https:; connect-src 'self'",
  };
  return { files, manifest };
}

export interface PublishDownloadAction {
  label: string;
  href: string;
}

export interface PublishDownloadActionOptions {
  /** Presentation player consumes the link itself; do not render a top-right toolbar. */
  presentation?: boolean;
}

export function injectPublishDownloadActions(
  html: string,
  actions: PublishDownloadAction[],
  options: PublishDownloadActionOptions = {},
): string {
  if (actions.length === 0) return html;
  const links = actions
    .map(
      (action) =>
        `<a class="sg-publish-download" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`,
    )
    .join("");
  const panel = options.presentation
    ? `<nav class="sg-publish-downloads" data-sg-player-downloads hidden aria-hidden="true">${links}</nav>`
    : `<style>
  .sg-publish-downloads { position:fixed; right:20px; top:20px; z-index:1000; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; max-width:min(520px,calc(100vw - 32px)); }
  .sg-publish-download { display:inline-flex; align-items:center; min-height:36px; padding:7px 12px; border:1px solid rgba(109,93,252,.35); border-radius:7px; color:#fff; background:#6d5dfc; box-shadow:0 8px 24px rgba(23,32,51,.16); font:500 14px/1.4 -apple-system,"PingFang SC",sans-serif; text-decoration:none; }
  .sg-publish-download:hover { background:#5d4ee6; }
  @media (max-width:640px) { .sg-publish-downloads { position:static; margin:16px; justify-content:flex-start; } }
</style><nav class="sg-publish-downloads" aria-label="下载">${links}</nav>`;
  return html.includes("</body>") ? html.replace("</body>", `${panel}</body>`) : `${html}${panel}`;
}

export function injectPublishAccessPolicy(
  html: string,
  input: { visibility: string; allowCopy: boolean },
): string {
  const robots =
    input.visibility === "public"
      ? '<meta name="robots" content="index,follow">'
      : '<meta name="robots" content="noindex,nofollow">';
  const copyProtection = input.allowCopy
    ? ""
    : `<style>body { -webkit-user-select:none; user-select:none; }</style>
<script>document.addEventListener("copy", function (event) { event.preventDefault(); }); document.addEventListener("cut", function (event) { event.preventDefault(); }); document.addEventListener("contextmenu", function (event) { event.preventDefault(); });</script>`;
  const withRobots = html.includes("</head>")
    ? html.replace("</head>", `${robots}</head>`)
    : `${robots}${html}`;
  return copyProtection && withRobots.includes("</body>")
    ? withRobots.replace("</body>", `${copyProtection}</body>`)
    : `${withRobots}${copyProtection}`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
