import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  type AssetLinkResolver,
  renderPresentationHtml,
  rewriteAssetLinks,
  validatePresentationHtml,
} from "@shiguang/content";
import type { PresentationDocument } from "@shiguang/contracts";
import { marked } from "marked";

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

const SHELL_CSS = `
  :root { color-scheme: light dark; --fg:#172033; --bg:#f7f8fb; --accent:#6d5dfc; --muted:#667085; --border:#e5e7ef; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif; color: var(--fg); background: var(--bg); line-height: 1.7; }
  .doc { max-width: 860px; margin: 0 auto; padding: 48px 24px 96px; }
  h1,h2,h3 { line-height: 1.3; }
  h1 { font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: .4em; }
  code { background: rgba(109,93,252,.08); border-radius: 4px; padding: .15em .35em; font-size: .92em; }
  pre { background: #101625; color: #e6e9f2; padding: 16px; border-radius: 10px; overflow: auto; }
  pre code { background: transparent; color: inherit; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th,td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
  blockquote { border-left: 4px solid var(--accent); margin: 1em 0; padding: .4em 1em; color: var(--muted); background: rgba(109,93,252,.05); }
  a { color: var(--accent); }
  img { max-width: 100%; }
  .muted { color: var(--muted); }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: .85em; }
  @media (max-width: 640px) { .doc { padding: 24px 16px 64px; } }
`;

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

export function renderMarkdownHtml(markdown: string, title: string): string {
  const body = marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string;
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>${SHELL_CSS}</style>
</head>
<body>
<main class="doc">
${body}
<footer>由 Shiguang Lab 发布 · <span class="muted">保持版本化，内容可追溯</span></footer>
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
    const issues = validatePresentationHtml(presentationHtml);
    if (issues.length > 0) {
      throw new Error(`演示 HTML 校验失败: ${issues.map((issue) => issue.message).join("; ")}`);
    }
    files.push({ path: "index.html", content: presentationHtml, mediaType: "text/html" });
  } else if (input.assetType === "html" && input.html) {
    const rendered = resolve ? rewriteAssetLinks(input.html, resolve) : input.html;
    files.push({ path: "index.html", content: rendered, mediaType: "text/html" });
  } else {
    const markdown = input.markdown ?? "";
    const renderedHtml = renderMarkdownHtml(markdown, input.title);
    files.push({
      path: "index.html",
      content: resolve ? rewriteAssetLinks(renderedHtml, resolve) : renderedHtml,
      mediaType: "text/html",
    });
    files.push({ path: "index.md", content: markdown, mediaType: "text/markdown" });
  }
  const manifest = {
    schemaVersion: 1,
    entrypoint: "index.html",
    title: input.title,
    assetType: input.assetType,
    files: files.map((f) => ({
      path: f.path,
      mediaType: f.mediaType,
      size: Buffer.byteLength(f.content),
    })),
    csp: "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
  };
  return { files, manifest };
}

export interface PublishDownloadAction {
  label: string;
  href: string;
}

export function injectPublishDownloadActions(
  html: string,
  actions: PublishDownloadAction[],
): string {
  if (actions.length === 0) return html;
  const links = actions
    .map(
      (action) =>
        `<a class="sg-publish-download" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`,
    )
    .join("");
  const panel = `<style>
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
