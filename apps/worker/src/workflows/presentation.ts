import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  type ChatContentPart,
  type ChatStreamUpdate,
  createAiService,
  loadCapabilityContext,
} from "@shiguang/ai-core";
import { loadCapabilityAgentId } from "@shiguang/config";
import {
  applyPresentationAnnotations,
  ensurePresentationRuntimeHtml,
  instrumentPresentationHtml,
  stripPresentationPlatformShell,
  validatePresentationHtml,
  validatePresentationHtmlVisualQuality,
} from "@shiguang/content";
import type { ObjectStore } from "@shiguang/database";
import type { Logger } from "@shiguang/observability";
import { z } from "zod";
import {
  fitPresentationHtmlToStage,
  type PresentationRenderAudit,
  renderPresentationAudit,
} from "../presentation-renderer.js";
import { loadPresentationPrompt } from "../prompts.js";
import { type StepContext, step } from "./helpers.js";

const require = createRequire(import.meta.url);
const GENERATED_SLIDES_MARKER = "<!-- SG_GENERATED_SLIDES -->";
const PAGE_BATCH_SIZE = 3;
const MAX_REPAIR_CALLS = 4;
const MAX_REPAIR_PASSES = 5;
const MAX_TASK_UNIT_RETRIES = 5;

const annotationSchema = z.object({
  elements: z
    .array(
      z.object({
        id: z.string(),
        role: z.string().optional(),
        editable: z.boolean().optional(),
        groupId: z.string().optional(),
      }),
    )
    .default([]),
});

const presentationPlanSchema = z.object({
  audience: z.string().default("目标受众"),
  coreMessage: z.string().default("清晰传达核心观点"),
  narrative: z.string().default("问题、洞察与行动"),
  visualDirection: z.string().default("具有编辑设计感的现代视觉"),
  style: z.string().default("现代、克制、有层次"),
  palette: z.array(z.string()).default([]),
  motion: z.string().default("只在有助于理解时使用分步呈现"),
  density: z.enum(["speaker-led", "reading-first"]).default("reading-first"),
  styleCandidates: z
    .array(
      z.object({
        name: z.string(),
        thesis: z.string().default("针对主题建立独特视觉论点"),
        typography: z.string().default("区分展示字体与正文字体"),
        palette: z.array(z.string()).default([]),
        grid: z.string().default("固定画布网格"),
        signatureDevice: z.string().default("与主题相关的标志性视觉装置"),
        chartStyle: z.string().default("直接标注并突出结论"),
        motion: z.string().default("克制分步"),
        fit: z.string().default("说明适用场景"),
      }),
    )
    .default([]),
  selectedStyle: z.string().default(""),
  designSystem: z
    .object({
      visualThesis: z.string().default("清晰、有辨识度、服务于内容"),
      displayFont: z.string().default("Noto Sans SC"),
      bodyFont: z.string().default("Noto Sans SC"),
      colors: z.array(z.string()).default([]),
      spacing: z.string().default("96px 安全区与清晰节奏"),
      grid: z.string().default("12 列固定画布网格"),
      shapeLanguage: z.string().default("由主题决定，不使用通用卡片堆叠"),
      chartLanguage: z.string().default("直接标注、弱化网格、突出结论"),
      motionLanguage: z.string().default("克制分步，服务于讲述顺序"),
    })
    .default({
      visualThesis: "清晰、有辨识度、服务于内容",
      displayFont: "Noto Sans SC",
      bodyFont: "Noto Sans SC",
      colors: [],
      spacing: "96px 安全区与清晰节奏",
      grid: "12 列固定画布网格",
      shapeLanguage: "由主题决定，不使用通用卡片堆叠",
      chartLanguage: "直接标注、弱化网格、突出结论",
      motionLanguage: "克制分步，服务于讲述顺序",
    }),
  slides: z
    .array(
      z.object({
        title: z.string(),
        purpose: z.string().default("传达一个明确观点"),
        layoutIntent: z.string().default("根据内容选择最合适布局"),
        visualType: z.string().default("editorial"),
        contentBudget: z.string().default("保留全部关键事实、数字、结论和行动项；只压缩装饰性文案"),
        focalPoint: z.string().default("根据观点决定视觉焦点"),
        composition: z.string().default("使用固定画布网格建立清晰层级"),
        visualBrief: z.string().default("用图形表达内容中的真实关系"),
        assetBrief: z.string().default("优先使用可靠素材，否则使用语义化 CSS/SVG"),
        motion: z.string().default("按理解顺序分步出现"),
      }),
    )
    .min(1),
});

type PresentationPlan = z.infer<typeof presentationPlanSchema>;

const reviewSchema = z.object({
  summary: z.string().default(""),
  needsRepair: z.boolean().default(false),
  issues: z
    .array(
      z.object({
        severity: z.enum(["error", "warning"]).default("warning"),
        page: z.number().int().positive().nullable().optional(),
        problem: z.string(),
        recommendation: z.string(),
      }),
    )
    .default([]),
});

type GenerationPhase =
  | "source"
  | "planning"
  | "rendering"
  | "visualizing"
  | "reviewing"
  | "repairing"
  | "compiling"
  | "saving"
  | "failed"
  | "cancelled";

interface GenerationCheckpoint extends Record<string, unknown> {
  schema: "presentation-generation/v3";
  phase: GenerationPhase;
  phaseLabel: string;
  progress: number;
  activity: "waiting" | "reasoning" | "streaming" | "processing" | "done" | "failed";
  startedAt: string;
  updatedAt: string;
  receivedChars: number;
  completedPages: number;
  estimatedPages: number;
  pageTitles: string[];
  plan?: PresentationPlan;
  reviewSummary?: string;
  renderSummary?: string;
  renderIssueCount?: number;
  repairApplied?: boolean;
  stoppedAtPhase?: GenerationPhase;
  failureStage?: string;
  failureDetails?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

function loadEchartsJs(): string {
  try {
    return readFileSync(require.resolve("echarts/dist/echarts.min.js"), "utf8");
  } catch {
    return "";
  }
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:html|json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

export function repairPresentationHtmlContract(
  html: string,
  title: string,
  plannedTitles: string[] = [],
): string {
  let pageIndex = 0;
  return html.replace(
    /(<section\b[^>]*data-sg-page[^>]*>)([\s\S]*?)(<\/section>)/gi,
    (_match, open, body, close) => {
      const plannedTitle = plannedTitles[pageIndex];
      const safeTitle = escapeHtml(plannedTitle || title || "在线演示");
      pageIndex += 1;
      const heading = body.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i);
      if (!heading) {
        return `${open}<h1 data-sg-kind="text" data-sg-id="generated-page-title-${pageIndex}">${safeTitle}</h1>${body}${close}`;
      }
      if (!plannedTitle) return `${open}${body}${close}`;
      const headingText = (heading[1] ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (headingText.includes(plannedTitle) || headingText.includes(safeTitle)) {
        return `${open}${body}${close}`;
      }
      const normalizedBody = body.replace(
        /(<h[12]\b[^>]*>)[\s\S]*?(<\/h[12]>)/i,
        `$1${safeTitle}$2`,
      );
      return `${open}${normalizedBody}${close}`;
    },
  );
}

function injectEcharts(html: string): string {
  if (!html.includes('data-sg-kind="chart"') && !html.includes("data-sg-kind='chart'")) {
    return html;
  }
  if (/<script\b[^>]*data-sg-echarts-runtime/i.test(html)) return html;
  const js = loadEchartsJs();
  if (!js) return html;
  return html.includes("</body>")
    ? html.replace("</body>", `<script data-sg-echarts-runtime>${js}</script></body>`)
    : `${html}<script data-sg-echarts-runtime>${js}</script>`;
}

function normalizeViewportUnits(css: string): string {
  // The player scales a 16:9 reference stage. Normalize viewport units against
  // that stage so authored responsive CSS keeps the same visual proportions at
  // every playback size without treating the units as an authoring error.
  return css.replace(
    /(-?(?:\d+(?:\.\d+)?|\.\d+))(vw|vh|vmin|vmax)\b/gi,
    (_match, rawValue: string, unit: string) => {
      const value = Number(rawValue);
      const normalizedUnit = unit.toLowerCase();
      const basis = normalizedUnit === "vh" || normalizedUnit === "vmin" ? 10.8 : 19.2;
      return `${Number((value * basis).toFixed(4))}px`;
    },
  );
}

export function sanitizePresentationStyles(html: string): string {
  return html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, open, css, close) => `${open}${normalizeViewportUnits(css)}${close}`,
  );
}

function prepareGeneratedHtml(html: string, title: string, plannedTitles: string[] = []): string {
  let result = sanitizePresentationStyles(
    repairPresentationHtmlContract(stripCodeFence(html), title, plannedTitles),
  );
  result = instrumentPresentationHtml(result).html;
  result = injectEcharts(result);
  return ensurePresentationRuntimeHtml(result);
}

/**
 * 逐页应用修复，并在每次规范化后立即验证页数。
 *
 * 模型偶尔会返回缺失 </section> 或多出嵌套 section 的片段；整批替换后
 * HTML 解析器可能吞掉相邻页面。这样的片段必须被隔离丢弃，保留原页让
 * 下一轮修复继续处理，而不是让整个生成任务违反页数守恒并失败。
 */
export function applyPresentationRepairsPreservingPageCount(
  html: string,
  replacements: Map<number, string>,
  pageStyles: string[],
  expectedPageCount: number,
  title: string,
  plannedTitles: string[] = [],
): { html: string; skippedPages: number[] } {
  let candidate = html;
  const skippedPages: number[] = [];
  const ordered = [...replacements.entries()].sort(([a], [b]) => a - b);
  for (const [pageNumber, replacement] of ordered) {
    const trialRaw = replacePresentationPages(candidate, new Map([[pageNumber, replacement]]), []);
    const trial = prepareGeneratedHtml(trialRaw, title, plannedTitles);
    if (extractSlideBatch(trial).sections.length !== expectedPageCount) {
      skippedPages.push(pageNumber);
      continue;
    }
    candidate = trialRaw;
  }
  const prepared = prepareGeneratedHtml(
    replacePresentationPages(candidate, new Map(), pageStyles),
    title,
    plannedTitles,
  );
  if (extractSlideBatch(prepared).sections.length !== expectedPageCount) {
    return {
      html: prepareGeneratedHtml(html, title, plannedTitles),
      skippedPages: ordered.map(([pageNumber]) => pageNumber),
    };
  }
  return { html: prepared, skippedPages };
}

function deterministicHtmlIssues(html: string): Array<{ code: string; message: string }> {
  return [
    ...validatePresentationHtml(html),
    ...validatePresentationHtmlVisualQuality(html)
      .filter((issue) => issue.severity === "error")
      .map((issue) => ({ code: issue.code, message: issue.message })),
  ];
}

function plannedSlideCoverageIssues(
  html: string,
  plannedTitles: string[],
): Array<{ code: string; message: string }> {
  const sections = extractSlideBatch(html).sections;
  return plannedTitles.flatMap((title, index) => {
    const section = sections[index] ?? "";
    const escapedTitle = title
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const headingText = [...section.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map((match) =>
      (match[1] ?? "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (headingText.some((heading) => heading.includes(title) || heading.includes(escapedTitle))) {
      return [];
    }
    return [
      {
        code: "PLANNED_TITLE_MISSING",
        message: `页面 ${index + 1} 未保留计划标题“${title}”，正文可能被生成过程吞掉`,
      },
    ];
  });
}

function compactRenderAudit(audit: PresentationRenderAudit): Record<string, unknown> {
  return {
    available: audit.available,
    pageCount: audit.pageCount,
    summary: audit.summary,
    issues: audit.issues.slice(0, 80),
    consoleErrors: audit.consoleErrors.slice(0, 12),
    slides: audit.slides.map(({ page, pageId, title, issueCount }) => ({
      page,
      pageId,
      title,
      issueCount,
    })),
  };
}

function visualReviewContent(input: {
  plan: PresentationPlan;
  html: string;
  deterministicIssues: Array<{ code: string; message: string }>;
  audit: PresentationRenderAudit;
}): ChatContentPart[] {
  const parts: ChatContentPart[] = [
    {
      type: "text",
      text: JSON.stringify({
        task: "结合真实渲染截图和几何诊断审查演示。不要只看有没有图形，要判断构图、视觉层级、留白、字体、图形表达和专业程度。",
        plan: input.plan,
        deterministicIssues: input.deterministicIssues,
        renderAudit: compactRenderAudit(input.audit),
        html: input.html.slice(0, 120_000),
        outputSchema: {
          summary: "string",
          needsRepair: "boolean",
          issues: [
            {
              severity: "error | warning",
              page: "number | null",
              problem: "string",
              recommendation: "string",
            },
          ],
        },
      }),
    },
  ];
  const prioritized = [...input.audit.slides]
    .sort((a, b) => b.issueCount - a.issueCount || a.page - b.page)
    .slice(0, 8)
    .sort((a, b) => a.page - b.page);
  for (const slide of prioritized) {
    if (!slide.screenshotDataUrl) continue;
    parts.push({ type: "text", text: `第 ${slide.page} 页截图：${slide.title}` });
    parts.push({
      type: "image_url",
      image_url: { url: slide.screenshotDataUrl, detail: "high" },
    });
  }
  return parts;
}

function extractCompletedPageTitles(html: string): string[] {
  const titles: string[] = [];
  const sections = html.match(/<section\b[^>]*data-sg-page[^>]*>[\s\S]*?<\/section>/gi) ?? [];
  for (const section of sections) {
    const title =
      section.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i)?.[1] ?? `第 ${titles.length + 1} 页`;
    const plain = title
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    titles.push(plain || `第 ${titles.length + 1} 页`);
  }
  return titles;
}

export function pageTitlesForStreamPhase(
  phase: GenerationPhase,
  existingPageTitles: string[],
  streamedHtml: string,
): string[] {
  // Repair responses contain only the requested batch (for example pages 7–9),
  // so they must not replace the full deck's page-count checkpoint.
  return phase === "rendering" ? extractCompletedPageTitles(streamedHtml) : existingPageTitles;
}

function parseJsonText(text: string): unknown {
  return JSON.parse(
    stripCodeFence(text)
      .replace(/^\s*json\s*/i, "")
      .trim(),
  );
}

function splitBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function extractSlideBatch(text: string): { sections: string[]; styles: string[] } {
  const html = stripCodeFence(text);
  return {
    sections: html.match(/<section\b[^>]*data-sg-page[^>]*>[\s\S]*?<\/section>/gi) ?? [],
    styles: Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)).map(
      (match) => match[1] ?? "",
    ),
  };
}

export function assemblePresentationFoundation(
  foundation: string,
  sections: string[],
  pageStyles: string[],
): string {
  const cleanFoundation = foundation.replace(
    /<section\b[^>]*data-sg-page[^>]*>[\s\S]*?<\/section>/gi,
    "",
  );
  let html = cleanFoundation.replace(GENERATED_SLIDES_MARKER, sections.join("\n"));
  if (pageStyles.length > 0) {
    const styles = `<style data-sg-generated-page-styles>${pageStyles.join("\n")}</style>`;
    html = html.includes("</head>")
      ? html.replace("</head>", `${styles}</head>`)
      : `${styles}${html}`;
  }
  return html;
}

export function issuePageNumbers(input: {
  deterministicIssues: Array<{ code: string; message: string }>;
  renderAudit: PresentationRenderAudit;
  review: z.infer<typeof reviewSchema>;
  pageCount: number;
}): number[] {
  const pages = new Set<number>();
  for (const issue of input.renderAudit.issues) {
    if (issue.severity === "error" && issue.page >= 1 && issue.page <= input.pageCount) {
      pages.add(issue.page);
    }
  }
  for (const issue of input.review.issues) {
    if (
      issue.severity === "error" &&
      issue.page &&
      issue.page >= 1 &&
      issue.page <= input.pageCount
    ) {
      pages.add(issue.page);
    }
  }
  for (const issue of input.deterministicIssues) {
    const match = issue.message.match(/(?:页面\s*(?:page[-_ ]?)?|page[-_ ]?)0*(\d+)/i);
    const page = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    if (page >= 1 && page <= input.pageCount) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

export function replacePresentationPages(
  html: string,
  replacements: Map<number, string>,
  pageStyles: string[],
): string {
  let page = 0;
  let result = html.replace(/<section\b[^>]*data-sg-page[^>]*>[\s\S]*?<\/section>/gi, (section) => {
    page += 1;
    return replacements.get(page) ?? section;
  });
  if (pageStyles.length > 0) {
    const styles = `<style data-sg-repair-page-styles>${pageStyles.join("\n")}</style>`;
    result = result.includes("</head>")
      ? result.replace("</head>", `${styles}</head>`)
      : `${styles}${result}`;
  }
  return result;
}

export function preservePageIdentity(original: string, replacement: string): string {
  let result = replacement;
  for (const attribute of ["data-sg-page", "data-sg-id"] as const) {
    const value = original.match(new RegExp(`${attribute}=["']([^"']+)["']`, "i"))?.[1];
    if (!value) continue;
    const existing = new RegExp(`${attribute}=["'][^"']*["']`, "i");
    result = existing.test(result)
      ? result.replace(existing, `${attribute}="${value}"`)
      : result.replace(/<section\b/i, `<section ${attribute}="${value}"`);
  }
  return result;
}

export function selectRepairSection(original: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  const page = original.match(/data-sg-page=["']([^"']+)["']/i)?.[1];
  const id = original.match(/data-sg-id=["']([^"']+)["']/i)?.[1];
  const matching = candidates.find((candidate) => {
    const candidatePage = candidate.match(/data-sg-page=["']([^"']+)["']/i)?.[1];
    const candidateId = candidate.match(/data-sg-id=["']([^"']+)["']/i)?.[1];
    return Boolean((page && candidatePage === page) || (id && candidateId === id));
  });
  return matching ?? (candidates.length === 1 ? (candidates[0] ?? null) : null);
}

export function matchRepairSections(
  originals: string[],
  candidates: string[],
): Map<number, string> {
  const matched = new Map<number, string>();
  const used = new Set<number>();
  originals.forEach((original, originalIndex) => {
    const page = original.match(/data-sg-page=["']([^"']+)["']/i)?.[1];
    const id = original.match(/data-sg-id=["']([^"']+)["']/i)?.[1];
    const candidateIndex = candidates.findIndex((candidate, index) => {
      if (used.has(index)) return false;
      const candidatePage = candidate.match(/data-sg-page=["']([^"']+)["']/i)?.[1];
      const candidateId = candidate.match(/data-sg-id=["']([^"']+)["']/i)?.[1];
      return Boolean((page && candidatePage === page) || (id && candidateId === id));
    });
    if (candidateIndex < 0) return;
    const candidate = candidates[candidateIndex];
    if (!candidate) return;
    used.add(candidateIndex);
    matched.set(originalIndex, candidate);
  });
  if (candidates.length === originals.length) {
    originals.forEach((_original, index) => {
      const candidate = candidates[index];
      if (!matched.has(index) && candidate && !used.has(index)) {
        used.add(index);
        matched.set(index, candidate);
      }
    });
  }
  return matched;
}

class PresentationGenerationError extends Error {
  constructor(
    readonly code: string,
    readonly stage: GenerationPhase,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PresentationGenerationError";
  }
}

function modelOutputDiagnostics(text: string): Record<string, unknown> {
  const normalized = stripCodeFence(text);
  const sections = normalized.match(/<section\b[^>]*data-sg-page[^>]*>/gi) ?? [];
  return {
    receivedChars: text.length,
    hasGeneratedSlidesMarker: normalized.includes(GENERATED_SLIDES_MARKER),
    sectionOpenCount: sections.length,
    prefix: normalized.slice(0, 300),
    suffix: normalized.slice(-300),
  };
}

function generationError(
  code: string,
  stage: GenerationPhase,
  message: string,
  details: Record<string, unknown> = {},
): PresentationGenerationError {
  return new PresentationGenerationError(code, stage, message, details);
}

async function retryTaskUnit<T>(input: {
  taskId: string;
  logger: Logger;
  stage: string;
  signal?: AbortSignal;
  run: () => Promise<T>;
}): Promise<T> {
  let lastError: unknown;
  const maxAttempts = MAX_TASK_UNIT_RETRIES + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (input.signal?.aborted) throw input.signal.reason;
    try {
      return await input.run();
    } catch (error) {
      if (input.signal?.aborted) throw input.signal.reason;
      lastError = error;
      if (attempt === maxAttempts) {
        const classified = classifyGenerationError(error);
        throw generationError(
          classified.code,
          input.stage.split(".")[0] as GenerationPhase,
          classified.message,
          {
            ...(classified.details ?? {}),
            retry: {
              unit: input.stage,
              retries: MAX_TASK_UNIT_RETRIES,
              attempts: maxAttempts,
            },
          },
        );
      }
      input.logger.warn(
        {
          taskId: input.taskId,
          stage: input.stage,
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts,
          err: error instanceof Error ? error.message : String(error),
        },
        "task unit failed; retrying",
      );
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 250 * 2 ** (attempt - 1))));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function classifyGenerationError(error: unknown): {
  code: string;
  message: string;
  stage?: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof PresentationGenerationError) {
    return {
      code: error.code,
      message: error.message,
      stage: error.stage,
      details: error.details,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/cancel/i.test(message) || /已取消/.test(message)) {
    return { code: "GENERATION_CANCELLED", message: "生成任务已取消" };
  }
  if (/首个输出超时|first byte|等待模型/.test(message)) {
    return { code: "MODEL_FIRST_BYTE_TIMEOUT", message };
  }
  if (/没有新内容|idle/i.test(message)) {
    return { code: "MODEL_STREAM_IDLE_TIMEOUT", message };
  }
  if (/总时长|timeout|aborted/i.test(message)) {
    return { code: "MODEL_TOTAL_TIMEOUT", message };
  }
  if (/model gateway|模型网关|MODEL_GATEWAY/.test(message)) {
    return { code: "MODEL_GATEWAY_ERROR", message };
  }
  if (/校验失败|validation/i.test(message)) {
    return { code: "HTML_VALIDATION_FAILED", message };
  }
  return { code: "PRESENTATION_GENERATION_FAILED", message };
}

async function annotateGeneratedPresentation(
  ai: ReturnType<typeof createAiService>,
  html: string,
  taskId: string,
  logger: Logger,
  signal: AbortSignal,
  onUpdate: (update: ChatStreamUpdate) => void | Promise<void>,
): Promise<string> {
  const instrumented = instrumentPresentationHtml(html);
  if (instrumented.manifest.elements.length === 0) return instrumented.html;
  const annotationPrompt = await loadPresentationPrompt("presentation-annotation");
  try {
    const result = await retryTaskUnit({
      taskId,
      logger,
      stage: "compiling.annotation",
      signal,
      run: () =>
        ai.completeJsonStream(
          {
            messages: [
              {
                role: "system",
                content: annotationPrompt,
              },
              {
                role: "user",
                content: JSON.stringify({
                  elements: instrumented.manifest.elements.map(({ id, kind, tagName, text }) => ({
                    id,
                    kind,
                    tagName,
                    text,
                  })),
                }),
              },
            ],
            quality: "balanced",
            maxTokens: 12_000,
            thinkingMode: "disabled",
            fallbackToLocal: false,
            taskId,
            signal,
          },
          annotationSchema,
          onUpdate,
        ),
    });
    return applyPresentationAnnotations(instrumented.html, result.data.elements);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof PresentationGenerationError) throw error;
    throw generationError(
      "PRESENTATION_ANNOTATION_FAILED",
      "compiling",
      `编辑元素标签编译失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function runPresentationWorkflow(
  ctx: StepContext,
  spec: Record<string, unknown>,
  storage: ObjectStore,
): Promise<void> {
  const parsed = z
    .object({
      assetId: z.string().nullable().optional(),
      sourceText: z.string().nullable().optional(),
      title: z.string().default("在线演示"),
      theme: z.string().default("light"),
      profile: z.enum(["research", "pitch", "product-launch", "data-story"]).default("research"),
      operation: z.literal("asset").default("asset"),
      prompt: z.string().optional(),
    })
    .parse(spec);

  const capabilityContext = await retryTaskUnit({
    taskId: ctx.taskId,
    logger: ctx.logger,
    stage: "source.capability-context",
    run: () => loadCapabilityContext(loadCapabilityAgentId(), ctx.taskId),
  });
  const ai = createAiService({ quality: "best", workspace: capabilityContext?.workspace });
  const presentationSystemPrompt = await retryTaskUnit({
    taskId: ctx.taskId,
    logger: ctx.logger,
    stage: "source.prompt-system",
    run: () => loadPresentationPrompt("presentation-system"),
  });
  const [planningPrompt, foundationPrompt, pageBatchPrompt, reviewPrompt, repairPrompt] =
    await Promise.all([
      retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: "source.prompt-planning",
        run: () => loadPresentationPrompt("presentation-planning"),
      }),
      retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: "source.prompt-foundation",
        run: () =>
          loadPresentationPrompt("presentation-foundation", { system: presentationSystemPrompt }),
      }),
      retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: "source.prompt-page-batch",
        run: () =>
          loadPresentationPrompt("presentation-page-batch", { system: presentationSystemPrompt }),
      }),
      retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: "source.prompt-review",
        run: () => loadPresentationPrompt("presentation-review"),
      }),
      retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: "source.prompt-repair",
        run: () =>
          loadPresentationPrompt("presentation-repair", { system: presentationSystemPrompt }),
      }),
    ]);
  const checkpoint: GenerationCheckpoint = {
    schema: "presentation-generation/v3",
    phase: "source",
    phaseLabel: "准备参考资料",
    progress: 4,
    activity: "processing",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    receivedChars: 0,
    completedPages: 0,
    estimatedPages: 0,
    pageTitles: [],
  };
  let lastTaskCheckAt = 0;
  let lastStreamReportAt = 0;
  const pendingStreamDeltas = new Map<string, string>();
  let checkingCancellation = false;
  const cancellationController = new AbortController();

  const report = async (
    progress: number,
    detail: string,
    patch: Partial<GenerationCheckpoint> = {},
    stream?: {
      phase: string;
      activity: ChatStreamUpdate["activity"] | "finished" | "failed";
      delta?: string;
      receivedChars?: number;
      finishReason?: string | null;
      usage?: { inputTokens: number; outputTokens: number };
    },
  ): Promise<void> => {
    Object.assign(checkpoint, patch, {
      progress,
      updatedAt: new Date().toISOString(),
    });
    ctx.sequence += 1;
    await ctx.api.reportProgress({
      taskId: ctx.taskId,
      runId: ctx.runId,
      sequence: ctx.sequence,
      status: "running",
      progress,
      detail,
      checkpoint,
      ...(stream ? { stream } : {}),
    });
  };

  const addStreamDelta = (key: string, delta: string) => {
    if (!delta) return;
    pendingStreamDeltas.set(key, `${pendingStreamDeltas.get(key) ?? ""}${delta}`);
  };
  const flushStream = async (
    key: string,
    phase: GenerationPhase,
    activity: ChatStreamUpdate["activity"] | "finished" | "failed",
    receivedChars: number,
    finishReason?: string | null,
    usage?: { inputTokens: number; outputTokens: number },
  ) => {
    const delta = pendingStreamDeltas.get(key) ?? "";
    pendingStreamDeltas.delete(key);
    await report(checkpoint.progress, checkpoint.phaseLabel, {}, {
      phase,
      activity,
      delta,
      receivedChars,
      finishReason,
      usage,
    });
  };

  const ensureActive = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastTaskCheckAt < 2000) return;
    lastTaskCheckAt = now;
    try {
      const state = await ctx.api.getTaskState(ctx.taskId);
      if (state.cancelRequested || state.status === "cancelled") {
        const error = new Error("generation cancelled by user");
        cancellationController.abort(error);
        throw error;
      }
    } catch (error) {
      if (cancellationController.signal.aborted) throw error;
      ctx.logger.warn({ taskId: ctx.taskId, err: String(error) }, "task cancellation check failed");
    }
  };

  const cancellationTimer = setInterval(() => {
    if (checkingCancellation || cancellationController.signal.aborted) return;
    checkingCancellation = true;
    void ctx.api
      .getTaskState(ctx.taskId)
      .then((state) => {
        if (state.cancelRequested || state.status === "cancelled") {
          cancellationController.abort(new Error("generation cancelled by user"));
        }
      })
      .catch((error) => {
        ctx.logger.warn(
          { taskId: ctx.taskId, err: String(error) },
          "background cancellation check failed",
        );
      })
      .finally(() => {
        checkingCancellation = false;
      });
  }, 2000);

  const streamReporter =
    (phase: GenerationPhase, label: string, baseProgress: number, targetProgress: number) =>
    async (update: ChatStreamUpdate): Promise<void> => {
      await ensureActive();
      const key = `${phase}:${label}`;
      addStreamDelta(key, update.delta);
      const now = Date.now();
      const pageTitles = pageTitlesForStreamPhase(phase, checkpoint.pageTitles, update.text);
      const completedPages = pageTitles.length;
      const estimatedPages = Math.max(checkpoint.estimatedPages, 1);
      const pageRatio = Math.min(1, completedPages / estimatedPages);
      const streamedRatio = Math.min(
        0.94,
        Math.log1p(Math.max(0, update.receivedChars)) / Math.log(8001),
      );
      const progressRatio =
        phase === "rendering" || phase === "repairing"
          ? Math.max(pageRatio, streamedRatio * 0.5)
          : streamedRatio;
      const progress = Math.floor(baseProgress + (targetProgress - baseProgress) * progressRatio);
      const activity =
        update.activity === "reasoning"
          ? "reasoning"
          : update.activity === "content"
            ? "streaming"
            : checkpoint.activity;
      const shouldReport =
        now - lastStreamReportAt >= 900 ||
        completedPages !== checkpoint.completedPages ||
        activity !== checkpoint.activity ||
        update.activity === "failed";
      if (!shouldReport) return;
      lastStreamReportAt = now;
      await report(progress, label, {
        phase,
        phaseLabel: label,
        activity,
        receivedChars: update.receivedChars,
        completedPages,
        pageTitles,
      }, {
        phase,
        activity: update.activity,
        delta: pendingStreamDeltas.get(key) ?? "",
        receivedChars: update.receivedChars,
      });
      pendingStreamDeltas.delete(key);
    };

  const pageBatchReporter = (
    baseTitles: string[],
    label: string,
    baseProgress: number,
    targetProgress: number,
  ) => {
    const baseReceivedChars = checkpoint.receivedChars ?? 0;
    return async (update: ChatStreamUpdate): Promise<void> => {
      await ensureActive();
      const key = `rendering:${label}`;
      addStreamDelta(key, update.delta);
      const now = Date.now();
      const partialTitles = extractCompletedPageTitles(update.text);
      const pageTitles = [...baseTitles, ...partialTitles];
      const estimatedPages = Math.max(checkpoint.estimatedPages, 1);
      const ratio = Math.min(1, pageTitles.length / estimatedPages);
      const progress = Math.floor(baseProgress + (targetProgress - baseProgress) * ratio);
      const activity =
        update.activity === "reasoning"
          ? "reasoning"
          : update.activity === "content"
            ? "streaming"
            : checkpoint.activity;
      if (
        now - lastStreamReportAt < 900 &&
        pageTitles.length === checkpoint.completedPages &&
        activity === checkpoint.activity &&
        update.activity !== "failed"
      )
        return;
      lastStreamReportAt = now;
      await report(progress, label, {
        phase: "rendering",
        phaseLabel: label,
        activity,
        receivedChars: baseReceivedChars + update.receivedChars,
        completedPages: pageTitles.length,
        pageTitles,
      }, {
        phase: "rendering",
        activity: update.activity,
        delta: pendingStreamDeltas.get(key) ?? "",
        receivedChars: baseReceivedChars + update.receivedChars,
      });
      pendingStreamDeltas.delete(key);
    };
  };

  try {
    let source = parsed.sourceText ?? "";
    await step(ctx, "presentation.source", 8, "读取并整理参考资料", async () => {
      if (!source && parsed.assetId) {
        source = await retryTaskUnit({
          taskId: ctx.taskId,
          logger: ctx.logger,
          stage: "source.read",
          signal: cancellationController.signal,
          run: () => readAssetText(storage, parsed.assetId as string),
        });
      }
    });
    await report(8, "参考资料已准备", {
      phase: "source",
      phaseLabel: "准备参考资料",
      activity: "done",
    });

    await report(12, "AI 正在推演叙事结构与视觉方向", {
      phase: "planning",
      phaseLabel: "深度规划叙事与视觉",
      activity: "waiting",
    });
    const plan = await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "planning.model",
      signal: cancellationController.signal,
      run: async () => {
        const result = await ai.completeStream(
          {
            messages: [
              {
                role: "system",
                content: [planningPrompt, capabilityContext?.summary ?? ""]
                  .filter(Boolean)
                  .join("\n\n"),
              },
              {
                role: "user",
                content: JSON.stringify({
                  task: "为在线演示生成可执行的创意计划",
                  title: parsed.title,
                  profile: parsed.profile,
                  theme: parsed.theme,
                  requirements: parsed.prompt ?? "",
                  source: source || "没有附加资料，请基于标题和创作要求构建合理内容。",
                  outputSchema: {
                    audience: "string",
                    coreMessage: "string",
                    narrative: "string",
                    visualDirection: "string",
                    style: "string",
                    palette: ["string"],
                    motion: "string",
                    density: "speaker-led | reading-first",
                    styleCandidates: [
                      {
                        name: "string",
                        thesis: "string",
                        typography: "string",
                        palette: ["string"],
                        grid: "string",
                        signatureDevice: "string",
                        chartStyle: "string",
                        motion: "string",
                        fit: "string",
                      },
                    ],
                    selectedStyle: "string",
                    designSystem: {
                      visualThesis: "string",
                      displayFont: "string",
                      bodyFont: "string",
                      colors: ["string"],
                      spacing: "string",
                      grid: "string",
                      shapeLanguage: "string",
                      chartLanguage: "string",
                      motionLanguage: "string",
                    },
                    slides: [
                      {
                        title: "string",
                        purpose: "string",
                        layoutIntent: "string",
                        visualType: "string",
                        contentBudget: "保留全部关键事实、数字、结论和行动项；只压缩装饰性文案",
                        focalPoint: "string",
                        composition: "string",
                        visualBrief: "string",
                        assetBrief: "string",
                        motion: "string",
                      },
                    ],
                  },
                }),
              },
            ],
            responseFormat: "json_object",
            maxTokens: 12_000,
            temperature: 0.75,
            thinkingMode: "enabled",
            fallbackToLocal: false,
            taskId: ctx.taskId,
            signal: cancellationController.signal,
          },
          streamReporter("planning", "深度规划叙事与视觉", 12, 29),
        );
        await flushStream(
          "planning:深度规划叙事与视觉",
          "planning",
          "finished",
          result.text.length,
          result.finishReason,
          result.usage,
        );
        try {
          return presentationPlanSchema.parse(parseJsonText(result.text));
        } catch (error) {
          throw generationError(
            "PRESENTATION_PLAN_INVALID",
            "planning",
            `规划模型输出无法解析：${error instanceof Error ? error.message : String(error)}`,
            { provider: result.provider, modelOutput: modelOutputDiagnostics(result.text) },
          );
        }
      },
    });
    checkpoint.estimatedPages = plan.slides.length;
    checkpoint.plan = plan;
    await report(30, `规划完成，共 ${plan.slides.length} 页`, {
      phase: "planning",
      phaseLabel: "深度规划叙事与视觉",
      activity: "done",
      plan,
      estimatedPages: plan.slides.length,
    });

    await report(32, "先生成全篇设计系统与固定画布基础", {
      phase: "rendering",
      phaseLabel: "建立设计系统",
      activity: "waiting",
      receivedChars: 0,
      completedPages: 0,
      pageTitles: [],
    });
    const foundationResult = await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "rendering.foundation",
      signal: cancellationController.signal,
      run: async () => {
        const result = await ai.completeStream(
          {
            messages: [
              {
                role: "system",
                content: foundationPrompt,
              },
              {
                role: "user",
                content: JSON.stringify({
                  task: "创建专业演示的全局设计系统和 HTML foundation",
                  title: parsed.title,
                  requirements: parsed.prompt ?? "",
                  theme: parsed.theme,
                  plan,
                  marker: GENERATED_SLIDES_MARKER,
                }),
              },
            ],
            maxTokens: 24_000,
            temperature: 0.72,
            thinkingMode: "disabled",
            fallbackToLocal: false,
            taskId: ctx.taskId,
            signal: cancellationController.signal,
          },
          streamReporter("rendering", "建立设计系统", 32, 40),
        );
        await flushStream(
          "rendering:建立设计系统",
          "rendering",
          "finished",
          result.text.length,
          result.finishReason,
          result.usage,
        );
        const output = stripCodeFence(result.text);
        if (!output.includes(GENERATED_SLIDES_MARKER)) {
          throw generationError(
            "PRESENTATION_FOUNDATION_INVALID",
            "rendering",
            `Foundation 输出缺少 ${GENERATED_SLIDES_MARKER}，无法进入逐页生成`,
            { provider: result.provider, modelOutput: modelOutputDiagnostics(result.text) },
          );
        }
        return result;
      },
    });

    let rawGeneratedHtml = stripCodeFence(foundationResult.text);
    let generatedChars = foundationResult.text.length;
    const slideBatches = splitBatches(plan.slides, PAGE_BATCH_SIZE);
    const sections: string[] = [];
    const pageStyles: string[] = [];
    let completedTitles: string[] = [];
    for (let batchIndex = 0; batchIndex < slideBatches.length; batchIndex += 1) {
      const batch = slideBatches[batchIndex] ?? [];
      const from = batchIndex * PAGE_BATCH_SIZE;
      const label = `逐页设计 ${from + 1}–${from + batch.length} / ${plan.slides.length}`;
      await report(40 + Math.floor((from / Math.max(plan.slides.length, 1)) * 32), label, {
        phase: "rendering",
        phaseLabel: "逐页生成与动效",
        activity: "waiting",
        completedPages: completedTitles.length,
        pageTitles: completedTitles,
      });
      const pageResult = await retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: `rendering.page-batch-${batchIndex + 1}`,
        signal: cancellationController.signal,
        run: async () => {
          const result = await ai.completeStream(
            {
              messages: [
                {
                  role: "system",
                  content: `${pageBatchPrompt}\n\n当前批次页数：${batch.length}`,
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    task: "生成当前批次的专业演示页面",
                    title: parsed.title,
                    requirements: parsed.prompt ?? "",
                    designSystem: plan.designSystem,
                    selectedStyle: plan.selectedStyle,
                    density: plan.density,
                    previousSlide: plan.slides[from - 1] ?? null,
                    slides: batch.map((slide, index) => ({
                      page: from + index + 1,
                      ...slide,
                    })),
                    nextSlide: plan.slides[from + batch.length] ?? null,
                    source: source.slice(0, 40_000),
                    foundation: rawGeneratedHtml.slice(0, 45_000),
                  }),
                },
              ],
              maxTokens: 24_000,
              temperature: 0.76,
              thinkingMode: "disabled",
              fallbackToLocal: false,
              taskId: ctx.taskId,
              signal: cancellationController.signal,
            },
            pageBatchReporter(completedTitles, label, 40, 72),
          );
          await flushStream(
            `rendering:${label}`,
            "rendering",
            "finished",
            result.text.length,
            result.finishReason,
            result.usage,
          );
          const extracted = extractSlideBatch(result.text);
          if (extracted.sections.length !== batch.length) {
            throw generationError(
              "PRESENTATION_PAGE_BATCH_INVALID",
              "rendering",
              `页面批次 ${batchIndex + 1} 输出数量异常：期望 ${batch.length} 页，实际 ${extracted.sections.length} 页`,
              {
                batchIndex: batchIndex + 1,
                expectedPageCount: batch.length,
                actualPageCount: extracted.sections.length,
                provider: result.provider,
                modelOutput: modelOutputDiagnostics(result.text),
              },
            );
          }
          return result;
        },
      });
      const extracted = extractSlideBatch(pageResult.text);
      sections.push(...extracted.sections);
      pageStyles.push(...extracted.styles);
      completedTitles = extractCompletedPageTitles(sections.join("\n"));
      generatedChars += pageResult.text.length;
      await report(40 + Math.floor((completedTitles.length / plan.slides.length) * 32), label, {
        phase: "rendering",
        phaseLabel: "逐页生成与动效",
        activity: "done",
        receivedChars: generatedChars,
        completedPages: completedTitles.length,
        pageTitles: completedTitles,
      });
    }
    rawGeneratedHtml = assemblePresentationFoundation(rawGeneratedHtml, sections, pageStyles);

    const plannedTitles = plan.slides.map((slide) => slide.title);
    let html = prepareGeneratedHtml(rawGeneratedHtml, parsed.title, plannedTitles);
    html = (
      await retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: "rendering.fit",
        signal: cancellationController.signal,
        run: () => fitPresentationHtmlToStage(html),
      })
    ).html;
    const initialPageCount = extractSlideBatch(html).sections.length;
    if (initialPageCount !== plan.slides.length) {
      throw generationError(
        "PRESENTATION_PAGE_COUNT_MISMATCH",
        "rendering",
        `生成结果页数不匹配：期望 ${plan.slides.length} 页，实际 ${initialPageCount} 页`,
        {
          expectedPageCount: plan.slides.length,
          actualPageCount: initialPageCount,
          modelOutput: modelOutputDiagnostics(rawGeneratedHtml),
        },
      );
    }
    let issues = [
      ...deterministicHtmlIssues(html),
      ...plannedSlideCoverageIssues(html, plannedTitles),
    ];
    const generatedTitles = extractCompletedPageTitles(html);
    await report(74, `已生成 ${generatedTitles.length} 页，准备真实渲染`, {
      phase: "rendering",
      phaseLabel: "生成页面与动效",
      activity: "done",
      receivedChars: generatedChars,
      completedPages: generatedTitles.length,
      pageTitles: generatedTitles,
    });

    await report(76, "Chromium 正在逐页渲染与测量", {
      phase: "visualizing",
      phaseLabel: "真实渲染检查",
      activity: "processing",
    });
    let renderAudit = await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "visualizing.chromium",
      signal: cancellationController.signal,
      run: () => renderPresentationAudit(html, { screenshots: true, maxScreenshots: 12 }),
    });
    checkpoint.renderSummary = renderAudit.summary;
    checkpoint.renderIssueCount = renderAudit.issues.length;
    await report(80, renderAudit.summary, {
      phase: "visualizing",
      phaseLabel: "真实渲染检查",
      activity: "done",
      renderSummary: renderAudit.summary,
      renderIssueCount: renderAudit.issues.length,
    });

    await report(81, "AI 正在结合截图审查叙事、布局与视觉质量", {
      phase: "reviewing",
      phaseLabel: "深度视觉审查",
      activity: "waiting",
    });
    let review: z.infer<typeof reviewSchema>;
    let reviewResponseText = "";
    let reviewProvider = "";
    try {
      review = await retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: "reviewing.model",
        signal: cancellationController.signal,
        run: async () => {
          const reviewResult = await ai.completeStream(
            {
              messages: [
                {
                  role: "system",
                  content: reviewPrompt,
                },
                {
                  role: "user",
                  content: visualReviewContent({
                    plan,
                    html,
                    deterministicIssues: issues,
                    audit: renderAudit,
                  }),
                },
              ],
              responseFormat: "json_object",
              maxTokens: 12_000,
              temperature: 0.25,
              thinkingMode: "enabled",
              fallbackToLocal: false,
              taskId: ctx.taskId,
              signal: cancellationController.signal,
            },
            streamReporter("reviewing", "深度视觉审查", 81, 86),
          );
          await flushStream(
            "reviewing:深度视觉审查",
            "reviewing",
            "finished",
            reviewResult.text.length,
            reviewResult.finishReason,
            reviewResult.usage,
          );
          reviewResponseText = reviewResult.text;
          reviewProvider = reviewResult.provider;
          try {
            return reviewSchema.parse(parseJsonText(reviewResult.text));
          } catch (error) {
            throw generationError(
              "PRESENTATION_REVIEW_OUTPUT_INVALID",
              "reviewing",
              `视觉审查输出无法解析：${error instanceof Error ? error.message : String(error)}`,
              {
                provider: reviewResult.provider,
                modelOutput: modelOutputDiagnostics(reviewResult.text),
              },
            );
          }
        },
      });
    } catch (error) {
      if (cancellationController.signal.aborted) throw cancellationController.signal.reason;
      if (error instanceof PresentationGenerationError) throw error;
      throw generationError(
        "PRESENTATION_REVIEW_FAILED",
        "reviewing",
        `视觉审查模型调用或 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
        {
          renderAudit: compactRenderAudit(renderAudit),
          ...(reviewProvider ? { provider: reviewProvider } : {}),
          ...(reviewResponseText
            ? { modelOutput: modelOutputDiagnostics(reviewResponseText) }
            : {}),
        },
      );
    }
    checkpoint.reviewSummary = review.summary;
    const blockingReviewIssues = review.issues.filter((issue) => issue.severity === "error");
    const needsRepair =
      issues.length > 0 ||
      renderAudit.issues.some((issue) => issue.severity === "error") ||
      blockingReviewIssues.length > 0;
    await report(87, needsRepair ? "发现可修复问题，准备定向优化" : "视觉审查通过", {
      phase: "reviewing",
      phaseLabel: "深度视觉审查",
      activity: "done",
      reviewSummary: review.summary,
    });

    if (needsRepair) {
      const expectedPageCount = plan.slides.length;
      const totalInitialPages = extractSlideBatch(html).sections;
      if (totalInitialPages.length !== expectedPageCount) {
        throw generationError(
          "PRESENTATION_PAGE_COUNT_MISMATCH",
          "repairing",
          `定向修复前页数异常：期望 ${expectedPageCount} 页，实际 ${totalInitialPages.length} 页`,
          { expectedPageCount, actualPageCount: totalInitialPages.length },
        );
      }
      let repairPass = 1;
      let repairCompleted = false;
      let previousRepairFailures: string[] = [];
      while (repairPass <= MAX_REPAIR_PASSES && !repairCompleted) {
        const currentPages = extractSlideBatch(html).sections;
        if (currentPages.length !== expectedPageCount) {
          throw generationError(
            "PRESENTATION_REPAIR_PAGE_COUNT_MISMATCH",
            "repairing",
            `定向修复页数异常：期望 ${expectedPageCount} 页，实际 ${currentPages.length} 页`,
            { repairPass, expectedPageCount, actualPageCount: currentPages.length },
          );
        }
        const pagesToRepair = issuePageNumbers({
          deterministicIssues: issues,
          renderAudit,
          review,
          pageCount: expectedPageCount,
        });
        if (pagesToRepair.length === 0 && issues.length > 0) {
          throw generationError(
            "PRESENTATION_HTML_VALIDATION_FAILED",
            "repairing",
            `演示 HTML 校验失败：${issues.map((issue) => issue.message).join("；")}`,
            { issues },
          );
        }
        if (pagesToRepair.length === 0) {
          repairCompleted = true;
          break;
        }
        await report(repairPass === 1 ? 88 : 91, `第 ${repairPass} 轮定向修复`, {
          phase: "repairing",
          phaseLabel: "定向修复",
          activity: "waiting",
          repairApplied: true,
        });
        const replacements = new Map<number, string>();
        const repairStyles: string[] = [];
        let repairChars = 0;
        let repairCalls = 0;
        const requestRepair = async (pageNumbers: number[]) => {
          repairCalls += 1;
          const label = `定向修复第 ${pageNumbers.join("、")} 页`;
          const failureContext =
            previousRepairFailures.length > 0
              ? `【上轮定向修复失败汇总】${previousRepairFailures.join("；")}`
              : "";
          const repairResult = await retryTaskUnit({
            taskId: ctx.taskId,
            logger: ctx.logger,
            stage: `repairing.pages-${pageNumbers.join("-")}`,
            signal: cancellationController.signal,
            run: async () => {
              const result = await ai.completeStream(
                {
                  messages: [
                    {
                      role: "system",
                      content: [
                        repairPrompt,
                        `当前修复页数：${pageNumbers.length}`,
                        "一次完成当前批次，不要分批回答。",
                        failureContext || "",
                      ].join("\n\n"),
                    },
                    {
                      role: "user",
                      content: JSON.stringify({
                        repairPass,
                        originalRequirements: parsed.prompt ?? "",
                        designSystem: plan.designSystem,
                        selectedStyle: plan.selectedStyle,
                        retryContext: previousRepairFailures,
                        pages: pageNumbers.map((pageNumber) => ({
                          page: pageNumber,
                          pagePlan: plan.slides[pageNumber - 1],
                          currentSection: currentPages[pageNumber - 1],
                          previousFailureContext: failureContext,
                          deterministicIssues: issues.filter((issue) =>
                            issue.message.match(
                              new RegExp(
                                `(?:页面\\s*(?:page[-_ ]?)?|page[-_ ]?)0*${pageNumber}(?:\\D|$)`,
                                "i",
                              ),
                            ),
                          ),
                          renderIssues: renderAudit.issues.filter(
                            (issue) => issue.page === pageNumber && issue.severity === "error",
                          ),
                          reviewIssues: review.issues.filter(
                            (issue) => issue.page === pageNumber && issue.severity === "error",
                          ),
                        })),
                      }),
                    },
                  ],
                  maxTokens: Math.min(24_000, Math.max(8_000, pageNumbers.length * 5_000)),
                  temperature: 0.28,
                  thinkingMode: "disabled",
                  fallbackToLocal: false,
                  taskId: ctx.taskId,
                  signal: cancellationController.signal,
                },
                streamReporter("repairing", label, 88, 92),
              );
              await flushStream(
                `repairing:${label}`,
                "repairing",
                "finished",
                result.text.length,
                result.finishReason,
                result.usage,
              );
              const extracted = extractSlideBatch(result.text);
              if (extracted.sections.length !== pageNumbers.length) {
                throw generationError(
                  "PRESENTATION_REPAIR_OUTPUT_INVALID",
                  "repairing",
                  `定向修复输出数量异常：期望 ${pageNumbers.length} 页，实际 ${extracted.sections.length} 页`,
                  {
                    repairPass,
                    requestedPages: pageNumbers,
                    expectedPageCount: pageNumbers.length,
                    actualPageCount: extracted.sections.length,
                    provider: result.provider,
                    modelOutput: modelOutputDiagnostics(result.text),
                  },
                );
              }
              return { result, extracted };
            },
          });
          repairChars += repairResult.result.text.length;
          return {
            ...repairResult.extracted,
            provider: repairResult.result.provider,
            modelOutput: modelOutputDiagnostics(repairResult.result.text),
          };
        };

        for (const batch of splitBatches(pagesToRepair, PAGE_BATCH_SIZE)) {
          if (repairCalls >= MAX_REPAIR_CALLS) {
            throw generationError(
              "PRESENTATION_REPAIR_BUDGET_EXHAUSTED",
              "repairing",
              `定向修复调用次数超过上限：${MAX_REPAIR_CALLS}`,
              { pagesToRepair, repairPass, repairCalls, maxRepairCalls: MAX_REPAIR_CALLS },
            );
          }
          const extractedRepair = await requestRepair(batch);
          const originals = batch.map((pageNumber) => currentPages[pageNumber - 1] ?? "");
          const matched = matchRepairSections(originals, extractedRepair.sections);
          batch.forEach((pageNumber, index) => {
            const originalSection = originals[index];
            const repairedSection = matched.get(index);
            if (!originalSection || !repairedSection) {
              throw generationError(
                "PRESENTATION_REPAIR_OUTPUT_INVALID",
                "repairing",
                `定向修复未返回第 ${pageNumber} 页的可匹配页面`,
                {
                  repairPass,
                  page: pageNumber,
                  requestedPages: batch,
                  provider: extractedRepair.provider,
                  modelOutput: extractedRepair.modelOutput,
                },
              );
            }
            replacements.set(pageNumber, preservePageIdentity(originalSection, repairedSection));
          });
          if (matched.size > 0) repairStyles.push(...extractedRepair.styles);
        }
        const safeRepair = applyPresentationRepairsPreservingPageCount(
          html,
          replacements,
          repairStyles,
          expectedPageCount,
          parsed.title,
          plannedTitles,
        );
        html = safeRepair.html;
        for (const pageNumber of safeRepair.skippedPages) {
          replacements.delete(pageNumber);
        }
        if (safeRepair.skippedPages.length > 0) {
          throw generationError(
            "PRESENTATION_REPAIR_PAGE_COUNT_VIOLATION",
            "repairing",
            `定向修复违反页数守恒，已拒绝替换第 ${safeRepair.skippedPages.join("、")} 页`,
            { repairPass, pages: safeRepair.skippedPages },
          );
        }
        html = (
          await retryTaskUnit({
            taskId: ctx.taskId,
            logger: ctx.logger,
            stage: `repairing.fit-pass-${repairPass}`,
            signal: cancellationController.signal,
            run: () => fitPresentationHtmlToStage(html),
          })
        ).html;
        const repairedPageCount = extractSlideBatch(html).sections.length;
        if (repairedPageCount !== expectedPageCount) {
          throw generationError(
            "PRESENTATION_REPAIR_PAGE_COUNT_MISMATCH",
            "repairing",
            `定向修复违反页数守恒：期望 ${expectedPageCount} 页，实际 ${repairedPageCount} 页`,
            { repairPass, expectedPageCount, actualPageCount: repairedPageCount },
          );
        }
        issues = [
          ...deterministicHtmlIssues(html),
          ...plannedSlideCoverageIssues(html, plannedTitles),
        ];
        renderAudit = await retryTaskUnit({
          taskId: ctx.taskId,
          logger: ctx.logger,
          stage: `repairing.chromium-pass-${repairPass}`,
          signal: cancellationController.signal,
          run: () =>
            renderPresentationAudit(html, {
              screenshots: repairPass === 1,
              maxScreenshots: 8,
            }),
        });
        checkpoint.renderSummary = renderAudit.summary;
        checkpoint.renderIssueCount = renderAudit.issues.length;
        const repairedTitles = extractCompletedPageTitles(html);
        checkpoint.pageTitles = repairedTitles;
        checkpoint.completedPages = repairedTitles.length;
        checkpoint.receivedChars = (checkpoint.receivedChars ?? 0) + repairChars;
        const blockingRenderIssues = renderAudit.issues.filter(
          (issue) => issue.severity === "error",
        );
        if (issues.length > 0 || blockingRenderIssues.length > 0) {
          const messages = [
            ...issues.map((issue) => issue.message),
            ...blockingRenderIssues.map((issue) => `第 ${issue.page} 页：${issue.message}`),
          ];
          previousRepairFailures = messages;
          if (repairPass >= MAX_REPAIR_PASSES) {
            throw generationError(
              "PRESENTATION_REPAIR_FAILED",
              "repairing",
              `演示渲染校验失败：${messages.join("；")}`,
              { repairPass, issues: messages },
            );
          }
          repairPass += 1;
          await report(91, `第 ${repairPass - 1} 轮修复后仍有阻断问题，准备第 ${repairPass} 轮`, {
            phase: "repairing",
            phaseLabel: "定向修复",
            activity: "processing",
            renderSummary: renderAudit.summary,
            renderIssueCount: renderAudit.issues.length,
          });
          continue;
        }
        repairCompleted = true;
      }
      if (!repairCompleted) {
        throw generationError(
          "PRESENTATION_REPAIR_FAILED",
          "repairing",
          `定向修复未在 ${MAX_REPAIR_PASSES} 轮内完成`,
          { maxRepairPasses: MAX_REPAIR_PASSES },
        );
      }
      await report(94, `定向修复完成；${renderAudit.summary}`, {
        phase: "repairing",
        phaseLabel: "定向修复",
        activity: "done",
        pageTitles: checkpoint.pageTitles,
        completedPages: checkpoint.completedPages,
        renderSummary: renderAudit.summary,
        renderIssueCount: renderAudit.issues.length,
      });
    } else if (issues.length > 0) {
      throw generationError(
        "PRESENTATION_HTML_VALIDATION_FAILED",
        "rendering",
        `演示 HTML 校验失败：${issues.map((issue) => issue.message).join("；")}`,
        { issues },
      );
    }

    await report(95, "编译可编辑元素标签", {
      phase: "compiling",
      phaseLabel: "编译编辑能力",
      activity: "processing",
    });
    html = await annotateGeneratedPresentation(
      ai,
      html,
      ctx.taskId,
      ctx.logger,
      cancellationController.signal,
      streamReporter("compiling", "编译编辑能力", 95, 97),
    );
    await flushStream(
      "compiling:编译编辑能力",
      "compiling",
      "finished",
      checkpoint.receivedChars ?? 0,
    );
    await report(97, "可编辑元素标签已编译", {
      phase: "compiling",
      phaseLabel: "编译编辑能力",
      activity: "done",
    });

    await report(98, "保存演示资产", {
      phase: "saving",
      phaseLabel: "保存演示资产",
      activity: "processing",
    });
    await ensureActive();
    await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "saving.project-result",
      signal: cancellationController.signal,
      run: async () => {
        const result = await ctx.api.projectResult({
          resultSchema: "presentation-result/v1",
          taskId: ctx.taskId,
          runId: ctx.runId,
          attempt: 1,
          outputs: [
            {
              kind: "presentation",
              assetType: "presentation",
              title: parsed.title,
              content: { html: stripPresentationPlatformShell(html) },
            },
          ],
          failures: [],
        });
        if (!result.ok) {
          throw generationError("PRESENTATION_PROJECTION_FAILED", "saving", "演示结果投影失败");
        }
        return result;
      },
    });
  } catch (error) {
    const classified = classifyGenerationError(error);
    const cancelled = classified.code === "GENERATION_CANCELLED";
    const stoppedAtPhase = checkpoint.phase;
    Object.assign(checkpoint, {
      phase: cancelled ? "cancelled" : "failed",
      phaseLabel: cancelled ? "任务已取消" : "生成失败",
      activity: "failed",
      stoppedAtPhase,
      failureStage: classified.stage ?? stoppedAtPhase,
      failureDetails: classified.details ?? {},
      errorCode: classified.code,
      errorMessage: classified.message,
      updatedAt: new Date().toISOString(),
    } satisfies Partial<GenerationCheckpoint>);
    ctx.sequence += 1;
    await ctx.api.reportProgress({
      taskId: ctx.taskId,
      runId: ctx.runId,
      sequence: ctx.sequence,
      status: cancelled ? "cancelled" : "failed",
      progress: checkpoint.progress,
      detail: cancelled ? "任务已取消" : "生成失败",
      checkpoint,
    });
    throw new Error(`[${classified.code}] ${classified.message}`);
  } finally {
    await capabilityContext?.dispose().catch((error) => {
      ctx.logger.warn(
        { taskId: ctx.taskId, err: String(error) },
        "failed to dispose Mastra skill workspace",
      );
    });
    clearInterval(cancellationTimer);
  }
}

async function readAssetText(storage: ObjectStore, assetId: string): Promise<string> {
  const keys = await storage.list("assets");
  const candidate = keys.find(
    (key) => key.startsWith(`assets/${assetId}/versions/`) && key.endsWith("/content"),
  );
  if (!candidate) {
    throw generationError(
      "PRESENTATION_SOURCE_ASSET_NOT_FOUND",
      "source",
      `找不到输入资产内容：${assetId}`,
      { assetId },
    );
  }
  const buffer = await storage.get(candidate);
  if (!buffer) {
    throw generationError(
      "PRESENTATION_SOURCE_ASSET_EMPTY",
      "source",
      `输入资产内容为空：${assetId}`,
      { assetId, objectKey: candidate },
    );
  }
  return buffer.toString("utf8");
}
