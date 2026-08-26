/**
 * Web Presentation —— 单个 HTML Artifact 渲染与校验。
 *
 * 依据《AI_Web_Presentation 技术设计文档》：
 *   - 最终产物是 presentation.html（HTML + CSS + Vanilla JS + SG Runtime）；
 *   - 页面用 `<section data-sg-page>` 组织，块用 `data-sg-id` / `data-sg-kind` 承载编辑语义；
 *   - Theme 通过 CSS Variables 管理；
 *   - 校验器是安全边界（禁外链依赖 / 危险 JS / 网络能力）。
 *
 * 该模块供 api（发布打包）与 web（编辑预览沙箱）共用。
 */

import { SG_FIXED_STAGE_CSS, SG_RUNTIME_CSS, SG_RUNTIME_JS } from "./presentation-runtime.js";
import { SG_PRESENTATION_PLAYER_JS } from "./presentation-player.js";

/** 渲染输入的宽松结构类型：与 contracts 的 PresentationDocument 兼容，同时允许编辑器侧更宽松的形状。 */
export interface PresentationRenderBlock {
  id: string;
  type: string;
  content: string;
  meta?: Record<string, unknown>;
}
export interface PresentationRenderSlide {
  id: string;
  layoutVariant?: string;
  layout: string;
  title: string;
  blocks: PresentationRenderBlock[];
}
export interface PresentationRenderDocument {
  theme: string;
  aspectRatio?: "16:9" | "4:3" | "9:16";
  slides: PresentationRenderSlide[];
}

export interface PresentationRenderOptions {
  /** 内联的 ECharts JS（仅在含 chart 块时内联；缺省则 SG.chart 回退原生 SVG）。 */
  echartsJs?: string;
}

export type PresentationPlayerMode = "none" | "engine" | "full";

export interface PresentationRuntimeOptions {
  /**
   * 播放器能力在生成 HTML 时声明，而不是由网关运行时改写发布物。
   * full 用于分享/下载 artifact，engine 用于 Web iframe（React 外壳提供 UI），
   * none 用于编辑器预览和缩略图。
   */
  player?: PresentationPlayerMode;
}

/**
 * Remove platform-owned presentation chrome from a persisted/generated source.
 * The source HTML remains the AI-authored document; Runtime and Player are
 * attached by the reader at request time. This is also used to migrate older
 * assets that were saved with the previous baked-in shell.
 */
export function stripPresentationPlatformShell(html: string): string {
  let result = html;
  result = result.replace(
    /<script\b[^>]*(?:data-sg-platform-runtime|data-sg-presentation-player)[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  // Older generated renderer output had an unmarked SG.presentation script.
  result = result.replace(
    /<script\b[^>]*>[\s\S]*?(?:SG\.presentation|document\.getElementById\(["']sg-(?:prev|next)["']\))[\s\S]*?<\/script>/gi,
    "",
  );
  result = result.replace(/<div\b[^>]*id=["']sg-progress["'][^>]*>[\s\S]*?<\/div>/gi, "");
  result = result.replace(/<div\b[^>]*id=["']sg-page-no["'][^>]*>[\s\S]*?<\/div>/gi, "");
  result = result.replace(/<div\b[^>]*class=["'][^"']*\bsg-nav\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
  result = result.replace(/<nav\b[^>]*class=["'][^"']*\bsg-nav\b[^"']*["'][^>]*>[\s\S]*?<\/nav>/gi, "");
  result = result.replace(/<nav\b[^>]*data-sg-player-downloads[^>]*>[\s\S]*?<\/nav>/gi, "");
  return result;
}

const GENERATED_RUNTIME_STYLE_MARKER = "data-sg-platform-stage";
const GENERATED_RUNTIME_SCRIPT_MARKER = "data-sg-platform-runtime";
const PRESENTATION_FAVICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+CiAgPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjI2IiBoZWlnaHQ9IjI2IiByeD0iOCIgZmlsbD0iIzcxMzdmZiIgLz4KICA8ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg0LjQgNC40KSBzY2FsZSguOSkiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjEuOCI+CiAgICA8cmVjdCB3aWR0aD0iNyIgaGVpZ2h0PSI3IiB4PSIxNCIgeT0iMyIgcng9IjEiIC8+CiAgICA8cGF0aCBkPSJNMTAgMjFWOGExIDEgMCAwIDAtMS0xSDRhMSAxIDAgMCAwLTEgMXYxMmExIDEgMCAwIDAgMSAxaDEyYTEgMSAwIDAgMCAxLTF2LTVhMSAxIDAgMCAwLTEtMUgzIiAvPgogIDwvZz4KPC9zdmc+Cg==";

function ensurePresentationPageIds(html: string): string {
  return html.replace(
    /<section\b([^>]*\bdata-sg-page(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*)>/gi,
    (full, attrs: string) => {
      if (/(?:^|\s)id\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(attrs)) return full;
      const match = attrs.match(/\bdata-sg-id\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i);
      return match ? `<section${attrs} id=${match[1]}>` : full;
    },
  );
}

function presentationPlayerScript(mode: "engine" | "full"): string {
  return `<script data-sg-presentation-player data-sg-player-ui="${mode === "full" ? "true" : "false"}">${SG_PRESENTATION_PLAYER_JS}</script>`;
}

/**
 * 给 AI 自由生成的 HTML 补上平台级固定画布与播放控制。
 * 只注入舞台不变量和 SG 行为，不覆盖 AI 自己的字体、配色和构图。
 */
export function ensurePresentationRuntimeHtml(
  html: string,
  options: PresentationRuntimeOptions = {},
): string {
  // Legacy artifacts may carry only data-sg-id on their page sections while
  // generated page CSS targets #page-N. Normalize this at every runtime
  // boundary so existing editor, iframe and public snapshots render alike.
  let result = ensurePresentationPageIds(html);
  // Published presentation artifacts are standalone documents. Inline the
  // favicon because root assets on the product domain pass through login.
  const favicon = `<link rel="icon" type="image/svg+xml" href="${PRESENTATION_FAVICON}">`;
  if (/<link\b[^>]*rel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*>/i.test(result)) {
    result = result.replace(
      /<link\b[^>]*rel\s*=\s*["'](?:shortcut\s+)?icon["'][^>]*>/gi,
      favicon,
    );
  } else {
    result = result.includes("</head>")
      ? result.replace("</head>", `${favicon}</head>`)
      : `${favicon}${result}`;
  }
  const stageStyle = `<style ${GENERATED_RUNTIME_STYLE_MARKER}>${SG_FIXED_STAGE_CSS}</style>`;
  const stageStylePattern = new RegExp(
    `<style\\b[^>]*${GENERATED_RUNTIME_STYLE_MARKER}[^>]*>[\\s\\S]*?<\\/style>`,
    "i",
  );
  if (stageStylePattern.test(result)) {
    result = result.replace(stageStylePattern, stageStyle);
  } else {
    result = result.includes("</head>")
      ? result.replace("</head>", `${stageStyle}</head>`)
      : `${stageStyle}${result}`;
  }
  const runtime = `<script ${GENERATED_RUNTIME_SCRIPT_MARKER}>${SG_RUNTIME_JS}\n(function(){\n  function start(){\n    if (!window.SG || !window.SG.presentation || window.__sgPlatformPresentation) return;\n    window.__sgPlatformPresentation = window.SG.presentation({ mode: "slide", keyboard: true, touch: true });\n  }\n  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();\n})();</script>`;
  const runtimePattern = new RegExp(
    `<script\\b[^>]*${GENERATED_RUNTIME_SCRIPT_MARKER}[^>]*>[\\s\\S]*?<\\/script>`,
    "i",
  );
  if (runtimePattern.test(result)) {
    // 旧演示也要升级 Runtime，否则旧版 SG.chart 会清空 AI 已生成的 SVG。
    result = result.replace(runtimePattern, runtime);
  } else {
    result = result.includes("</body>")
      ? result.replace("</body>", `${runtime}</body>`)
      : `${result}${runtime}`;
  }
  const playerMode = options.player ?? "none";
  const playerPattern = /<script\b[^>]*data-sg-presentation-player[^>]*>[\s\S]*?<\/script>/gi;
  if (playerMode === "none") {
    result = result.replace(playerPattern, "");
  } else if (playerPattern.test(result)) {
    result = result.replace(playerPattern, presentationPlayerScript(playerMode));
  } else {
    const player = presentationPlayerScript(playerMode);
    result = result.includes("</body>")
      ? result.replace("</body>", `${player}</body>`)
      : `${result}${player}`;
  }
  return result;
}

/** Compose the current public player/access shell around persisted source HTML. */
export function renderPresentationAccessHtml(
  html: string,
  options: {
    visibility?: string;
    allowCopy?: boolean;
    downloadHref?: string;
    downloadLabel?: string;
  } = {},
): string {
  let result = ensurePresentationRuntimeHtml(stripPresentationPlatformShell(html), { player: "full" });
  if (options.downloadHref) {
    const link = `<a class="sg-publish-download" href="${escapeAttr(options.downloadHref)}">${escapeHtml(options.downloadLabel ?? "下载演示")}</a>`;
    const panel = `<nav class="sg-publish-downloads" data-sg-player-downloads hidden aria-hidden="true">${link}</nav>`;
    result = result.includes("</body>") ? result.replace("</body>", `${panel}</body>`) : `${result}${panel}`;
  }
  const robots = options.visibility === "public"
    ? '<meta name="robots" content="index,follow">'
    : '<meta name="robots" content="noindex,nofollow">';
  if (!/name=["']robots["']/i.test(result)) {
    result = result.includes("</head>") ? result.replace("</head>", `${robots}</head>`) : `${robots}${result}`;
  }
  if (options.allowCopy === false) {
    const protection = `<style data-sg-publish-copy-protection>body{-webkit-user-select:none;user-select:none}</style><script data-sg-publish-copy-protection>document.addEventListener("copy",function(e){e.preventDefault()});document.addEventListener("cut",function(e){e.preventDefault()});document.addEventListener("contextmenu",function(e){e.preventDefault()});</script>`;
    result = result.includes("</body>") ? result.replace("</body>", `${protection}</body>`) : `${result}${protection}`;
  }
  return result;
}

export function renderPresentationHtml(
  doc: PresentationRenderDocument,
  title: string,
  options: PresentationRenderOptions = {},
): string {
  // 发布/编辑链路都以 renderer 为最后一道保障：即使上游 AI 返回了内容页起始的
  // 不完整计划，也必须补出可播放的封面，避免首屏直接落在正文。
  const slides =
    doc.slides[0]?.layout === "title"
      ? doc.slides
      : [
          {
            id: "s-cover",
            layout: "title",
            layoutVariant: "hero-center",
            title,
            blocks: [
              { id: "b-cover", type: "text", content: "从北京出发，把复杂内容讲清楚。", meta: {} },
            ],
          },
          ...doc.slides,
        ];
  const pages = slides.map((slide, i) => renderSlide(slide, i)).join("\n");
  const hasChart = slides.some((s) => s.blocks.some((b) => b.type === "chart"));
  const echartsScript =
    hasChart && options.echartsJs ? `<script>${options.echartsJs}</script>` : "";
  return `<!doctype html>
<html lang="zh-CN" data-sg-runtime="presentation">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style data-sg-platform-runtime-style>
${themeCssVariables(doc.theme)}
${SG_RUNTIME_CSS}
</style>
</head>
<body>
${pages}
${echartsScript}
</body>
</html>`;
}

function renderSlide(slide: PresentationRenderSlide, index: number): string {
  const layout = slide.layout || "content";
  const pageId = `page-${slide.id}`;
  const label = escapeHtml(slide.title || `第 ${index + 1} 页`);
  const variant = (slide.layoutVariant ?? "").replace(/[^a-z0-9-]/gi, "");
  const variantClass = variant ? ` class="sg-layout-${variant}"` : "";
  const heading = slide.title
    ? `<h2 class="sg-slide-title" data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text">${escapeHtml(slide.title)}</h2>`
    : "";
  switch (layout) {
    case "title":
      return `<section data-sg-page="title" data-sg-id="${pageId}"${variantClass} aria-label="${label}">
  <div class="sg-cover-atmosphere" aria-hidden="true"><span class="sg-cover-orb"></span><svg class="sg-cover-skyline" viewBox="0 0 1200 300" preserveAspectRatio="none"><path d="M0 274h90v-54h52v54h38v-90h44v90h54v-42h35v42h60V150h30v124h54v-70h45v70h58v-110h38v110h55v-48h46v48h55v-83h38v83h62v-138h32v138h60v-61h44v61h70v-100h34v100h70v-48h46v48h75" fill="currentColor"/></svg></div>
  <div class="sg-cover">
    <span class="sg-cover-eyebrow" data-sg-id="eyebrow-${escapeHtml(slide.id)}" data-sg-kind="text">SHIGUANG LAB</span>
    <h1 class="sg-cover-title" data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text">${escapeHtml(slide.title || "演示文稿")}</h1>
    ${renderBlocks(slide.blocks)}
  </div>
</section>`;
    case "section":
      return `<section data-sg-page="section" data-sg-id="${pageId}"${variantClass} aria-label="${label}">
  <div class="sg-section">
    <span class="sg-section-no">${String(index + 1).padStart(2, "0")}</span>
    <h1 class="sg-section-title" data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text">${escapeHtml(slide.title || "")}</h1>
    ${renderBlocks(slide.blocks)}
  </div>
</section>`;
    case "quote":
      return `<section data-sg-page="quote" data-sg-id="${pageId}"${variantClass} aria-label="${label}">
  <div class="sg-quote-wrap">
    <blockquote class="sg-quote" data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text">${escapeHtml(slide.title || "")}</blockquote>
    ${renderBlocks(slide.blocks)}
  </div>
</section>`;
    case "closing":
      return `<section data-sg-page="closing" data-sg-id="${pageId}"${variantClass} aria-label="${label}">
  <div class="sg-closing">
    <h1 data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text">${escapeHtml(slide.title || "谢谢观看")}</h1>
    ${renderBlocks(slide.blocks)}
  </div>
</section>`;
    default:
      return `<section data-sg-page="${escapeHtml(layout)}" data-sg-id="${pageId}"${variantClass} aria-label="${label}">
  ${heading}
  <div class="sg-page-body sg-${escapeHtml(layout)}">
    ${renderBlocks(slide.blocks)}
  </div>
</section>`;
  }
}

function renderBlocks(blocks: PresentationRenderBlock[]): string {
  return blocks.map((block, bi) => renderSlideBlock(block, bi)).join("\n");
}

function renderSlideBlock(block: PresentationRenderBlock, index: number): string {
  const id = block.id || `b-${index}`;
  const enter = "";
  const meta = (block.meta ?? {}) as Record<string, unknown>;
  switch (block.type) {
    case "heading":
      return `<h3 class="sg-h" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${escapeHtml(block.content)}</h3>`;
    case "text":
      return `<p class="sg-p" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${escapeHtml(block.content)}</p>`;
    case "bullet":
      return `<ul class="sg-ul" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${block.content
        .split("\n")
        .filter(Boolean)
        .map((line) => `<li><span class="sg-bullet-dot"></span>${escapeHtml(line)}</li>`)
        .join("")}</ul>`;
    case "image": {
      const source = String(meta.sourceRef ?? "").trim();
      const alt = String(meta.alt ?? meta.caption ?? "").trim();
      const focalPoint = ["left", "center", "right"].includes(String(meta.focalPoint))
        ? String(meta.focalPoint)
        : "center";
      return `<figure class="sg-figure"${source ? ` data-sg-source="${escapeAttr(source)}"` : ""}${enter}><img data-sg-id="${escapeHtml(id)}" data-sg-kind="image" src="${escapeAttr(block.content)}" alt="${escapeAttr(alt)}" loading="lazy" style="object-position:${focalPoint}" /><figcaption>${escapeHtml(String(meta.caption ?? ""))}</figcaption></figure>`;
    }
    case "chart": {
      const config = chartConfig(block);
      const source = String(meta.sourceRef ?? "").trim();
      return `<div class="sg-chart" data-sg-id="${escapeHtml(id)}" data-sg-kind="chart"${source ? ` data-sg-source="${escapeAttr(source)}"` : ""} data-sg-chart='${escapeAttr(JSON.stringify(config))}'${enter}></div>`;
    }
    case "metric": {
      const value = String(meta.value ?? block.content);
      const unit = String(meta.unit ?? "").trim();
      const source = String(meta.sourceRef ?? "").trim();
      return `<div class="sg-metric-card" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${source ? ` data-sg-source="${escapeAttr(source)}"` : ""} data-sg-hover="lift"${enter}>
  <span class="sg-metric-label">${escapeHtml(String(meta.label ?? ""))}</span>
  <strong class="sg-metric-value">${escapeHtml(`${value}${unit ? ` ${unit}` : ""}`)}</strong>
  <span class="sg-metric-note">${escapeHtml(String(meta.note ?? ""))}</span>
</div>`;
    }
    case "card":
      if (meta.visual === "process") {
        const steps = block.content.split(/\r?\n/).filter(Boolean);
        return `<div class="sg-process" data-sg-id="${escapeHtml(id)}" data-sg-kind="card"${enter}>${steps
          .map(
            (step, i) =>
              `<div class="sg-process-step"><span>${String(i + 1).padStart(2, "0")}</span><p>${escapeHtml(step.replace(/^\s*[^：:]+[：:]/, ""))}</p></div>`,
          )
          .join("")}</div>`;
      }
      if (meta.visual === "rising") {
        const points = block.content.split(/\r?\n/).filter(Boolean);
        return `<div class="sg-rise" data-sg-id="${escapeHtml(id)}" data-sg-kind="card"${enter}><div class="sg-rise-line"></div>${points
          .map(
            (point, i) =>
              `<div class="sg-rise-point" style="--rise:${Math.round(((i + 1) / Math.max(points.length, 1)) * 78)}%"><i></i><span>${escapeHtml(point)}</span></div>`,
          )
          .join("")}</div>`;
      }
      if (meta.visual === "quadrant") {
        const cells = block.content.split(/\r?\n/).filter(Boolean).slice(0, 4);
        return `<div class="sg-quadrant" data-sg-id="${escapeHtml(id)}" data-sg-kind="card"${enter}><span class="sg-quadrant-axis x"></span><span class="sg-quadrant-axis y"></span>${cells
          .map(
            (cell, i) =>
              `<div class="sg-quadrant-cell q${i + 1}"><b>${escapeHtml(cell.split(/[：:]/)[0] || `象限 ${i + 1}`)}</b><small>${escapeHtml(cell.split(/[：:]/).slice(1).join("：") || "")}</small></div>`,
          )
          .join(
            "",
          )}<em class="sg-quadrant-label top">高影响</em><em class="sg-quadrant-label right">高可行</em></div>`;
      }
      return `<div class="sg-card-block" data-sg-id="${escapeHtml(id)}" data-sg-kind="text" data-sg-hover="lift"${enter}>
  ${meta.title ? `<strong class="sg-card-title">${escapeHtml(String(meta.title))}</strong>` : ""}
  <p class="sg-card-body">${escapeHtml(block.content)}</p>
</div>`;
    case "timeline":
      return `<div class="sg-timeline" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${block.content
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [period = "", ...rest] = line.split("：");
          const text = (rest.length ? rest.join("：") : line).trim();
          return `<div class="sg-timeline-item"><span class="sg-timeline-dot"></span><div><b>${escapeHtml(period.trim())}</b><p>${escapeHtml(text)}</p></div></div>`;
        })
        .join("")}</div>`;
    case "divider":
      return `<hr class="sg-divider" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter} />`;
    case "quote":
      return `<blockquote class="sg-blockquote" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${escapeHtml(block.content)}${meta.author ? `<cite>— ${escapeHtml(String(meta.author))}</cite>` : ""}</blockquote>`;
    case "table":
      return renderTableBlock(block, id, enter);
    case "code":
      return `<pre class="sg-code" data-sg-id="${escapeHtml(id)}" data-sg-kind="code-island"${enter}><code>${escapeHtml(block.content)}</code></pre>`;
    default:
      return `<p class="sg-p" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${escapeHtml(block.content)}</p>`;
  }
}

function renderTableBlock(block: PresentationRenderBlock, id: string, enter: string): string {
  const rows = block.content
    .split(/\r?\n/)
    .map((row) => row.split(/\t|\s*\|\s*/).map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  if (rows.length < 2) {
    return `<pre class="sg-pre" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${escapeHtml(block.content)}</pre>`;
  }
  const [head = [], ...body] = rows;
  return `<div class="sg-data-table-wrap" data-sg-id="${escapeHtml(id)}" data-sg-kind="table"${enter}><table class="sg-data-table"><thead><tr>${head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${body
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

function chartConfig(block: PresentationRenderBlock): Record<string, unknown> {
  const meta = block.meta as { chart?: Record<string, unknown> } | undefined;
  if (meta?.chart) return meta.chart;
  const numbers = (block.content.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).slice(0, 8);
  // 没有真实数据时保持空序列，绝不注入占位数字；质量门禁会在生成阶段阻止这类图表。
  return { type: "bar", data: numbers };
}

export interface ThemePalette {
  background: string;
  textPrimary: string;
  textSecondary: string;
  surface: string;
  primary: string;
}

export function themeCssVariables(theme: string, custom?: ThemePalette | null): string {
  const light: [string, string, string, string, string] = [
    "#ffffff",
    "#172033",
    "#667085",
    "#f7f8fb",
    "#6d5dfc",
  ];
  const palettes: Record<string, [string, string, string, string, string] | undefined> = {
    light,
    dark: ["#0f1420", "#f5f7ff", "#9aa3b8", "#161b2b", "#8b7bff"],
    brand: ["#ffffff", "#1a2a4f", "#6b7a99", "#f2f4f8", "#f04e2c"],
    minimal: ["#fafafa", "#111111", "#666666", "#f0f0f0", "#888888"],
    gradient: ["#0d0b1e", "#ffffff", "#c4b8e8", "#1a1430", "#7c5cff"],
  };
  const base = palettes[theme] ?? light;
  const [bg, fg, secondary, surface, primary] = custom
    ? [custom.background, custom.textPrimary, custom.textSecondary, custom.surface, custom.primary]
    : base;
  return `:root { --sg-background: ${bg}; --sg-text-primary: ${fg}; --sg-text-secondary: ${secondary}; --sg-surface: ${surface}; --sg-primary: ${primary}; --sg-accent: ${primary}; }`;
}

/** 内置配色预设（供编辑器色板选择，含主色 + 背景基调）。 */
export const THEME_PRESETS: { key: string; label: string; palette: ThemePalette }[] = [
  {
    key: "purple",
    label: "紫",
    palette: {
      background: "#ffffff",
      textPrimary: "#172033",
      textSecondary: "#667085",
      surface: "#f7f8fb",
      primary: "#7c5cff",
    },
  },
  {
    key: "blue",
    label: "蓝",
    palette: {
      background: "#ffffff",
      textPrimary: "#10243f",
      textSecondary: "#5a708f",
      surface: "#eef4fb",
      primary: "#0ba5ec",
    },
  },
  {
    key: "green",
    label: "绿",
    palette: {
      background: "#ffffff",
      textPrimary: "#10241a",
      textSecondary: "#4f7a63",
      surface: "#eef7f1",
      primary: "#12b76a",
    },
  },
  {
    key: "orange",
    label: "橙",
    palette: {
      background: "#ffffff",
      textPrimary: "#2a1a10",
      textSecondary: "#8a6347",
      surface: "#fbf2ea",
      primary: "#f79009",
    },
  },
  {
    key: "red",
    label: "红",
    palette: {
      background: "#ffffff",
      textPrimary: "#2a1216",
      textSecondary: "#8a5a60",
      surface: "#fbf0f1",
      primary: "#e5484d",
    },
  },
  {
    key: "dark",
    label: "暗夜",
    palette: {
      background: "#0f1420",
      textPrimary: "#f5f7ff",
      textSecondary: "#9aa3b8",
      surface: "#161b2b",
      primary: "#8b7bff",
    },
  },
  {
    key: "mono",
    label: "极简灰",
    palette: {
      background: "#fafafa",
      textPrimary: "#111111",
      textSecondary: "#666666",
      surface: "#f0f0f0",
      primary: "#3b3b3b",
    },
  },
];

export interface PresentationValidationIssue {
  code: string;
  message: string;
}

export type PresentationQualitySeverity = "error" | "warning";

export interface PresentationQualityIssue {
  code: string;
  message: string;
  severity: PresentationQualitySeverity;
  slideId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasRenderableVisual(blocks: PresentationRenderBlock[]): boolean {
  return blocks.some((block) =>
    ["image", "chart", "metric", "card", "timeline", "quote", "table", "code"].includes(block.type),
  );
}

/**
 * 对结构化页面计划做生成质量门禁。它不替代截图级 QA，但可以在 HTML 编译前
 * 阻止空图表、缺失指标和明显的纯文本退化，并把可修复的视觉问题记录为 warning。
 */
export function validatePresentationDocumentQuality(
  doc: PresentationRenderDocument,
): PresentationQualityIssue[] {
  const issues: PresentationQualityIssue[] = [];
  if (doc.slides.length === 0) {
    return [{ code: "NO_SLIDES", message: "演示至少需要一页", severity: "error" }];
  }

  let contentSlideCount = 0;
  let visualSlideCount = 0;
  let previousLayout = "";
  for (const slide of doc.slides) {
    if (!slide.title.trim()) {
      issues.push({
        code: "EMPTY_SLIDE_TITLE",
        message: `页面 ${slide.id} 缺少标题`,
        severity: "error",
        slideId: slide.id,
      });
    }
    const isContent = !["title", "section", "closing"].includes(slide.layout);
    if (isContent) contentSlideCount += 1;
    if (hasRenderableVisual(slide.blocks)) visualSlideCount += 1;

    const bulletLines = slide.blocks
      .filter((block) => block.type === "bullet")
      .flatMap((block) => block.content.split(/\r?\n/).filter(Boolean));
    if (bulletLines.length > 4) {
      issues.push({
        code: "BULLET_DENSITY_HIGH",
        message: `页面 ${slide.id} 包含 ${bulletLines.length} 条列表项，建议拆页或改为视觉表达`,
        severity: "warning",
        slideId: slide.id,
      });
    }

    for (const block of slide.blocks) {
      const meta = isRecord(block.meta) ? block.meta : {};
      if (block.type === "chart") {
        const chart = isRecord(meta.chart) ? meta.chart : null;
        const data = chart?.data;
        if (
          !Array.isArray(data) ||
          data.length === 0 ||
          data.some((value) => typeof value !== "number")
        ) {
          issues.push({
            code: "CHART_DATA_MISSING",
            message: `页面 ${slide.id} 的图表缺少可用数据，不能发布伪图表`,
            severity: "error",
            slideId: slide.id,
          });
        }
      }
      if (block.type === "metric") {
        const value = meta.value ?? block.content;
        if (value === null || value === undefined || String(value).trim() === "") {
          issues.push({
            code: "METRIC_VALUE_MISSING",
            message: `页面 ${slide.id} 的指标缺少数值`,
            severity: "error",
            slideId: slide.id,
          });
        }
      }
      if (block.type === "image" && block.content.trim() === "") {
        issues.push({
          code: "IMAGE_SOURCE_MISSING",
          message: `页面 ${slide.id} 的图片缺少可用 src`,
          severity: "error",
          slideId: slide.id,
        });
      }
    }

    if (isContent && !hasRenderableVisual(slide.blocks)) {
      issues.push({
        code: "TEXT_ONLY_SLIDE",
        message: `页面 ${slide.id} 只有文本内容，建议补充图表、指标、图片或结构化组件`,
        severity: "warning",
        slideId: slide.id,
      });
    }
    if (isContent && previousLayout === slide.layout) {
      issues.push({
        code: "REPEATED_LAYOUT",
        message: `页面 ${slide.id} 与上一页连续使用 ${slide.layout} 布局`,
        severity: "warning",
        slideId: slide.id,
      });
    }
    if (isContent) previousLayout = slide.layout;
  }

  if (contentSlideCount >= 5 && visualSlideCount / contentSlideCount < 0.4) {
    issues.push({
      code: "VISUAL_COVERAGE_LOW",
      message: `视觉页面占比仅 ${Math.round((visualSlideCount / contentSlideCount) * 100)}%，建议至少达到 40%`,
      severity: "warning",
    });
  }
  return issues;
}

/** 校验 AI / 生成的演示 HTML。外部脚本和样式由发布策略控制，不在生成校验阶段阻断。 */
export function validatePresentationHtml(html: string): PresentationValidationIssue[] {
  const issues: PresentationValidationIssue[] = [];
  const promptLeakage =
    /(?:^|[\s>])system\s*:\s*|你是\s*Web\s*Presentation\s*生成专家|SG\s*Runtime\s*API|不要输出\s*JSON|不要代码围栏/i;
  if (promptLeakage.test(html)) {
    issues.push({
      code: "PROMPT_CONTENT_LEAKED",
      message: "模型将生成提示词写入了演示内容",
    });
  }
  if (/\beval\s*\(/i.test(html))
    issues.push({ code: "EVAL_NOT_ALLOWED", message: "禁止使用 eval" });
  if (/new\s+Function\s*\(/i.test(html)) {
    issues.push({ code: "NEW_FUNCTION_NOT_ALLOWED", message: "禁止使用 new Function" });
  }
  if (/document\.write\s*\(/i.test(html)) {
    issues.push({ code: "DOCUMENT_WRITE_NOT_ALLOWED", message: "禁止使用 document.write" });
  }
  if (/\bfetch\s*\(/i.test(html)) {
    issues.push({ code: "NETWORK_NOT_ALLOWED", message: "默认禁止 fetch" });
  }
  if (/XMLHttpRequest/i.test(html)) {
    issues.push({ code: "NETWORK_NOT_ALLOWED", message: "默认禁止 XMLHttpRequest" });
  }
  if (/new\s+WebSocket/i.test(html)) {
    issues.push({ code: "NETWORK_NOT_ALLOWED", message: "默认禁止 WebSocket" });
  }
  if (/EventSource/i.test(html)) {
    issues.push({ code: "NETWORK_NOT_ALLOWED", message: "默认禁止 EventSource" });
  }
  if (!/<section[^>]+data-sg-page/i.test(html)) {
    issues.push({ code: "NO_PAGE", message: "演示缺少 data-sg-page 页面" });
  }
  return issues;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/'/g, "&#39;");
}
