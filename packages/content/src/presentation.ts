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

import { SG_RUNTIME_CSS, SG_RUNTIME_JS } from "./presentation-runtime.js";

/** 渲染输入的宽松结构类型：与 contracts 的 PresentationDocument 兼容，同时允许编辑器侧更宽松的形状。 */
export interface PresentationRenderBlock {
  id: string;
  type: string;
  content: string;
  meta?: Record<string, unknown>;
}
export interface PresentationRenderSlide {
  id: string;
  layout: string;
  title: string;
  blocks: PresentationRenderBlock[];
}
export interface PresentationRenderDocument {
  theme: string;
  slides: PresentationRenderSlide[];
}

export interface PresentationRenderOptions {
  /** 内联的 ECharts JS（仅在含 chart 块时内联；缺省则 SG.chart 回退原生 SVG）。 */
  echartsJs?: string;
}

export function renderPresentationHtml(
  doc: PresentationRenderDocument,
  title: string,
  options: PresentationRenderOptions = {},
): string {
  const pages = doc.slides.map((slide, i) => renderSlide(slide, i)).join("\n");
  const hasChart = doc.slides.some((s) => s.blocks.some((b) => b.type === "chart"));
  const echartsScript =
    hasChart && options.echartsJs ? `<script>${options.echartsJs}</script>` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${themeCssVariables(doc.theme)}
${SG_RUNTIME_CSS}
</style>
</head>
<body>
<div class="sg-progress" id="sg-progress"></div>
${pages}
<div class="sg-page-no" id="sg-page-no"></div>
<div class="sg-nav" aria-label="翻页">
  <button id="sg-prev" aria-label="上一页">‹</button>
  <button id="sg-next" aria-label="下一页">›</button>
</div>
${echartsScript}
<script>
${SG_RUNTIME_JS}
var ctrl = SG.presentation({ mode: "slide", keyboard: true, touch: true });
document.getElementById("sg-prev").addEventListener("click", function () { ctrl.prev(); });
document.getElementById("sg-next").addEventListener("click", function () { ctrl.next(); });
</script>
</body>
</html>`;
}

function renderSlide(slide: PresentationRenderSlide, index: number): string {
  const layout = slide.layout || "content";
  const pageId = `page-${slide.id}`;
  const label = escapeHtml(slide.title || `第 ${index + 1} 页`);
  const heading = slide.title
    ? `<h2 class="sg-slide-title" data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text" data-sg-enter="fade-up">${escapeHtml(slide.title)}</h2>`
    : "";
  switch (layout) {
    case "title":
      return `<section data-sg-page="title" data-sg-id="${pageId}" aria-label="${label}">
  <div class="sg-cover" data-sg-enter="fade-up">
    <span class="sg-cover-eyebrow" data-sg-id="eyebrow-${escapeHtml(slide.id)}" data-sg-kind="text">SHIGUANG LAB</span>
    <h1 class="sg-cover-title" data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text">${escapeHtml(slide.title || "演示文稿")}</h1>
    ${renderBlocks(slide.blocks)}
  </div>
</section>`;
    case "section":
      return `<section data-sg-page="section" data-sg-id="${pageId}" aria-label="${label}">
  <div class="sg-section" data-sg-enter="fade-up">
    <span class="sg-section-no">${String(index + 1).padStart(2, "0")}</span>
    <h1 class="sg-section-title" data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text">${escapeHtml(slide.title || "")}</h1>
    ${renderBlocks(slide.blocks)}
  </div>
</section>`;
    case "quote":
      return `<section data-sg-page="quote" data-sg-id="${pageId}" aria-label="${label}">
  <div class="sg-quote-wrap" data-sg-enter="scale">
    <blockquote class="sg-quote" data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text">${escapeHtml(slide.title || "")}</blockquote>
    ${renderBlocks(slide.blocks)}
  </div>
</section>`;
    case "closing":
      return `<section data-sg-page="closing" data-sg-id="${pageId}" aria-label="${label}">
  <div class="sg-closing" data-sg-enter="fade-up">
    <h1 data-sg-id="title-${escapeHtml(slide.id)}" data-sg-kind="text">${escapeHtml(slide.title || "谢谢观看")}</h1>
    ${renderBlocks(slide.blocks)}
  </div>
</section>`;
    default:
      return `<section data-sg-page="${escapeHtml(layout)}" data-sg-id="${pageId}" aria-label="${label}">
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
  const enter = index < 4 ? ` data-sg-enter="fade-up" data-sg-delay="${index * 60}"` : "";
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
    case "image":
      return `<figure class="sg-figure"${enter}><img data-sg-id="${escapeHtml(id)}" data-sg-kind="image" src="${escapeAttr(block.content)}" alt="" loading="lazy" /><figcaption>${escapeHtml(String(meta.caption ?? ""))}</figcaption></figure>`;
    case "chart": {
      const config = chartConfig(block);
      return `<div class="sg-chart" data-sg-id="${escapeHtml(id)}" data-sg-kind="chart" data-sg-chart='${escapeAttr(JSON.stringify(config))}'${enter}></div>`;
    }
    case "metric":
      return `<div class="sg-metric-card" data-sg-id="${escapeHtml(id)}" data-sg-kind="text" data-sg-hover="lift"${enter}>
  <span class="sg-metric-label">${escapeHtml(String(meta.label ?? ""))}</span>
  <strong class="sg-metric-value">${escapeHtml(String(meta.value ?? block.content))}</strong>
  <span class="sg-metric-note">${escapeHtml(String(meta.note ?? ""))}</span>
</div>`;
    case "card":
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
      return `<blockquote class="sg-blockquote" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${escapeHtml(block.content)}</blockquote>`;
    case "table":
      return `<pre class="sg-pre" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${escapeHtml(block.content)}</pre>`;
    case "code":
      return `<pre class="sg-code" data-sg-id="${escapeHtml(id)}" data-sg-kind="code-island"${enter}><code>${escapeHtml(block.content)}</code></pre>`;
    default:
      return `<p class="sg-p" data-sg-id="${escapeHtml(id)}" data-sg-kind="text"${enter}>${escapeHtml(block.content)}</p>`;
  }
}

function chartConfig(block: PresentationRenderBlock): Record<string, unknown> {
  const meta = block.meta as { chart?: Record<string, unknown> } | undefined;
  if (meta?.chart) return meta.chart;
  const numbers = (block.content.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).slice(0, 8);
  return { type: "bar", data: numbers.length > 0 ? numbers : [1, 2, 3] };
}

export function themeCssVariables(theme: string): string {
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
  const [bg, fg, secondary, surface, primary] = palettes[theme] ?? light;
  return `:root { --sg-background: ${bg}; --sg-text-primary: ${fg}; --sg-text-secondary: ${secondary}; --sg-surface: ${surface}; --sg-primary: ${primary}; --sg-accent: ${primary}; }`;
}

export interface PresentationValidationIssue {
  code: string;
  message: string;
}

/**
 * 校验 AI / 生成的演示 HTML。Prompt 不是安全边界：外链依赖、危险 JS 与网络能力默认禁止。
 */
export function validatePresentationHtml(html: string): PresentationValidationIssue[] {
  const issues: PresentationValidationIssue[] = [];
  if (/<script[^>]+src=["'](?!data:)/i.test(html)) {
    issues.push({ code: "EXTERNAL_SCRIPT_NOT_ALLOWED", message: "禁止外部 <script src>" });
  }
  if (/<link[^>]+href=["'](?!data:)/i.test(html)) {
    issues.push({ code: "EXTERNAL_STYLESHEET_NOT_ALLOWED", message: "禁止外部 <link href>" });
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
