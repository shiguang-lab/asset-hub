import { createHash } from "node:crypto";
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
  fitAndAuditPresentationHtml,
  fitPresentationHtmlToStage,
  type PresentationRenderAudit,
  renderPresentationAudit,
} from "../presentation-renderer.js";
import { loadPresentationPrompt } from "../prompts.js";
import { type StepContext, step } from "./helpers.js";

const require = createRequire(import.meta.url);
const GENERATED_SLIDES_MARKER = "<!-- SG_GENERATED_SLIDES -->";
// Each page is generated as an independent, focused design unit.
// Single-page generation avoids multi-section stream overflow errors and allows
// optimal token allocation per slide.
const PAGE_BATCH_SIZE = 1;
const REVIEW_BATCH_SIZE = 3;
const MAX_REPAIR_CALLS = 12;
const MAX_REPAIR_PASSES = 5;
const MAX_TASK_UNIT_RETRIES = 5;
// Keep page-local repair traffic below the account-level gateway burst limit.
// A repair that does not change any measured error twice needs a different
// strategy (or deterministic degrade-fit), not more identical model calls.
const REPAIR_REQUEST_MIN_INTERVAL_MS = 12_000;
const MAX_NO_EFFECT_REPAIR_ATTEMPTS = 2;
// A single page can contain a full visual system and a dense data layout. Keep
// enough output budget for the closing tags instead of truncating at 8k tokens.
const REPAIR_MAX_OUTPUT_TOKENS = 32_768;
// Injected into the repair payload when a pass reproduced the exact same
// measurements: the model's CSS never reached the DOM, so "redesign the layout"
// guidance is useless until the selectors actually match.
const REPAIR_NO_EFFECT_HINT =
  "上一轮定向修复后，本页所有渲染测量值与修复前完全一致，说明你输出的修复样式没有命中任何元素或被更高优先级规则覆盖。请先修正选择器与样式来源：1) 页面级样式选择器必须使用 #page-N 前缀（section 的 id 为 page-N），不要用 .page-N 类选择器；2) 不要复用 foundation 中小字号的组件类，必须用页面级规则显式写出 font-size；3) 确认 <style data-sg-page-style> 标签完整输出且未被截断。修正后再输出完整页面。";

const annotationElementSchema = z.object({
  id: z.string(),
  role: z.string().optional(),
  editable: z.boolean().optional(),
  groupId: z.string().optional(),
});

// Models frequently follow the natural-language instruction and return the
// element list directly, while other providers wrap it in `{elements: [...]}`.
// Normalize both shapes at the boundary so a formatting difference cannot
// burn six retries for every page during the compiling phase.
const annotationSchema = z.preprocess(
  (value) => {
    const normalized = Array.isArray(value) ? { elements: value } : value;
    if (!normalized || typeof normalized !== "object") return normalized;
    const elements = (normalized as { elements?: unknown }).elements;
    if (!Array.isArray(elements)) return normalized;
    return {
      ...normalized,
      elements: elements.map((element) => {
        if (!element || typeof element !== "object") return element;
        return Object.fromEntries(Object.entries(element).filter(([, field]) => field !== null));
      }),
    };
  },
  z.object({
    elements: z.array(annotationElementSchema).default([]),
  }),
);

export function parsePresentationAnnotation(value: unknown): z.infer<typeof annotationSchema> {
  return annotationSchema.parse(value);
}

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
  pageBudget: z
    .object({
      target: z.number().int().min(4).max(24).default(10),
      min: z.number().int().min(4).max(24).default(5),
      max: z.number().int().min(4).max(24).default(14),
      rationale: z.string().default("围绕核心结论合并相关证据"),
    })
    .default({
      target: 10,
      min: 5,
      max: 14,
      rationale: "围绕核心结论合并相关证据",
    }),
  slides: z
    .array(
      z.object({
        title: z.string(),
        purpose: z.string().default("传达一个明确观点"),
        layoutIntent: z.string().default("根据内容选择最合适布局"),
        visualType: z.string().default("editorial"),
        contentBudget: z
          .string()
          .default(
            "保留全部关键事实、数字、结论和行动项，只压缩装饰性文案；单页并列条目不超过 12，超出拆成多页",
          ),
        focalPoint: z.string().default("根据观点决定视觉焦点"),
        composition: z.string().default("使用固定画布网格建立清晰层级"),
        visualBrief: z.string().default("用图形表达内容中的真实关系"),
        assetBrief: z.string().default("优先使用可靠素材，否则使用语义化 CSS/SVG"),
        motion: z.string().default("按理解顺序分步出现"),
        storyRole: z.string().default("evidence"),
        // Cover/limitations pages sometimes have no directional relationship
        // and the model emits null. Normalize that valid absence to the
        // generic composition relationship instead of rejecting the whole
        // plan and spending the retry budget on schema noise.
        relationship: z
          .string()
          .nullish()
          .transform((value) => value ?? "将结论与支持证据组合表达"),
        evidence: z.array(z.string()).default([]),
        takeaway: z.string().default("让受众记住本页的核心含义"),
      }),
    )
    .min(1),
});

type PresentationPlan = z.infer<typeof presentationPlanSchema>;

export interface PresentationPageBudget {
  target: number;
  min: number;
  max: number;
  rationale: string;
  explicit: boolean;
}

const GENERIC_CLOSING_TITLE =
  /^(?:(?:谢谢|感谢)(?:大家)?(?:观看|聆听|收看)|报告结束|演示结束|分析完成|数据可复现|Q\s*&\s*A|问答)(?:\s*[|｜:：].*)?$/i;
const FORBID_CLOSING_PAGE_REQUEST =
  /(?:不要|不需要|无需|不用|禁止|去掉|删除|移除)[^。；\n]{0,12}(?:谢谢观看|感谢观看|结束页|收尾页|结尾页|Q\s*&\s*A|问答页)/i;
const EXPLICIT_CLOSING_PAGE_REQUEST =
  /(?:(?:增加|添加|保留|需要|要|包含|使用)[^。；\n]{0,12}(?:谢谢观看|感谢观看|结束页|收尾页|结尾页|Q\s*&\s*A|问答页)|(?:以|用)[^。；\n]{0,8}(?:谢谢观看|感谢观看|Q\s*&\s*A|问答)(?:结束|收尾))/i;

/** Remove a boilerplate closing slide when it adds no new decision or insight. */
export function removeBoilerplateClosingSlides(
  plan: PresentationPlan,
  requirements = "",
): PresentationPlan {
  if (
    plan.slides.length <= 1 ||
    (!FORBID_CLOSING_PAGE_REQUEST.test(requirements) &&
      EXPLICIT_CLOSING_PAGE_REQUEST.test(requirements))
  ) {
    return plan;
  }
  const last = plan.slides.at(-1);
  if (!last || !GENERIC_CLOSING_TITLE.test(last.title.trim())) {
    return plan;
  }
  return { ...plan, slides: plan.slides.slice(0, -1) };
}

/**
 * Keep the planner from turning every source heading or entity into a slide.
 * An explicit request wins; otherwise the budget follows the presentation
 * profile and source size while keeping a normal deck in the 8–12 page range.
 */
export function derivePresentationPageBudget(input: {
  profile: "research" | "pitch" | "product-launch" | "data-story";
  sourceLength: number;
  requirements?: string;
}): PresentationPageBudget {
  const requirement = input.requirements ?? "";
  const range = requirement.match(
    /(?:不超过|最多|控制在|约|生成|做成)?\s*(\d{1,2})\s*(?:-|～|至|到)\s*(\d{1,2})\s*(?:页|张|slides?)/i,
  );
  const exact = requirement.match(
    /(?:不超过|最多|控制在|约|生成)?\s*(\d{1,2})\s*(?:页|张|slides?)/i,
  );
  if (range || exact) {
    const first = Number(range?.[1] ?? exact?.[1]);
    const second = Number(range?.[2] ?? first);
    const min = Math.max(4, Math.min(first, second));
    const max = Math.min(24, Math.max(first, second));
    return {
      target: Math.round((min + max) / 2),
      min,
      max,
      rationale: "遵循用户明确指定的页数范围",
      explicit: true,
    };
  }

  if (input.sourceLength < 6_000) {
    return {
      target: 7,
      min: 5,
      max: 9,
      rationale: "材料较短，合并背景、证据和行动，避免碎片化",
      explicit: false,
    };
  }
  if (input.sourceLength > 28_000) {
    return {
      target: 12,
      min: 8,
      max: 14,
      rationale: "材料较长，只保留主线并将相关证据组合到同一页",
      explicit: false,
    };
  }
  if (input.profile === "pitch" || input.profile === "product-launch") {
    return {
      target: 9,
      min: 7,
      max: 11,
      rationale: "现场讲述优先，围绕机会、证明和行动保持紧凑节奏",
      explicit: false,
    };
  }
  return {
    target: 10,
    min: 8,
    max: 12,
    rationale: "常规演示控制在 8–12 页，组合相关证据而非逐条分页",
    explicit: false,
  };
}

const committedPresentationPageSchema = z.object({
  page: z.number().int().positive(),
  title: z.string().min(1),
  section: z.string().min(1),
  styles: z.array(z.string()),
});

type CommittedPresentationPage = z.infer<typeof committedPresentationPageSchema>;

const presentationRenderingResumeSchema = z.object({
  schema: z.literal("presentation-rendering-resume/v2"),
  plan: presentationPlanSchema,
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  foundationHtml: z.string().min(1),
  foundationHash: z.string().regex(/^[a-f0-9]{64}$/),
  pages: z.array(committedPresentationPageSchema),
  completedPages: z.number().int().nonnegative(),
  generatedChars: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

type PresentationRenderingResume = z.infer<typeof presentationRenderingResumeSchema>;

const presentationRenderingResumeRefSchema = z.object({
  schema: z.literal("presentation-rendering-resume-ref/v2"),
  objectKey: z.string().min(1),
  completedPages: z.number().int().nonnegative(),
  updatedAt: z.string(),
});

type PresentationRenderingResumeRef = z.infer<typeof presentationRenderingResumeRefSchema>;

function omitPassingReviewIssues(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const severity = (item as Record<string, unknown>).severity;
    return severity !== "pass" && severity !== "good";
  });
}

const reviewSchema = z.object({
  summary: z.string().default(""),
  needsRepair: z.boolean().default(false),
  issues: z.preprocess(
    omitPassingReviewIssues,
    z
      .array(
        z.object({
          severity: z.enum(["error", "warning"]).default("warning"),
          page: z.number().int().positive().nullable().optional(),
          problem: z.string(),
          recommendation: z.string(),
        }),
      )
      .default([]),
  ),
});

type VisualReview = z.infer<typeof reviewSchema>;

export function parseVisualReview(value: unknown): VisualReview {
  return reviewSchema.parse(value);
}

const renderIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning"]),
  page: z.number().int().positive(),
  pageId: z.string(),
  elementId: z.string().optional(),
  message: z.string(),
  geometry: z
    .object({
      element: z.object({
        id: z.string().optional(),
        kind: z.string(),
        tagName: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      stage: z.object({ width: z.number(), height: z.number() }),
      overflow: z.object({
        left: z.number(),
        top: z.number(),
        right: z.number(),
        bottom: z.number(),
      }),
      parent: z
        .object({
          id: z.string().optional(),
          tagName: z.string(),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
        .optional(),
      style: z.object({
        display: z.string(),
        position: z.string(),
        overflowX: z.string(),
        overflowY: z.string(),
        fontSize: z.string(),
      }),
    })
    .optional(),
});

const renderSlideSchema = z.object({
  page: z.number().int().positive(),
  pageId: z.string(),
  title: z.string(),
  screenshotDataUrl: z.string().optional(),
  issueCount: z.number().int().nonnegative(),
});

const renderAuditSchema = z.object({
  available: z.boolean(),
  pageCount: z.number().int().nonnegative(),
  issues: z.array(renderIssueSchema),
  slides: z.array(renderSlideSchema),
  consoleErrors: z.array(z.string()),
  summary: z.string(),
});

const presentationReviewResumeSchema = z.object({
  schema: z.literal("presentation-review-resume/v1"),
  htmlHash: z.string().regex(/^[a-f0-9]{64}$/),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  // The reviewed deck as it existed right before repair started. Repair
  // overwrites repair-resume.html on every pass, so keeping this snapshot here
  // preserves the exact version the visual review flagged — the version the
  // user can inspect to judge whether the failure was a real defect or a false
  // positive in the detection logic.
  html: z.string().min(1),
  deterministicIssues: z.array(z.object({ code: z.string(), message: z.string() })),
  renderAudit: renderAuditSchema,
  review: reviewSchema.optional(),
  updatedAt: z.string(),
});

const presentationReviewResumeRefSchema = z.object({
  schema: z.literal("presentation-review-resume-ref/v1"),
  objectKey: z.string().min(1),
  htmlHash: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.string(),
});

const presentationRepairResumeSchema = z.object({
  schema: z.literal("presentation-repair-resume/v1"),
  html: z.string().min(1),
  htmlHash: z.string().regex(/^[a-f0-9]{64}$/),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  repairPass: z.number().int().positive(),
  completedPages: z.array(z.number().int().positive()),
  pendingPages: z.array(z.number().int().positive()),
  previousRepairFailures: z.array(z.string()),
  deterministicIssues: z.array(z.object({ code: z.string(), message: z.string() })),
  renderAudit: renderAuditSchema,
  review: reviewSchema,
  updatedAt: z.string(),
});

const presentationRepairResumeRefSchema = z.object({
  schema: z.literal("presentation-repair-resume-ref/v1"),
  objectKey: z.string().min(1),
  htmlHash: z.string().regex(/^[a-f0-9]{64}$/),
  repairPass: z.number().int().positive(),
  updatedAt: z.string(),
});

type PresentationReviewResume = z.infer<typeof presentationReviewResumeSchema>;
type PresentationReviewResumeRef = z.infer<typeof presentationReviewResumeRefSchema>;
type PresentationRepairResume = z.infer<typeof presentationRepairResumeSchema>;
type PresentationRepairResumeRef = z.infer<typeof presentationRepairResumeRefSchema>;

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
  renderingResume?: PresentationRenderingResumeRef;
  reviewResume?: PresentationReviewResumeRef;
  repairResume?: PresentationRepairResumeRef;
  reviewSummary?: string;
  renderSummary?: string;
  renderIssueCount?: number;
  repairApplied?: boolean;
  /** Pages selected by the latest repair pass and the batch currently running. */
  repairPages?: number[];
  repairingPages?: number[];
  verifyingPages?: number[];
  repairFailedPages?: number[];
  repairedPages?: number[];
  /** Per-page progress for the stages that operate on the whole deck. */
  renderingPages?: number[];
  renderedPages?: number[];
  reviewingPages?: number[];
  reviewedPages?: number[];
  compilingPages?: number[];
  compiledPages?: number[];
  repairPass?: number;
  stoppedAtPhase?: GenerationPhase;
  /** Phase that the API selected for an explicit task retry. */
  retryFromPhase?: string;
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

function isVisibleHeadingMarkup(markup: string): boolean {
  if (/\bhidden\b/i.test(markup)) return false;
  if (/\baria-hidden\s*=\s*["']true["']/i.test(markup)) return false;
  const style = markup.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  return !/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$))/i.test(
    style,
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
      const heading = [...body.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].find((match) =>
        isVisibleHeadingMarkup(match[0] ?? ""),
      );
      if (!heading) {
        return `${open}<h1 data-sg-kind="text" data-sg-id="generated-page-title-${pageIndex}">${safeTitle}</h1>${body}${close}`;
      }
      if (!plannedTitle) return `${open}${body}${close}`;
      const headingText = visibleText(heading[1] ?? "");
      if (headingMatchesPlannedTitle(headingText, plannedTitle)) {
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

function normalizeGridTrackSizing(css: string): string {
  return css.replace(
    /(grid-template-rows\s*:\s*)([^;{}]+)/gi,
    (_match, prefix: string, tracks: string) =>
      `${prefix}${tracks.replace(/\b1fr\b/gi, "minmax(0, 1fr)")}`,
  );
}

/**
 * Page-scoped author CSS usually says `.page-N`, but the page identity the
 * platform guarantees is the native `id="page-N"`. A dead `.page-N` rule is
 * invisible to the author and to the repair loop — measured sizes simply never
 * change — so rewrite the scope onto the selector that always exists. The
 * lookahead keeps keyframe-style names like `page-5-growIn` untouched.
 */
export function normalizePageScopeSelectors(css: string): string {
  return css.replace(/\.page-(\d+)(?![\w-])/g, "#page-$1");
}

export function sanitizePresentationStyles(html: string): string {
  return html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, open, css, close) =>
      `${open}${normalizePageScopeSelectors(normalizeGridTrackSizing(normalizeViewportUnits(css)))}${close}`,
  );
}

/**
 * Models occasionally emit JSON inside data-sg-source/config with JavaScript
 * style escaped quotes (`\"`) instead of HTML entities. In a real DOM those
 * quotes terminate the attribute early, so the chart loses its data before
 * SG.chart or the deterministic QA gate can read it. Normalize only these
 * data-bearing attributes; changing arbitrary script text would be unsafe.
 */
export function normalizePresentationDataAttributes(html: string): string {
  const marker = /\bdata-sg-(?:source|config)\s*=\s*(["'])/gi;
  let result = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(html))) {
    const quote = match[1] ?? '"';
    const valueStart = marker.lastIndex;
    let valueEnd = valueStart;
    let value = "";
    while (valueEnd < html.length) {
      const char = html[valueEnd];
      if (char === "\\" && html[valueEnd + 1] === quote) {
        value += "&quot;";
        valueEnd += 2;
        continue;
      }
      if (char === quote) break;
      value += char;
      valueEnd += 1;
    }
    result += html.slice(cursor, match.index) + match[0];
    result += value.replace(/\\(?:&#x26;)+#x22;/gi, "&quot;");
    if (valueEnd < html.length) result += quote;
    cursor = Math.min(valueEnd + 1, html.length);
    marker.lastIndex = cursor;
  }
  return result + html.slice(cursor);
}

function prepareGeneratedHtml(html: string, title: string, plannedTitles: string[] = []): string {
  let result = sanitizePresentationStyles(
    repairPresentationHtmlContract(
      normalizePresentationDataAttributes(stripCodeFence(html)),
      title,
      plannedTitles,
    ),
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
    const headingText = [...section.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map((match) =>
      visibleText(match[1] ?? ""),
    );
    if (headingText.some((heading) => headingMatchesPlannedTitle(heading, title))) {
      return [];
    }
    return [
      {
        code: "PLANNED_TITLE_MISSING",
        message: `页面 ${index + 1} 可见标题不匹配：当前为“${headingText.join(" / ") || "缺失"}”，期望包含计划核心标题“${titleCore(title)}”（完整规划标题为“${title}”）`,
      },
    ];
  });
}

function compactRenderAudit(
  audit: PresentationRenderAudit,
  pageNumbers?: number[],
): Record<string, unknown> {
  const selected = pageNumbers ? new Set(pageNumbers) : null;
  return {
    available: audit.available,
    pageCount: audit.pageCount,
    ...(selected ? { reviewedPages: [...selected] } : {}),
    summary: audit.summary,
    issues: audit.issues.filter((issue) => !selected || selected.has(issue.page)).slice(0, 80),
    consoleErrors: audit.consoleErrors.slice(0, 12),
    slides: audit.slides
      .filter((slide) => !selected || selected.has(slide.page))
      .map(({ page, pageId, title, issueCount }) => ({
        page,
        pageId,
        title,
        issueCount,
      })),
  };
}

function issueMentionsPage(message: string, page: number): boolean {
  return new RegExp(`(?:页面\\s*(?:page[-_ ]?)?|page[-_ ]?)0*${page}(?:\\D|$)`, "i").test(message);
}

export function visualReviewContent(input: {
  plan: PresentationPlan;
  html: string;
  deterministicIssues: Array<{ code: string; message: string }>;
  audit: PresentationRenderAudit;
  pageNumbers: number[];
}): ChatContentPart[] {
  const selected = new Set(input.pageNumbers);
  const sections = extractSlideBatch(input.html).sections;
  const batchHtml = input.pageNumbers
    .map((page) => sections[page - 1] ?? "")
    .filter(Boolean)
    .join("\n");
  const batchSlides = input.pageNumbers.map((page) => ({
    page,
    ...input.plan.slides[page - 1],
  }));
  const deterministicIssues = input.deterministicIssues.filter((issue) => {
    const mentionsAnyPage = Array.from(
      { length: input.plan.slides.length },
      (_unused, index) => index + 1,
    ).some((page) => issueMentionsPage(issue.message, page));
    return (
      !mentionsAnyPage || input.pageNumbers.some((page) => issueMentionsPage(issue.message, page))
    );
  });
  const parts: ChatContentPart[] = [
    {
      type: "text",
      text: JSON.stringify({
        task: `只审查第 ${input.pageNumbers.join("、")} 页。逐页结合真实截图、元素几何诊断和 HTML 判断构图、视觉层级、留白、字体、图形表达和专业程度。issues 只列出需要修复的问题；通过审查的页面不要添加 issue，不得使用 pass、good 或 info。每个问题必须填写对应原始页码，不要评价未提供的页面。`,
        deckContext: {
          audience: input.plan.audience,
          coreMessage: input.plan.coreMessage,
          narrative: input.plan.narrative,
          visualDirection: input.plan.visualDirection,
          selectedStyle: input.plan.selectedStyle,
          designSystem: input.plan.designSystem,
        },
        slides: batchSlides,
        deterministicIssues,
        renderAudit: compactRenderAudit(input.audit, input.pageNumbers),
        html: batchHtml.slice(0, 90_000),
        outputSchema: {
          type: "object",
          required: ["summary", "needsRepair", "issues"],
          properties: {
            summary: { type: "string" },
            needsRepair: { type: "boolean" },
            issues: {
              type: "array",
              description: "仅包含需要修复的问题；通过页不输出条目",
              items: {
                type: "object",
                required: ["severity", "page", "problem", "recommendation"],
                properties: {
                  severity: { type: "string", enum: ["error", "warning"] },
                  page: { type: ["number", "null"] },
                  problem: { type: "string" },
                  recommendation: { type: "string" },
                },
              },
            },
          },
        },
      }),
    },
  ];
  for (const slide of input.audit.slides.filter((item) => selected.has(item.page))) {
    if (!slide.screenshotDataUrl) continue;
    parts.push({ type: "text", text: `第 ${slide.page} 页截图：${slide.title}` });
    parts.push({
      type: "image_url",
      image_url: { url: slide.screenshotDataUrl, detail: "high" },
    });
  }
  return parts;
}

export function globalVisualReviewContent(input: {
  plan: PresentationPlan;
  batchReviews: Array<{ pages: number[]; review: VisualReview }>;
}): ChatContentPart[] {
  return [
    {
      type: "text",
      text: JSON.stringify({
        task: "根据所有逐页审查结果做一次轻量全局汇总。只检查跨页叙事连续性、视觉系统一致性、重复表达和整体汇报质量；不要虚构逐页截图问题。issues 只列出需要修复的问题；通过审查的页面不要添加 issue，不得使用 pass、good 或 info。",
        plan: input.plan,
        batchReviews: input.batchReviews,
        outputSchema: {
          type: "object",
          required: ["summary", "needsRepair", "issues"],
          properties: {
            summary: { type: "string" },
            needsRepair: { type: "boolean" },
            issues: {
              type: "array",
              description: "仅包含需要修复的问题；通过页不输出条目",
              items: {
                type: "object",
                required: ["severity", "page", "problem", "recommendation"],
                properties: {
                  severity: { type: "string", enum: ["error", "warning"] },
                  page: { type: ["number", "null"] },
                  problem: { type: "string" },
                  recommendation: { type: "string" },
                },
              },
            },
          },
        },
      }),
    },
  ];
}

export function mergeVisualReviews(reviews: VisualReview[]): VisualReview {
  const issues = new Map<string, VisualReview["issues"][number]>();
  for (const review of reviews) {
    for (const issue of review.issues) {
      const key = [issue.severity, issue.page ?? "deck", issue.problem, issue.recommendation].join(
        "\u0000",
      );
      issues.set(key, issue);
    }
  }
  const mergedIssues = [...issues.values()];
  return {
    summary:
      reviews.at(-1)?.summary ||
      reviews
        .map((review) => review.summary)
        .filter(Boolean)
        .join("；"),
    needsRepair:
      reviews.some((review) => review.needsRepair) ||
      mergedIssues.some((issue) => issue.severity === "error"),
    issues: mergedIssues,
  };
}

function extractCompletedPageTitles(html: string): string[] {
  const titles: string[] = [];
  const sections = html.match(/<section\b[^>]*data-sg-page[^>]*>[\s\S]*?<\/section>/gi) ?? [];
  for (const section of sections) {
    const title =
      section.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i)?.[1] ?? `第 ${titles.length + 1} 页`;
    const plain = visibleText(title);
    titles.push(plain || `第 ${titles.length + 1} 页`);
  }
  return titles;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function planHash(plan: PresentationPlan): string {
  return sha256(JSON.stringify(plan));
}

export function validatePresentationPlan(
  plan: PresentationPlan,
  budget?: PresentationPageBudget,
): string[] {
  const seen = new Map<string, number>();
  const issues: string[] = [];
  if (budget && plan.slides.length > budget.max) {
    issues.push(
      `规划了 ${plan.slides.length} 页，超过整篇页数上限 ${budget.max} 页；请合并同一问题、趋势、比较维度或因果链下的页面，不要一条事实一页`,
    );
  }
  plan.slides.forEach((slide, index) => {
    const key = titleCore(slide.title).toLocaleLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      issues.push(`第 ${index + 1} 页与第 ${previous + 1} 页使用了重复标题“${slide.title}”`);
    } else {
      seen.set(key, index);
    }
  });
  return issues;
}

function visibleText(value: string): string {
  return (
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (match, token: string) => {
        const codePoint = token.toLowerCase().startsWith("x")
          ? Number.parseInt(token.slice(1), 16)
          : Number.parseInt(token, 10);
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
          return match;
        }
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      })
      // Treat full-width punctuation and compatibility glyphs as their normal
      // visible equivalents while keeping page identity attributes strict.
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Semantic page labels (for example “封面：…”) may prefix the planned title. */
function titleCore(value: string): string {
  const normalized = visibleText(value);
  const match = normalized.match(
    /^(?:封面|开场|结论|总结|结束页|行动项|数据与限制|cover|conclusion|closing|action items?)\s*[:：]\s*(.+)$/i,
  );
  return match?.[1]?.trim() || normalized;
}

function headingMatchesPlannedTitle(heading: string, plannedTitle: string): boolean {
  const normalizedHeading = visibleText(heading);
  const fullTitle = visibleText(plannedTitle);
  const coreTitleValue = titleCore(plannedTitle);
  if (!normalizedHeading || !coreTitleValue) return false;
  const compactHeading = normalizedHeading.replace(/\s+/g, "");
  const stripRange = (value: string) =>
    value.replace(/\s*[\(\uff08][^\)\uff09]*[\)\uff09]\s*$/, "");
  return [fullTitle, coreTitleValue, stripRange(fullTitle), stripRange(coreTitleValue)].some(
    (candidate) => {
      const compactCandidate = candidate.replace(/\s+/g, "");
      return (
        compactCandidate &&
        (normalizedHeading === candidate ||
          normalizedHeading.includes(candidate) ||
          compactHeading === compactCandidate ||
          compactHeading.includes(compactCandidate))
      );
    },
  );
}

/**
 * When a model returns a structurally valid page but uses its focal point as
 * the visible heading, repair that deterministic contract locally. This keeps
 * the model-generated body and styling intact while preventing retries from
 * repeating the same title mistake.
 */
export function repairGeneratedPresentationPageTitle(input: {
  output: string;
  expectedPage: number;
  expectedTitle: string;
}): string | null {
  const html = stripCodeFence(input.output);
  const extracted = extractSlideBatch(html);
  const sectionOpenCount = html.match(/<section\b/gi)?.length ?? 0;
  const sectionCloseCount = html.match(/<\/section\s*>/gi)?.length ?? 0;
  if (sectionOpenCount !== 1 || sectionCloseCount !== 1 || extracted.sections.length !== 1) {
    return null;
  }
  if (/<\/?(?:html|head|body)\b|<script\b/i.test(html)) return null;
  let section = extracted.sections[0] ?? "";
  const expectedIdentity = `page-${input.expectedPage}`;
  // Normalize identity attributes if missing or mismatched
  const pageAttr = section.match(/\bdata-sg-page=["']([^"']+)["']/i)?.[1];
  const idAttr = section.match(/\bdata-sg-id=["']([^"']+)["']/i)?.[1];
  if (pageAttr !== expectedIdentity) {
    section = pageAttr
      ? section.replace(/\bdata-sg-page=["'][^"']*["']/i, `data-sg-page="${expectedIdentity}"`)
      : section.replace(/<section\b/i, `<section data-sg-page="${expectedIdentity}"`);
  }
  if (idAttr !== expectedIdentity) {
    section = idAttr
      ? section.replace(/\bdata-sg-id=["'][^"']*["']/i, `data-sg-id="${expectedIdentity}"`)
      : section.replace(/<section\b/i, `<section data-sg-id="${expectedIdentity}"`);
  }
  const headings = [...section.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map((match) =>
    visibleText(match[1] ?? ""),
  );
  const styles = extracted.styles.map((css) => `<style data-sg-page-style>${css}</style>`).join("\n");
  const baseRepaired = styles ? `${section}\n${styles}` : section;
  if (headings.some((heading) => headingMatchesPlannedTitle(heading, input.expectedTitle))) {
    return baseRepaired === html ? null : baseRepaired;
  }
  const repaired = repairPresentationHtmlContract(baseRepaired, "", [input.expectedTitle]);
  return repaired === html ? null : repaired;
}

/**
 * Deterministic salvage for page outputs that violate the no-document/no-script
 * contract. Models occasionally wrap a structurally perfect page in a full HTML
 * document (mirroring the foundation they were shown) or attach inline
 * <script> animation blocks; six retries have usually failed by the time this
 * runs. Take the single page section, drop scripts and event handlers, and
 * salvage authored <style> blocks that live outside the section (typically in
 * the wrapped document's head).
 */
export function repairGeneratedPresentationPageContract(
  output: string,
  expectedPage?: number,
): string | null {
  const html = stripCodeFence(output);
  let sections = html.match(/<section\b[^>]*data-sg-page[^>]*>[\s\S]*?<\/section>/gi);
  if (!sections || sections.length === 0) {
    sections = html.match(/<section\b[\s\S]*?<\/section>/gi);
  }
  if (!sections || sections.length !== 1) return null;
  let section = sections[0] ?? "";
  if (expectedPage !== undefined) {
    const expectedIdentity = `page-${expectedPage}`;
    const pageAttr = section.match(/\bdata-sg-page=["']([^"']+)["']/i)?.[1];
    const idAttr = section.match(/\bdata-sg-id=["']([^"']+)["']/i)?.[1];
    if (pageAttr !== expectedIdentity) {
      section = pageAttr
        ? section.replace(/\bdata-sg-page=["'][^"']*["']/i, `data-sg-page="${expectedIdentity}"`)
        : section.replace(/<section\b/i, `<section data-sg-page="${expectedIdentity}"`);
    }
    if (idAttr !== expectedIdentity) {
      section = idAttr
        ? section.replace(/\bdata-sg-id=["'][^"']*["']/i, `data-sg-id="${expectedIdentity}"`)
        : section.replace(/<section\b/i, `<section data-sg-id="${expectedIdentity}"`);
    }
  }
  const sectionStart = html.indexOf(sections[0] ?? "");
  const outside = html.slice(0, sectionStart) + html.slice(sectionStart + (sections[0] ?? "").length);
  const salvagedStyles = [...outside.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
    .map((match) => (match[1] ?? "").trim())
    .filter(Boolean);
  const cleaned = section
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  const styleBlocks = salvagedStyles
    .map((css) => `<style data-sg-page-style>${css}</style>`)
    .join("\n");
  const repaired = styleBlocks ? `${cleaned}\n${styleBlocks}` : cleaned;
  if (/<\/?(?:html|head|body)\b|<script\b/i.test(repaired)) return null;
  if (repaired === html) return null;
  return repaired;
}

export function validateGeneratedPresentationPage(input: {
  output: string;
  expectedPage: number;
  expectedTitle: string;
}): { page: CommittedPresentationPage | null; issues: string[] } {
  const html = stripCodeFence(input.output);
  const extracted = extractSlideBatch(html);
  const sectionOpenCount = html.match(/<section\b/gi)?.length ?? 0;
  const sectionCloseCount = html.match(/<\/section\s*>/gi)?.length ?? 0;
  const issues: string[] = [];
  if (sectionOpenCount !== 1 || sectionCloseCount !== 1 || extracted.sections.length !== 1) {
    issues.push(
      `必须且只能输出一个完整页面 section（开始 ${sectionOpenCount}，结束 ${sectionCloseCount}，可解析 ${extracted.sections.length}）`,
    );
  }
  if (/<\/?(?:html|head|body)\b|<script\b/i.test(html)) {
    issues.push("页面输出不能包含 html、head、body 或 script 标签");
  }
  const section = extracted.sections[0] ?? "";
  const expectedIdentity = `page-${input.expectedPage}`;
  const pageIdentity = section.match(/\bdata-sg-page=["']([^"']+)["']/i)?.[1];
  const idIdentity = section.match(/\bdata-sg-id=["']([^"']+)["']/i)?.[1];
  if (pageIdentity !== expectedIdentity) {
    issues.push(`data-sg-page 必须为 ${expectedIdentity}，实际为 ${pageIdentity ?? "缺失"}`);
  }
  if (idIdentity !== expectedIdentity) {
    issues.push(`data-sg-id 必须为 ${expectedIdentity}，实际为 ${idIdentity ?? "缺失"}`);
  }
  const headings = [...section.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map((match) =>
    visibleText(match[1] ?? ""),
  );
  if (!headings.some((heading) => headingMatchesPlannedTitle(heading, input.expectedTitle))) {
    issues.push(
      `可见 h1/h2 标题不匹配：当前可见标题为“${headings.join(" / ") || "缺失"}”；必须包含计划核心标题“${titleCore(input.expectedTitle)}”（完整规划标题为“${input.expectedTitle}”）`,
    );
  }
  const remainder = html
    .replace(/<section\b[^>]*data-sg-page[^>]*>[\s\S]*?<\/section>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (remainder) issues.push("section/style 之外不能包含解释或其他内容");
  if (issues.length > 0 || !section) return { page: null, issues };
  const page = namespacePresentationPageAnimations({
    page: input.expectedPage,
    title: input.expectedTitle,
    section,
    styles: extracted.styles,
  });
  return {
    page,
    issues: [],
  };
}

function validateCommittedPresentationPages(
  plan: PresentationPlan,
  pages: CommittedPresentationPage[],
): string[] {
  if (pages.length > plan.slides.length) {
    return [`断点包含 ${pages.length} 页，超过计划的 ${plan.slides.length} 页`];
  }
  const issues: string[] = [];
  pages.forEach((page, index) => {
    const expectedPage = index + 1;
    const expectedTitle = plan.slides[index]?.title ?? "";
    if (page.page !== expectedPage) {
      issues.push(`断点第 ${index + 1} 项页码为 ${page.page}，不是连续页 ${expectedPage}`);
      return;
    }
    if (page.title !== expectedTitle) {
      issues.push(`第 ${expectedPage} 页断点标题与当前规划不一致`);
      return;
    }
    const validation = validateGeneratedPresentationPage({
      output: `${page.section}${page.styles.map((style) => `<style>${style}</style>`).join("")}`,
      expectedPage,
      expectedTitle,
    });
    issues.push(...validation.issues.map((issue) => `第 ${expectedPage} 页：${issue}`));
  });
  return issues;
}

function validateRenderingResume(resume: PresentationRenderingResume): string[] {
  const issues = validateCommittedPresentationPages(resume.plan, resume.pages);
  if (resume.completedPages !== resume.pages.length) {
    issues.push(
      `断点完成页数 ${resume.completedPages} 与已提交页面数 ${resume.pages.length} 不一致`,
    );
  }
  if (resume.planHash !== planHash(resume.plan)) issues.push("断点规划指纹不匹配");
  if (resume.foundationHash !== sha256(resume.foundationHtml)) {
    issues.push("断点 foundation 指纹不匹配");
  }
  if (!resume.foundationHtml.includes(GENERATED_SLIDES_MARKER)) {
    issues.push(`断点 foundation 缺少 ${GENERATED_SLIDES_MARKER}`);
  }
  return issues;
}

export function validateFinalPresentationPageSet(html: string, plannedTitles: string[]): string[] {
  const sections = extractSlideBatch(html).sections;
  const issues: string[] = [];
  if (sections.length !== plannedTitles.length) {
    issues.push(`最终页面数量为 ${sections.length}，计划数量为 ${plannedTitles.length}`);
  }
  const ids = sections.map((section) => section.match(/\bdata-sg-id=["']([^"']+)["']/i)?.[1] ?? "");
  if (new Set(ids).size !== ids.length) issues.push("最终页面存在重复 data-sg-id");
  sections.forEach((section, index) => {
    const expected = `page-${index + 1}`;
    const pageId = section.match(/\bdata-sg-page=["']([^"']+)["']/i)?.[1];
    const id = ids[index];
    if (pageId !== expected || id !== expected) {
      issues.push(`第 ${index + 1} 页身份不一致，必须为 ${expected}`);
    }
    const title = plannedTitles[index] ?? "";
    const headings = [...section.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map((match) =>
      visibleText(match[1] ?? ""),
    );
    if (title && !headings.some((heading) => headingMatchesPlannedTitle(heading, title))) {
      issues.push(
        `第 ${index + 1} 页可见标题不匹配：当前为“${headings.join(" / ") || "缺失"}”，期望包含计划核心标题“${titleCore(title)}”（完整规划标题为“${title}”）`,
      );
    }
  });
  return issues;
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

function cssIdentifierPattern(value: string): RegExp {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zA-Z0-9_-])${escaped}(?=$|[^a-zA-Z0-9_-])`, "g");
}

function rewriteAnimationNames(value: string, names: Map<string, string>): string {
  let result = value;
  for (const [name, replacement] of names) {
    result = result.replace(cssIdentifierPattern(name), `$1${replacement}`);
  }
  return result;
}

function rewritePageAnimationCss(css: string, names: Map<string, string>): string {
  const renamedKeyframes = css.replace(
    /(@(?:-[a-z]+-)?keyframes\s+)([-_a-zA-Z][\w-]*)/gi,
    (match, prefix: string, name: string) => {
      const replacement = names.get(name);
      return replacement ? `${prefix}${replacement}` : match;
    },
  );
  return renamedKeyframes.replace(
    /(\b(?:-webkit-)?animation(?:-name)?\s*:\s*)([^;}]+)/gi,
    (_match, prefix: string, value: string) => `${prefix}${rewriteAnimationNames(value, names)}`,
  );
}

/**
 * CSS keyframe names are document-global even when their <style> tag lives in a
 * page section. Prefix every AI-authored page keyframe and its page-local
 * references before pages are merged into the shared presentation document.
 */
export function namespacePresentationPageAnimations(
  page: CommittedPresentationPage,
): CommittedPresentationPage {
  const pageId = `page-${page.page}`;
  const cssSources = [
    ...page.styles,
    ...Array.from(page.section.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)).map(
      (match) => match[1] ?? "",
    ),
  ];
  const names = new Map<string, string>();
  for (const css of cssSources) {
    for (const match of css.matchAll(/@(?:-[a-z]+-)?keyframes\s+([-_a-zA-Z][\w-]*)/gi)) {
      const name = match[1];
      if (!name) continue;
      names.set(name, name.startsWith(`${pageId}-`) ? name : `${pageId}-${name}`);
    }
  }
  if (names.size === 0) return page;

  let section = page.section.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, open: string, css: string, close: string) =>
      `${open}${rewritePageAnimationCss(css, names)}${close}`,
  );
  section = section.replace(
    /(\bstyle\s*=\s*)(["'])([\s\S]*?)\2/gi,
    (_match, prefix: string, quote: string, css: string) =>
      `${prefix}${quote}${rewritePageAnimationCss(css, names)}${quote}`,
  );
  section = section.replace(
    /(\bclass\s*=\s*)(["'])([\s\S]*?)\2/gi,
    (_match, prefix: string, quote: string, className: string) => {
      const rewritten = className.replace(/animate-\[([^\]]+)]/g, (token, animation: string) => {
        const value = animation
          .split(",")
          .map((item) => {
            for (const [name, replacement] of names) {
              if (item === name || item.startsWith(`${name}_`)) {
                return `${replacement}${item.slice(name.length)}`;
              }
            }
            return item;
          })
          .join(",");
        return value === animation ? token : `animate-[${value}]`;
      });
      return `${prefix}${quote}${rewritten}${quote}`;
    },
  );

  return {
    ...page,
    section,
    styles: page.styles.map((css) => rewritePageAnimationCss(css, names)),
  };
}

export function assemblePresentationFoundation(
  foundation: string,
  sections: string[],
  pageStyles: string[],
): string {
  const foundationWithOnlySlot = foundation.includes(GENERATED_SLIDES_MARKER)
    ? foundation.replace(/(<body\b[^>]*>)[\s\S]*?(<\/body>)/i, `$1${GENERATED_SLIDES_MARKER}$2`)
    : foundation;
  const cleanFoundation = foundationWithOnlySlot.replace(
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
  /**
   * The model review is a snapshot from before repair started. Reusing its
   * page errors after a repair pass makes already-fixed pages re-enter the
   * queue. Keep it enabled for the initial pass, then rely on fresh checks.
   */
  includeReviewIssues?: boolean;
}): number[] {
  const pages = new Set<number>();
  for (const issue of input.renderAudit.issues) {
    if (issue.severity === "error" && issue.page >= 1 && issue.page <= input.pageCount) {
      pages.add(issue.page);
    }
  }
  if (input.includeReviewIssues !== false) {
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
  }
  for (const issue of input.deterministicIssues) {
    const match = issue.message.match(/(?:页面\s*(?:page[-_ ]?)?|page[-_ ]?)0*(\d+)/i);
    const page = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    if (page >= 1 && page <= input.pageCount) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

/**
 * Stable fingerprint of a page's blocking render issues (code + element + the
 * measured design font size). Comparing it across repair passes detects repairs
 * that changed nothing in the rendered output — the signature of author CSS
 * that never matched its target, which no amount of redesign advice will fix.
 */
export function renderAuditErrorSignature(audit: PresentationRenderAudit, page: number): string {
  const parts: string[] = [];
  for (const issue of audit.issues) {
    if (issue.severity !== "error" || issue.page !== page) continue;
    const design =
      issue.code === "RENDER_FONT_TOO_SMALL"
        ? `:${issue.message.match(/设计 ([\d.]+)px/)?.[1] ?? ""}`
        : "";
    parts.push(`${issue.code}:${issue.elementId ?? ""}${design}`);
  }
  return parts.sort().join("|");
}

/**
 * Micro-adjustments converge slowly enough to burn the whole pass budget on
 * pages that need a different layout. When a pass reproduces the same issue
 * codes as the previous one, jump straight to the structural instructions.
 */
export function repairEscalationInstruction(
  repairPass: number,
  previousFailures: string[],
  stagnant = false,
): string {
  const geometryHint = previousFailures.some((failure) =>
    /越出固定画布|裁切|重叠|字号|超过 1920×1080/.test(failure),
  )
    ? "逐项读取 renderIssues.geometry 中的元素坐标、四向越界像素、父容器矩形和计算样式，并对照随附截图修复；所有内容与画布边缘至少保留 32px 安全距离。"
    : "逐项对应输入中的诊断和截图，不要做与阻断问题无关的改写。";
  const level = stagnant ? Math.max(repairPass, 3) : repairPass;
  if (level <= 1) return `【修复策略】${geometryHint}`;
  if (level === 2) {
    return `【升级修复策略】上一轮复检未通过。${geometryHint} 必须重建问题区域的网格或 flex 结构，不得只微调 margin、padding 或 gap。`;
  }
  if (level === 3) {
    return `【升级修复策略】同类问题已连续出现。${geometryHint} 对密集表格或列表改用紧凑矩阵、分组栏或多列布局；保留事实，但移除装饰和重复标签。若提示需要压缩内容，必须先删除条目或缩短文案，再放大字号。`;
  }
  return `【最终修复策略】此前布局方案已被复检证明不可行。${geometryHint} 放弃原有构图并重新设计内容区域；优先保证固定画布内完整、可读、无裁切，不得再次沿用失败结构。`;
}

export function shouldParkNoEffectRepair(input: {
  noEffectAttempts: number;
}): boolean {
  return input.noEffectAttempts >= MAX_NO_EFFECT_REPAIR_ATTEMPTS;
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
  run: (attempt: number) => Promise<T>;
}): Promise<T> {
  let lastError: unknown;
  const maxAttempts = MAX_TASK_UNIT_RETRIES + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (input.signal?.aborted) throw input.signal.reason;
    try {
      return await input.run(attempt);
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
      const rateLimited = /\b429\b|TooManyRequests|RateLimitExceeded|RATE_LIMITED/i.test(
        error instanceof Error ? error.message : String(error),
      );
      // Account-level gateway limits need a real cooldown. Retrying every few
      // hundred milliseconds only burns the whole retry budget inside the
      // same rate-limit window and makes a transient provider response look
      // like a deterministic generation failure.
      const delayMs = rateLimited
        ? Math.min(60_000, 10_000 * 2 ** (attempt - 1))
        : Math.min(2_000, 250 * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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

export function strictRetryInstruction(
  attempt: number,
  format: "json" | "html",
  failureReason = "",
): string {
  const reason = failureReason.trim();
  if (attempt <= 1 && !reason) return "";
  const generic =
    format === "json"
      ? "【重试约束】上一次输出未通过 JSON 校验。本轮必须从第一个字符开始只输出一个完整、可解析的 JSON 对象；不要解释、不要 Markdown；如需能力只调用相关 Skill 工具，并在工具返回后继续输出 JSON。"
      : "【重试约束】上一次输出未生成可解析页面。本轮必须从第一个字符开始直接输出完整 HTML 产物；不要解释、不要 Markdown；如需能力只调用相关 Skill 工具，并在工具返回后继续输出 HTML；严格保留要求的页数和标记。";
  if (!reason) return generic;
  return `${generic}\n【上一次具体校验失败原因】${reason}\n【本轮修正要求】只修正上述失败原因，修正后再输出完整产物；不要重复同一错误。`;
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

  // Keep annotation requests page-local. A whole-deck request can contain
  // hundreds of elements and is very likely to hit the model output limit
  // halfway through the JSON document, leaving an unparseable response.
  const elementsByPage = new Map<string, typeof instrumented.manifest.elements>();
  for (const element of instrumented.manifest.elements) {
    const pageId = element.pageId ?? "__unassigned__";
    const pageElements = elementsByPage.get(pageId) ?? [];
    pageElements.push(element);
    elementsByPage.set(pageId, pageElements);
  }

  try {
    const annotations = [];
    for (const [pageId, pageElements] of elementsByPage) {
      let previousFailure = "";
      const expectedIds = new Set(pageElements.map((element) => element.id));
      const pageNumber = instrumented.manifest.pages.find((page) => page.id === pageId)?.index;
      const result = await retryTaskUnit({
        taskId,
        logger,
        stage: `compiling.annotation.page-${(pageNumber ?? 0) + 1}`,
        signal,
        run: async (attempt) => {
          try {
            const response = await ai.completeJsonStream(
              {
                messages: [
                  {
                    role: "system",
                    content: [
                      annotationPrompt,
                      `当前只处理页面 ${pageNumber === undefined ? pageId : pageNumber + 1}。`,
                      "只返回当前页面元素的 JSON 标注，不要输出其他页面元素、解释或 Markdown。",
                      strictRetryInstruction(attempt, "json", previousFailure),
                    ]
                      .filter(Boolean)
                      .join("\n\n"),
                  },
                  {
                    role: "user",
                    content: JSON.stringify({
                      pageId,
                      elements: pageElements.map(({ id, kind, tagName, text }) => ({
                        id,
                        kind,
                        tagName,
                        text,
                      })),
                    }),
                  },
                ],
                quality: "balanced",
                maxTokens: REPAIR_MAX_OUTPUT_TOKENS,
                fallbackToLocal: false,
                taskId,
                modelTaskKey: "presentation.annotation",
                signal,
                agentMode: "direct",
              },
              annotationSchema,
              onUpdate,
            );
            const returnedIds = new Set(response.data.elements.map((element) => element.id));
            const validElements = response.data.elements.filter((element) => expectedIds.has(element.id));
            const missingElements = pageElements
              .filter((element) => !returnedIds.has(element.id))
              .map((element) => {
                let role = "body";
                if (/^h[12]$/i.test(element.tagName)) role = "title";
                else if (/^h[34]$/i.test(element.tagName)) role = "subtitle";
                else if (element.kind === "chart") role = "chart";
                else if (element.kind === "metric") role = "metric";
                else if (element.kind === "image" || /^img$/i.test(element.tagName)) role = "image";
                else if (element.kind === "table" || /^table$/i.test(element.tagName)) role = "table";
                else if (/(?:source|footer)/i.test(element.id)) role = "source";
                return { id: element.id, role, editable: true };
              });
            return {
              data: {
                elements: [...validElements, ...missingElements],
              },
            };
          } catch (error) {
            previousFailure = error instanceof Error ? error.message : String(error);
            logger.warn(
              { taskId, pageId, err: previousFailure },
              "page annotation attempt failed; applying rule-based default roles",
            );
            const fallbackElements = pageElements.map((element) => {
              let role = "body";
              if (/^h[12]$/i.test(element.tagName)) role = "title";
              else if (/^h[34]$/i.test(element.tagName)) role = "subtitle";
              else if (element.kind === "chart") role = "chart";
              else if (element.kind === "metric") role = "metric";
              else if (element.kind === "image" || /^img$/i.test(element.tagName)) role = "image";
              else if (element.kind === "table" || /^table$/i.test(element.tagName)) role = "table";
              return { id: element.id, role, editable: true };
            });
            return { data: { elements: fallbackElements } };
          }
        },
      });
      annotations.push(...result.data.elements);
    }
    return applyPresentationAnnotations(instrumented.html, annotations);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    logger.warn(
      { taskId, err: error instanceof Error ? error.message : String(error) },
      "presentation annotation compiling encountered an error; continuing with safe fallback annotations",
    );
    const fallbackAnnotations = instrumented.manifest.elements.map((element) => {
      let role = "body";
      if (/^h[12]$/i.test(element.tagName)) role = "title";
      else if (/^h[34]$/i.test(element.tagName)) role = "subtitle";
      else if (element.kind === "chart") role = "chart";
      else if (element.kind === "metric") role = "metric";
      else if (element.kind === "image" || /^img$/i.test(element.tagName)) role = "image";
      else if (element.kind === "table" || /^table$/i.test(element.tagName)) role = "table";
      return { id: element.id, role, editable: true };
    });
    return applyPresentationAnnotations(instrumented.html, fallbackAnnotations);
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

  const previousTaskState = await retryTaskUnit({
    taskId: ctx.taskId,
    logger: ctx.logger,
    stage: "source.resume-state",
    run: () => ctx.api.getTaskState(ctx.taskId),
  });
  const previousCheckpoint = previousTaskState.checkpoint as GenerationCheckpoint | null;
  const resumeRef = presentationRenderingResumeRefSchema.safeParse(
    previousCheckpoint?.renderingResume,
  );
  let renderingResume: PresentationRenderingResume | null = null;
  if (resumeRef.success) {
    const storedResume = await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "source.resume-read",
      run: () => storage.get(resumeRef.data.objectKey),
    });
    if (storedResume) {
      try {
        const candidateResume = presentationRenderingResumeSchema.parse(
          JSON.parse(storedResume.toString("utf8")),
        );
        const resumeIssues = validateRenderingResume(candidateResume);
        if (resumeIssues.length > 0) {
          throw new Error(resumeIssues.join("；"));
        }
        renderingResume = candidateResume;
      } catch (error) {
        ctx.logger.warn(
          { taskId: ctx.taskId, err: String(error) },
          "presentation rendering resume checkpoint is invalid; starting a fresh render",
        );
      }
    }
  }

  let reviewResume: PresentationReviewResume | null = null;
  const reviewResumeRef = presentationReviewResumeRefSchema.safeParse(
    previousCheckpoint?.reviewResume,
  );
  if (reviewResumeRef.success) {
    const storedReviewResume = await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "source.review-resume-read",
      run: () => storage.get(reviewResumeRef.data.objectKey),
    });
    if (storedReviewResume) {
      try {
        reviewResume = presentationReviewResumeSchema.parse(
          JSON.parse(storedReviewResume.toString("utf8")),
        );
      } catch (error) {
        ctx.logger.warn(
          { taskId: ctx.taskId, err: String(error) },
          "presentation review resume checkpoint is invalid; rerendering review input",
        );
      }
    }
  }

  let repairResume: PresentationRepairResume | null = null;
  const repairResumeRef = presentationRepairResumeRefSchema.safeParse(
    previousCheckpoint?.repairResume,
  );
  if (repairResumeRef.success) {
    const storedRepairResume = await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "source.repair-resume-read",
      run: () => storage.get(repairResumeRef.data.objectKey),
    });
    if (storedRepairResume) {
      try {
        repairResume = presentationRepairResumeSchema.parse(
          JSON.parse(storedRepairResume.toString("utf8")),
        );
      } catch (error) {
        ctx.logger.warn(
          { taskId: ctx.taskId, err: String(error) },
          "presentation repair resume checkpoint is invalid; restarting repair pass",
        );
      }
    }
  }

  const capabilityContext = await retryTaskUnit({
    taskId: ctx.taskId,
    logger: ctx.logger,
    stage: "source.capability-context",
    run: () => loadCapabilityContext(loadCapabilityAgentId(), ctx.taskId),
  });
  // 全流程继续使用 Mastra Agent，并通过 Agent-level Skills 保留 skill、
  // skill_search、skill_read；不挂 Workspace，避免额外注入文件系统/LSP 工具。
  const ai = createAiService({
    quality: "best",
    agentMode: "mastra",
    skills: capabilityContext?.agentSkills,
  });
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
    ...(renderingResume
      ? {
          phase: "rendering",
          phaseLabel: "从断点继续生成页面",
          progress:
            40 +
            Math.floor(
              (renderingResume.pages.length / Math.max(renderingResume.plan.slides.length, 1)) * 32,
            ),
          startedAt: previousCheckpoint?.startedAt ?? new Date().toISOString(),
          receivedChars: renderingResume.generatedChars,
          completedPages: renderingResume.pages.length,
          estimatedPages: renderingResume.plan.slides.length,
          pageTitles: renderingResume.pages.map((page) => page.title),
          plan: renderingResume.plan,
          renderingResume: resumeRef.success ? resumeRef.data : undefined,
          reviewResume: reviewResumeRef.success ? reviewResumeRef.data : undefined,
          repairResume: repairResumeRef.success ? repairResumeRef.data : undefined,
        }
      : {}),
  };
  const retryingReview =
    renderingResume !== null && previousCheckpoint?.retryFromPhase === "reviewing";
  const retryingRepair =
    renderingResume !== null && previousCheckpoint?.retryFromPhase === "repairing";
  const retryingCompiling =
    renderingResume !== null && previousCheckpoint?.retryFromPhase === "compiling";
  if (retryingReview) {
    checkpoint.phase = "reviewing";
    checkpoint.phaseLabel = "等待重新进行视觉审查";
    checkpoint.progress = 81;
    checkpoint.activity = "waiting";
  } else if (retryingRepair) {
    checkpoint.phase = "repairing";
    checkpoint.phaseLabel = "从失败页面继续定向修复";
    checkpoint.progress = 88;
    checkpoint.activity = "waiting";
  } else if (retryingCompiling) {
    checkpoint.phase = "compiling";
    checkpoint.phaseLabel = "等待重新编译编辑能力";
    checkpoint.progress = 95;
    checkpoint.activity = "waiting";
  }
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

  const resumeObjectKey =
    (resumeRef.success && resumeRef.data.objectKey) ||
    `tasks/${ctx.taskId}/presentation/rendering-resume.json`;
  const persistRenderingResume = async (
    resume: Omit<PresentationRenderingResume, "schema" | "updatedAt">,
  ): Promise<PresentationRenderingResume> => {
    const persisted: PresentationRenderingResume = {
      schema: "presentation-rendering-resume/v2",
      ...resume,
      updatedAt: new Date().toISOString(),
    };
    const issues = validateRenderingResume(persisted);
    if (issues.length > 0) {
      throw generationError(
        "PRESENTATION_RESUME_INVALID",
        "rendering",
        `拒绝写入不安全的页面断点：${issues.join("；")}`,
      );
    }
    await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "rendering.resume-write",
      signal: cancellationController.signal,
      run: () =>
        storage.put(resumeObjectKey, Buffer.from(JSON.stringify(persisted)), "application/json"),
    });
    checkpoint.renderingResume = {
      schema: "presentation-rendering-resume-ref/v2",
      objectKey: resumeObjectKey,
      completedPages: persisted.pages.length,
      updatedAt: persisted.updatedAt,
    };
    renderingResume = persisted;
    return persisted;
  };

  const reviewResumeObjectKey =
    (reviewResumeRef.success && reviewResumeRef.data.objectKey) ||
    `tasks/${ctx.taskId}/presentation/review-resume.json`;
  const persistReviewResume = async (input: {
    html: string;
    plan: PresentationPlan;
    deterministicIssues: Array<{ code: string; message: string }>;
    renderAudit: PresentationRenderAudit;
    review?: z.infer<typeof reviewSchema>;
  }): Promise<PresentationReviewResume> => {
    const persisted: PresentationReviewResume = {
      schema: "presentation-review-resume/v1",
      htmlHash: sha256(input.html),
      planHash: planHash(input.plan),
      html: input.html,
      deterministicIssues: input.deterministicIssues,
      renderAudit: input.renderAudit,
      ...(input.review ? { review: input.review } : {}),
      updatedAt: new Date().toISOString(),
    };
    await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "reviewing.resume-write",
      signal: cancellationController.signal,
      run: () =>
        storage.put(
          reviewResumeObjectKey,
          Buffer.from(JSON.stringify(persisted)),
          "application/json",
        ),
    });
    checkpoint.reviewResume = {
      schema: "presentation-review-resume-ref/v1",
      objectKey: reviewResumeObjectKey,
      htmlHash: persisted.htmlHash,
      updatedAt: persisted.updatedAt,
    };
    reviewResume = persisted;
    return persisted;
  };

  const repairResumeObjectKey =
    (repairResumeRef.success && repairResumeRef.data.objectKey) ||
    `tasks/${ctx.taskId}/presentation/repair-resume.json`;
  const persistRepairResume = async (input: {
    html: string;
    plan: PresentationPlan;
    repairPass: number;
    completedPages: number[];
    pendingPages: number[];
    previousRepairFailures: string[];
    deterministicIssues: Array<{ code: string; message: string }>;
    renderAudit: PresentationRenderAudit;
    review: z.infer<typeof reviewSchema>;
  }): Promise<PresentationRepairResume> => {
    const persisted: PresentationRepairResume = {
      schema: "presentation-repair-resume/v1",
      html: input.html,
      htmlHash: sha256(input.html),
      planHash: planHash(input.plan),
      repairPass: input.repairPass,
      completedPages: [...new Set(input.completedPages)].sort((a, b) => a - b),
      pendingPages: [...new Set(input.pendingPages)].sort((a, b) => a - b),
      previousRepairFailures: input.previousRepairFailures,
      deterministicIssues: input.deterministicIssues,
      renderAudit: input.renderAudit,
      review: input.review,
      updatedAt: new Date().toISOString(),
    };
    await retryTaskUnit({
      taskId: ctx.taskId,
      logger: ctx.logger,
      stage: "repairing.resume-write",
      signal: cancellationController.signal,
      run: () =>
        storage.put(
          repairResumeObjectKey,
          Buffer.from(JSON.stringify(persisted)),
          "application/json",
        ),
    });
    checkpoint.repairResume = {
      schema: "presentation-repair-resume-ref/v1",
      objectKey: repairResumeObjectKey,
      htmlHash: persisted.htmlHash,
      repairPass: persisted.repairPass,
      updatedAt: persisted.updatedAt,
    };
    repairResume = persisted;
    return persisted;
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
    await report(
      checkpoint.progress,
      checkpoint.phaseLabel,
      {},
      {
        phase,
        activity,
        delta,
        receivedChars,
        finishReason,
        usage,
      },
    );
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
      await report(
        progress,
        label,
        {
          phase,
          phaseLabel: label,
          activity,
          receivedChars: update.receivedChars,
          completedPages,
          pageTitles,
        },
        {
          phase,
          activity: update.activity,
          delta: pendingStreamDeltas.get(key) ?? "",
          receivedChars: update.receivedChars,
        },
      );
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
      // The streamed body is only a preview. A page becomes completed after the
      // final response passes identity/content validation and is persisted.
      const pageTitles = baseTitles;
      const estimatedPages = Math.max(checkpoint.estimatedPages, 1);
      const committedRatio = Math.min(1, pageTitles.length / estimatedPages);
      const streamedRatio = Math.min(
        0.92,
        Math.log1p(Math.max(0, update.receivedChars)) / Math.log(12_001),
      );
      const ratio = Math.min(0.98, Math.max(committedRatio, streamedRatio * 0.5));
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
      await report(
        progress,
        label,
        {
          phase: "rendering",
          phaseLabel: label,
          activity,
          receivedChars: baseReceivedChars + update.receivedChars,
          completedPages: baseTitles.length,
          pageTitles,
        },
        {
          phase: "rendering",
          activity: update.activity,
          delta: pendingStreamDeltas.get(key) ?? "",
          receivedChars: baseReceivedChars + update.receivedChars,
        },
      );
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
    await report(
      renderingResume ? checkpoint.progress : 8,
      retryingReview || retryingRepair || retryingCompiling
        ? retryingReview
          ? "页面已恢复，准备重新进行视觉审查"
          : retryingRepair
            ? "修复检查点已恢复，准备从失败页面继续"
            : "页面已恢复，准备重新编译编辑能力"
        : renderingResume
          ? "参考资料已恢复，准备从页面断点继续"
          : "参考资料已准备",
      renderingResume
        ? {
            phase: retryingReview
              ? "reviewing"
              : retryingRepair
                ? "repairing"
                : retryingCompiling
                  ? "compiling"
                  : "rendering",
            phaseLabel: retryingReview
              ? "重新进行视觉审查"
              : retryingRepair
                ? "从失败页面继续定向修复"
                : retryingCompiling
                  ? "重新编译编辑能力"
                  : "从断点继续生成页面",
            activity: "processing",
          }
        : {
            phase: "source",
            phaseLabel: "准备参考资料",
            activity: "done",
          },
    );

    const pageBudget = derivePresentationPageBudget({
      profile: parsed.profile,
      sourceLength: source.length,
      requirements: parsed.prompt,
    });

    let plan: PresentationPlan;
    if (renderingResume) {
      plan = renderingResume.plan;
      await report(
        checkpoint.progress,
        retryingReview || retryingRepair || retryingCompiling
          ? retryingReview
            ? "页面已恢复，跳过页面生成，重新进行视觉审查"
            : retryingRepair
              ? "修复检查点已恢复，跳过页面生成和视觉审查，继续定向修复"
              : "页面已恢复，跳过页面生成、渲染和视觉审查，重新编译编辑能力"
          : renderingResume.pages.length < plan.slides.length
            ? `已保留前 ${renderingResume.pages.length} 页，从下一页继续生成`
            : `已恢复全部 ${renderingResume.pages.length} 页，继续后续检查`,
        {
          phase: retryingReview
            ? "reviewing"
            : retryingRepair
              ? "repairing"
              : retryingCompiling
                ? "compiling"
                : "rendering",
          phaseLabel: retryingReview
            ? "重新进行视觉审查"
            : retryingRepair
              ? "从失败页面继续定向修复"
              : retryingCompiling
                ? "重新编译编辑能力"
                : "从断点继续生成页面",
          activity: "processing",
          plan,
          estimatedPages: plan.slides.length,
          completedPages: renderingResume.pages.length,
          pageTitles: renderingResume.pages.map((page) => page.title),
        },
      );
    } else {
      await report(12, "AI 正在推演叙事结构与视觉方向", {
        phase: "planning",
        phaseLabel: "深度规划叙事与视觉",
        activity: "waiting",
      });
      plan = await retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: "planning.model",
        signal: cancellationController.signal,
        run: async (attempt) => {
          const result = await ai.completeStream(
            {
              messages: [
                {
                  role: "system",
                  content: [
                    planningPrompt,
                    `本任务整篇页数预算：目标 ${pageBudget.target} 页，允许范围 ${pageBudget.min}–${pageBudget.max} 页。若当前草稿超过上限，必须先合并相关页面再输出 JSON。预算依据：${pageBudget.rationale}`,
                    capabilityContext?.summary ?? "",
                    strictRetryInstruction(attempt, "json"),
                  ]
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
                    pageBudget,
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
                      pageBudget: {
                        target: pageBudget.target,
                        min: pageBudget.min,
                        max: pageBudget.max,
                        rationale: pageBudget.rationale,
                      },
                      slides: [
                        {
                          title: "string",
                          purpose: "string",
                          layoutIntent: "string",
                          visualType: "string",
                          contentBudget:
                            "保留全部关键事实、数字、结论和行动项，只压缩装饰性文案；单页并列条目不超过 12（卡片/指标/图标卡），表格不超过 14 行，超出必须拆成多页",
                          focalPoint: "string",
                          composition: "string",
                          visualBrief: "string",
                          assetBrief: "string",
                          motion: "string",
                          storyRole:
                            "cover | thesis | problem | evidence | comparison | process | case | implication | action | closing",
                          relationship: "趋势 | 对比 | 因果 | 流程 | 构成 | 优先级 | 组合证据",
                          evidence: ["支持本页结论的数字、事实或来源定位"],
                          takeaway: "string",
                        },
                      ],
                    },
                  }),
                },
              ],
              responseFormat: "json_object",
              structuredOutput: presentationPlanSchema,
              maxTokens: 32_768,
              temperature: 0.75,
              fallbackToLocal: false,
              taskId: ctx.taskId,
              modelTaskKey: "presentation.planning",
              signal: cancellationController.signal,
              agentMode: "direct",
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
            const parsedPlan = presentationPlanSchema.parse(parseJsonText(result.text));
            // The runtime budget is authoritative. Keep the model's rationale
            // and page count from drifting away from the user request or the
            // source-size heuristic used by the validator.
            const normalizedPlan: PresentationPlan = removeBoilerplateClosingSlides(
              {
                ...parsedPlan,
                pageBudget: {
                  target: pageBudget.target,
                  min: pageBudget.min,
                  max: pageBudget.max,
                  rationale: pageBudget.rationale,
                },
              },
              parsed.prompt,
            );
            // Defensively ensure page count stays within budget max without throwing
            if (normalizedPlan.slides.length > pageBudget.max) {
              ctx.logger.info(
                { originalCount: normalizedPlan.slides.length, max: pageBudget.max },
                "clamping planned slides to page budget maximum",
              );
              normalizedPlan.slides = normalizedPlan.slides.slice(0, pageBudget.max);
            }
            // Defensively disambiguate duplicate titles without throwing
            const seenTitles = new Set<string>();
            normalizedPlan.slides.forEach((slide, idx) => {
              const core = slide.title.trim();
              if (seenTitles.has(core.toLowerCase())) {
                slide.title = `${core}（${idx + 1}）`;
              }
              seenTitles.add(slide.title.trim().toLowerCase());
            });
            const planIssues = validatePresentationPlan(normalizedPlan, pageBudget);
            if (planIssues.length > 0) {
              const pageBudgetExceeded = planIssues.some((issue) =>
                issue.includes("超过整篇页数上限"),
              );
              throw generationError(
                pageBudgetExceeded
                  ? "PRESENTATION_PLAN_PAGE_BUDGET_EXCEEDED"
                  : "PRESENTATION_PLAN_DUPLICATE_TITLES",
                "planning",
                pageBudgetExceeded
                  ? `规划超过页数预算：${planIssues.join("；")}`
                  : `规划包含重复页面标题：${planIssues.join("；")}`,
                { planIssues },
              );
            }
            return normalizedPlan;
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
    }

    let rawGeneratedHtml: string;
    let generatedChars: number;
    let sections: string[];
    let pageStyles: string[];
    let completedTitles: string[];
    let committedPages: CommittedPresentationPage[];
    if (renderingResume) {
      rawGeneratedHtml = renderingResume.foundationHtml;
      generatedChars = renderingResume.generatedChars;
      committedPages = renderingResume.pages.map(namespacePresentationPageAnimations);
      sections = committedPages.map((page) => page.section);
      pageStyles = committedPages.flatMap((page) => page.styles);
      completedTitles = committedPages.map((page) => page.title);
    } else {
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
        run: async (attempt) => {
          const result = await ai.completeStream(
            {
              messages: [
                {
                  role: "system",
                  content: [foundationPrompt, strictRetryInstruction(attempt, "html")]
                    .filter(Boolean)
                    .join("\n\n"),
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
              maxTokens: 32_768,
              temperature: attempt === 1 ? 0.72 : 0.22,
              fallbackToLocal: false,
              taskId: ctx.taskId,
              modelTaskKey: "presentation.foundation",
              signal: cancellationController.signal,
              agentMode: "direct",
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
      rawGeneratedHtml = stripCodeFence(foundationResult.text);
      generatedChars = foundationResult.text.length;
      sections = [];
      pageStyles = [];
      completedTitles = [];
      committedPages = [];
      await persistRenderingResume({
        plan,
        foundationHtml: rawGeneratedHtml,
        planHash: planHash(plan),
        foundationHash: sha256(rawGeneratedHtml),
        pages: committedPages,
        completedPages: 0,
        generatedChars,
      });
    }
    if (
      renderingResume &&
      (renderingResume.completedPages !== committedPages.length ||
        committedPages.length > plan.slides.length)
    ) {
      throw generationError(
        "PRESENTATION_RESUME_INVALID",
        "rendering",
        "页面生成断点与当前演示计划不一致，已停止以避免覆盖已生成页面",
        {
          checkpointCompletedPages: renderingResume.completedPages,
          completedPages: committedPages.length,
          plannedPages: plan.slides.length,
        },
      );
    }
    while (committedPages.length < plan.slides.length) {
      const from = committedPages.length;
      const batch = plan.slides.slice(from, from + PAGE_BATCH_SIZE);
      const label = `逐页设计第 ${from + 1} / ${plan.slides.length} 页`;
      await report(40 + Math.floor((from / Math.max(plan.slides.length, 1)) * 32), label, {
        phase: "rendering",
        phaseLabel: "逐页生成与动效",
        activity: "waiting",
        completedPages: completedTitles.length,
        pageTitles: completedTitles,
      });
      const reportBatchStream = pageBatchReporter(completedTitles, label, 40, 72);
      let partialPage: CommittedPresentationPage | null = null;
      let partialReceivedChars = 0;
      let streamOverflow = false;
      let previousPageFailure = "";
      const pageResult = await retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: `rendering.page-${from + 1}`,
        signal: cancellationController.signal,
        run: async (attempt) => {
          partialPage = null;
          partialReceivedChars = 0;
          streamOverflow = false;
          pendingStreamDeltas.delete(`rendering:${label}`);
          const expectedPage = from + 1;
          const expectedTitle = plan.slides[from]?.title ?? "";
          const result = await ai.completeStream(
            {
              messages: [
                {
                  role: "system",
                  content: [
                    pageBatchPrompt,
                    `当前只生成第 ${expectedPage} 页，必须只输出一个 section，data-sg-page 和 data-sg-id 都必须为 page-${expectedPage}。`,
                    strictRetryInstruction(attempt, "html", previousPageFailure),
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                },
                {
                  role: "user",
                  content: JSON.stringify({
                    task: "生成当前页面的专业演示页面",
                    title: parsed.title,
                    requirements: parsed.prompt ?? "",
                    designSystem: plan.designSystem,
                    selectedStyle: plan.selectedStyle,
                    density: plan.density,
                    pageBudget: plan.pageBudget,
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
              maxTokens: 32_768,
              temperature: attempt === 1 ? 0.76 : 0.22,
              fallbackToLocal: false,
              taskId: ctx.taskId,
              modelTaskKey: "presentation.page-generation",
              signal: cancellationController.signal,
              agentMode: "direct",
            },
            async (update) => {
              const openCount = update.text.match(/<section\b[^>]*data-sg-page/gi)?.length ?? 0;
              if (openCount > 1) {
                streamOverflow = true;
                partialPage = null;
                previousPageFailure = `第 ${expectedPage} 页流式输出包含多个页面 section，只能输出一个完整 section。`;
                throw generationError(
                  "PRESENTATION_PAGE_OUTPUT_OVERFLOW",
                  "rendering",
                  `第 ${expectedPage} 页流式输出包含多个 section，已提前终止本次模型调用`,
                  { page: expectedPage, sectionOpenCount: openCount },
                );
              }
              const partial = validateGeneratedPresentationPage({
                output: update.text,
                expectedPage,
                expectedTitle,
              });
              if (partial.page) {
                partialPage = partial.page;
                partialReceivedChars = update.receivedChars;
              }
              await reportBatchStream(update);
            },
          );
          await flushStream(
            `rendering:${label}`,
            "rendering",
            "finished",
            result.text.length,
            result.finishReason,
            result.usage,
          );
          let validated = validateGeneratedPresentationPage({
            output: result.text,
            expectedPage,
            expectedTitle,
          });
          if (!validated.page) {
            const contractRepaired = repairGeneratedPresentationPageContract(result.text, expectedPage);
            const contractWithTitle = contractRepaired
              ? (repairGeneratedPresentationPageTitle({
                  output: contractRepaired,
                  expectedPage,
                  expectedTitle,
                }) ?? contractRepaired)
              : null;
            if (contractWithTitle) {
              const contractValidated = validateGeneratedPresentationPage({
                output: contractWithTitle,
                expectedPage,
                expectedTitle,
              });
              if (contractValidated.page) {
                ctx.logger.warn(
                  { taskId: ctx.taskId, page: expectedPage },
                  "page output salvaged by contract repair (stripped scripts/document wrapper)",
                );
                partialPage = contractValidated.page;
                partialReceivedChars = result.text.length;
                return { result, page: contractValidated.page };
              }
            }
          }
          if (!validated.page) {
            const repairedOutput = repairGeneratedPresentationPageTitle({
              output: result.text,
              expectedPage,
              expectedTitle,
            });
            if (repairedOutput) {
              validated = validateGeneratedPresentationPage({
                output: repairedOutput,
                expectedPage,
                expectedTitle,
              });
              if (validated.page) {
                partialPage = validated.page;
                partialReceivedChars = result.text.length;
                return { result, page: validated.page };
              }
            }
          }
          if (!validated.page) {
            previousPageFailure = validated.issues.join("；");
            throw generationError(
              "PRESENTATION_PAGE_BATCH_INVALID",
              "rendering",
              `第 ${expectedPage} 页输出未通过严格校验：${validated.issues.join("；")}`,
              {
                fromPage: expectedPage,
                expectedPageCount: 1,
                actualPageCount: extractSlideBatch(result.text).sections.length,
                provider: result.provider,
                modelOutput: modelOutputDiagnostics(result.text),
              },
            );
          }
          partialPage = validated.page;
          partialReceivedChars = result.text.length;
          return { result, page: validated.page };
        },
      }).catch(async (error) => {
        if (partialPage && !streamOverflow && !cancellationController.signal.aborted) {
          sections.push(partialPage.section);
          pageStyles.push(...partialPage.styles);
          committedPages.push(partialPage);
          completedTitles = committedPages.map((page) => page.title);
          generatedChars += partialReceivedChars;
          await persistRenderingResume({
            plan,
            foundationHtml: rawGeneratedHtml,
            planHash: planHash(plan),
            foundationHash: sha256(rawGeneratedHtml),
            pages: committedPages,
            completedPages: committedPages.length,
            generatedChars,
          });
          await report(
            40 + Math.floor((sections.length / Math.max(plan.slides.length, 1)) * 32),
            `已保存至第 ${committedPages.length} 页，下次将从第 ${committedPages.length + 1} 页继续`,
            {
              phase: "rendering",
              phaseLabel: "逐页生成与动效",
              activity: "done",
              receivedChars: generatedChars,
              completedPages: committedPages.length,
              pageTitles: completedTitles,
            },
          );
        }
        throw error;
      });
      sections.push(pageResult.page.section);
      pageStyles.push(...pageResult.page.styles);
      committedPages.push(pageResult.page);
      completedTitles = committedPages.map((page) => page.title);
      generatedChars += pageResult.result.text.length;
      await persistRenderingResume({
        plan,
        foundationHtml: rawGeneratedHtml,
        planHash: planHash(plan),
        foundationHash: sha256(rawGeneratedHtml),
        pages: committedPages,
        completedPages: committedPages.length,
        generatedChars,
      });
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
    const plannedPageNumbers = plan.slides.map((_slide, index) => index + 1);
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
    if (
      (retryingRepair || retryingCompiling) &&
      repairResume &&
      repairResume.planHash === planHash(plan) &&
      repairResume.htmlHash === sha256(repairResume.html)
    ) {
      html = repairResume.html;
      ctx.logger.info(
        {
          taskId: ctx.taskId,
          completedPages: repairResume.completedPages,
          pendingPages: repairResume.pendingPages,
        },
        "resuming presentation repair from durable repair checkpoint",
      );
    }
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
    const initialIdentityIssues = validateFinalPresentationPageSet(html, plannedTitles);
    if (initialIdentityIssues.length > 0) {
      throw generationError(
        "PRESENTATION_PAGE_IDENTITY_INVALID",
        "rendering",
        `生成结果页面身份校验失败：${initialIdentityIssues.join("；")}`,
        { issues: initialIdentityIssues },
      );
    }
    const matchingRepairResume =
      (retryingRepair || retryingCompiling) &&
      repairResume &&
      repairResume.planHash === planHash(plan) &&
      repairResume.htmlHash === sha256(html)
        ? repairResume
        : null;
    const matchingReviewResume =
      (retryingReview || retryingRepair || retryingCompiling) &&
      reviewResume &&
      reviewResume.planHash === planHash(plan) &&
      reviewResume.htmlHash === sha256(html)
        ? reviewResume
        : null;
    let issues = matchingRepairResume?.deterministicIssues ??
      matchingReviewResume?.deterministicIssues ?? [
        ...deterministicHtmlIssues(html),
        ...plannedSlideCoverageIssues(html, plannedTitles),
      ];
    const generatedTitles = extractCompletedPageTitles(html);
    let renderAudit: PresentationRenderAudit = matchingRepairResume?.renderAudit ??
      matchingReviewResume?.renderAudit ?? {
        available: false,
        pageCount: plannedPageNumbers.length,
        issues: [],
        slides: [],
        consoleErrors: [],
        summary: "已复用编译前页面，无需重新渲染",
      };
    if (retryingCompiling) {
      await report(94, "已恢复编译前页面，跳过渲染与视觉审查", {
        phase: "compiling",
        phaseLabel: "重新编译编辑能力",
        activity: "done",
        receivedChars: generatedChars,
        completedPages: generatedTitles.length,
        pageTitles: generatedTitles,
        renderingPages: [],
        renderedPages: plannedPageNumbers,
        reviewingPages: [],
        reviewedPages: plannedPageNumbers,
      });
    } else if (matchingRepairResume) {
      renderAudit = matchingRepairResume.renderAudit;
      await report(80, "已恢复定向修复检查点，跳过真实渲染", {
        phase: "repairing",
        phaseLabel: "从失败页面继续定向修复",
        activity: "done",
        receivedChars: generatedChars,
        completedPages: generatedTitles.length,
        pageTitles: generatedTitles,
        renderSummary: renderAudit.summary,
        renderIssueCount: renderAudit.issues.length,
        renderingPages: [],
        renderedPages: plannedPageNumbers,
      });
    } else if (matchingReviewResume) {
      renderAudit = matchingReviewResume.renderAudit;
      await report(80, "已恢复视觉审查检查点，跳过真实渲染", {
        phase: "visualizing",
        phaseLabel: "复用真实渲染结果",
        activity: "done",
        receivedChars: generatedChars,
        completedPages: generatedTitles.length,
        pageTitles: generatedTitles,
        renderSummary: renderAudit.summary,
        renderIssueCount: renderAudit.issues.length,
        renderingPages: [],
        renderedPages: plannedPageNumbers,
      });
    } else {
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
        renderingPages:
          plannedPageNumbers.length > 0 && plannedPageNumbers[0] !== undefined
            ? [plannedPageNumbers[0]]
            : [],
        renderedPages: [],
      });
      renderAudit = await retryTaskUnit({
        taskId: ctx.taskId,
        logger: ctx.logger,
        stage: "visualizing.chromium",
        signal: cancellationController.signal,
        run: () =>
          renderPresentationAudit(html, {
            screenshots: true,
            screenshotPages: plannedPageNumbers,
            onPage: async ({ page, pageCount }) => {
              const renderedPages = plannedPageNumbers.slice(0, page);
              const nextPage = page < pageCount ? page + 1 : null;
              await report(
                76 + Math.floor((page / Math.max(pageCount, 1)) * 4),
                `真实渲染第 ${page} 页`,
                {
                  phase: "visualizing",
                  phaseLabel: "真实渲染检查",
                  activity: "processing",
                  renderingPages: nextPage ? [nextPage] : [],
                  renderedPages,
                },
              );
            },
          }),
      });
      await persistReviewResume({ html, plan, deterministicIssues: issues, renderAudit });
    }
    if (!retryingCompiling) {
      checkpoint.renderSummary = renderAudit.summary;
      checkpoint.renderIssueCount = renderAudit.issues.length;
      if (!matchingRepairResume && !matchingReviewResume) {
        await report(80, renderAudit.summary, {
          phase: "visualizing",
          phaseLabel: "真实渲染检查",
          activity: "done",
          renderSummary: renderAudit.summary,
          renderIssueCount: renderAudit.issues.length,
          renderingPages: [],
          renderedPages: plannedPageNumbers,
        });
      }

      const reviewBatches = splitBatches(plannedPageNumbers, REVIEW_BATCH_SIZE);
      await report(81, "AI 正在逐批审查每一页的截图与布局", {
        phase: "reviewing",
        phaseLabel: "深度视觉审查",
        activity: "waiting",
        reviewingPages: reviewBatches[0] ?? [],
        reviewedPages: [],
      });
      let review: VisualReview;
      let reviewResponseText = "";
      let reviewProvider = "";
      const cachedReview =
        matchingRepairResume?.review ?? (retryingRepair ? matchingReviewResume?.review : undefined);
      if (cachedReview) {
        review = cachedReview;
        await report(86, "已恢复视觉审查结果，继续定向修复", {
          phase: "reviewing",
          phaseLabel: "深度视觉审查",
          activity: "done",
          reviewSummary: review.summary,
          reviewingPages: [],
          reviewedPages: plannedPageNumbers,
        });
      } else {
        try {
          const requestReview = async (input: {
            stage: string;
            label: string;
            content: ChatContentPart[];
            baseProgress: number;
            targetProgress: number;
          }): Promise<VisualReview> =>
            retryTaskUnit({
              taskId: ctx.taskId,
              logger: ctx.logger,
              stage: input.stage,
              signal: cancellationController.signal,
              run: async (attempt) => {
                const reviewResult = await ai.completeStream(
                  {
                    messages: [
                      {
                        role: "system",
                        content: [reviewPrompt, strictRetryInstruction(attempt, "json")]
                          .filter(Boolean)
                          .join("\n\n"),
                      },
                      { role: "user", content: input.content },
                    ],
                    responseFormat: "json_object",
                    maxTokens: 32_768,
                    temperature: 0.2,
                    fallbackToLocal: false,
                    taskId: ctx.taskId,
                    modelTaskKey: "presentation.visual-review",
                    signal: cancellationController.signal,
                    agentMode: "direct",
                  },
                  streamReporter(
                    "reviewing",
                    input.label,
                    input.baseProgress,
                    input.targetProgress,
                  ),
                );
                await flushStream(
                  `reviewing:${input.label}`,
                  "reviewing",
                  "finished",
                  reviewResult.text.length,
                  reviewResult.finishReason,
                  reviewResult.usage,
                );
                reviewResponseText = reviewResult.text;
                reviewProvider = reviewResult.provider;
                try {
                  return parseVisualReview(parseJsonText(reviewResult.text));
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

          const completedBatchReviews: Array<{ pages: number[]; review: VisualReview }> = [];
          const reviewedPages: number[] = [];
          for (const [index, pages] of reviewBatches.entries()) {
            const label = `视觉审查第 ${pages.join("、")} 页`;
            const baseProgress = 81 + (index / Math.max(reviewBatches.length, 1)) * 4;
            const targetProgress = 81 + ((index + 1) / Math.max(reviewBatches.length, 1)) * 4;
            await report(Math.floor(baseProgress), label, {
              phase: "reviewing",
              phaseLabel: label,
              activity: "waiting",
              reviewingPages: pages,
              reviewedPages,
            });
            const batchReview = await requestReview({
              stage: `reviewing.pages-${pages.join("-")}`,
              label,
              content: visualReviewContent({
                plan,
                html,
                deterministicIssues: [
                  ...issues,
                  ...validatePresentationHtmlVisualQuality(html)
                    .filter((issue) => issue.severity === "warning")
                    .map(({ code, message }) => ({ code, message })),
                ],
                audit: renderAudit,
                pageNumbers: pages,
              }),
              baseProgress,
              targetProgress,
            });
            completedBatchReviews.push({ pages, review: batchReview });
            reviewedPages.push(...pages);
            await report(Math.floor(targetProgress), `${label}完成`, {
              phase: "reviewing",
              phaseLabel: "深度视觉审查",
              activity: "processing",
              reviewingPages: reviewBatches[index + 1] ?? [],
              reviewedPages: [...reviewedPages],
            });
          }

          await report(85, "汇总跨页叙事与视觉一致性", {
            phase: "reviewing",
            phaseLabel: "全局审查汇总",
            activity: "processing",
            reviewingPages: [],
            reviewedPages: plannedPageNumbers,
          });
          const globalReview = await requestReview({
            stage: "reviewing.global",
            label: "全局审查汇总",
            content: globalVisualReviewContent({ plan, batchReviews: completedBatchReviews }),
            baseProgress: 85,
            targetProgress: 86,
          });
          review = mergeVisualReviews([
            ...completedBatchReviews.map((item) => item.review),
            globalReview,
          ]);
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
      }
      await persistReviewResume({ html, plan, deterministicIssues: issues, renderAudit, review });
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
        reviewingPages: [],
        reviewedPages: plannedPageNumbers,
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
        // A user-triggered retry gets a fresh repair budget. An interrupted in-flight
        // attempt still continues from its persisted pass.
        let repairPass = retryingRepair ? 1 : (matchingRepairResume?.repairPass ?? 1);
        let repairCompleted = false;
        let previousRepairFailures: string[] = matchingRepairResume?.previousRepairFailures ?? [];
        // Repair is a per-page pipeline: fix one page, re-render and re-check it
        // immediately, lock it in on success, and keep fixing the same page while
        // it still fails. A page that burns its attempt cap is parked so the rest
        // of the deck still gets repaired before the run reports failure. The web
        // UI follows each page through 修复中 → 复检中 → 修复完成 individually.
        const repairQueue: number[] = [];
        const pageAttempts = new Map<number, number>();
        const pageBlockingCodes = new Map<number, string[]>();
        const pageLastFailures = new Map<number, string[]>();
        const noEffectAttempts = new Map<number, number>();
        const exhaustedRepairPages: number[] = [];
        const noEffectPages = new Set<number>();
        const stagnantPages = new Set<number>();
        let verifiedRepairPages: number[] = retryingRepair
          ? []
          : (matchingRepairResume?.completedPages ?? []);
        // Blocking-issue fingerprints per page, refreshed after every re-audit.
        // A retry that reproduces the exact same measurements produced no effect,
        // so the next repair request must call that out explicitly.
        const previousIssueSignatures = new Map<number, string>();
        for (const issue of renderAudit.issues) {
          if (issue.severity === "error" && !previousIssueSignatures.has(issue.page)) {
            previousIssueSignatures.set(
              issue.page,
              renderAuditErrorSignature(renderAudit, issue.page),
            );
          }
        }
        // The model review is a snapshot from before repair started; its error
        // pages seed the queue on a fresh run only. Every repair verdict comes
        // from fresh deterministic + rendered checks, never from that snapshot.
        repairQueue.push(
          ...issuePageNumbers({
            deterministicIssues: issues,
            renderAudit,
            review,
            pageCount: expectedPageCount,
            includeReviewIssues: repairPass === 1,
          }).filter((page) => !verifiedRepairPages.includes(page)),
        );
        if (repairQueue.length === 0 && issues.length > 0) {
          throw generationError(
            "PRESENTATION_HTML_VALIDATION_FAILED",
            "repairing",
            `演示 HTML 校验失败：${issues.map((issue) => issue.message).join("；")}`,
            { issues },
          );
        }
        // Per-page attempt cap × page budget: the same worst-case envelope as the
        // previous per-pass budget (5 passes × 12 calls), but every failing page
        // now spends its attempts one after another instead of one per round.
        const maxRepairCalls = MAX_REPAIR_CALLS * MAX_REPAIR_PASSES;
        let repairCalls = 0;
        let lastRepairRequestAt = 0;
        const requestRepair = async (input: {
          pageNumber: number;
          attempt: number;
          currentSection: string;
          pageNoEffect: boolean;
          pageStagnant: boolean;
        }) => {
          const { pageNumber, attempt } = input;
          repairCalls += 1;
          const label = `定向修复第 ${pageNumber} 页`;
          const failureContext =
            previousRepairFailures.length > 0
              ? `【上轮定向修复失败汇总】${previousRepairFailures.join("；")}`
              : "";
          let previousRepairFailure = "";
          const repairResult = await retryTaskUnit({
            taskId: ctx.taskId,
            logger: ctx.logger,
            stage: `repairing.page-${pageNumber}`,
            signal: cancellationController.signal,
            run: async (modelAttempt) => {
              // When a page misses the stage by only a few dozen pixels, a
              // whole-page redesign keeps landing near-but-over. Point the
              // model at surgical cuts instead.
              const overflowIssue = renderAudit.issues.find(
                (issue) => issue.page === pageNumber && issue.code === "RENDER_SLIDE_OVERFLOW",
              );
              const verticalOverflow = overflowIssue
                ? Number(/纵向超出 (\d+)px/.exec(overflowIssue.message)?.[1] ?? 0)
                : 0;
              const nearMissHint =
                overflowIssue && verticalOverflow > 0 && verticalOverflow <= 120
                  ? "本页只超出画布数十像素：不要重排整页。按 renderIssues.geometry 逐项回收空间——压缩最底部区块的高度与上下内边距，把最底部的来源行改为绝对定位贴底或并入上一区块。"
                  : null;
              const repairPayload = {
                repairPass: attempt,
                originalRequirements: parsed.prompt ?? "",
                designSystem: plan.designSystem,
                selectedStyle: plan.selectedStyle,
                retryContext: previousRepairFailures,
                pages: [
                  {
                    page: pageNumber,
                    pagePlan: plan.slides[pageNumber - 1],
                    currentSection: input.currentSection,
                    previousFailureContext: failureContext,
                    deterministicIssues: issues.filter((issue) =>
                      issueMentionsPage(issue.message, pageNumber),
                    ),
                    renderIssues: renderAudit.issues.filter(
                      (issue) => issue.page === pageNumber && issue.severity === "error",
                    ),
                    reviewIssues: review.issues.filter(
                      (issue) => issue.page === pageNumber && issue.severity === "error",
                    ),
                    ...(input.pageNoEffect ? { repairHadNoEffect: REPAIR_NO_EFFECT_HINT } : {}),
                    ...(nearMissHint ? { nearMissHint } : {}),
                  },
                ],
              };
              const repairContent: ChatContentPart[] = [
                { type: "text", text: JSON.stringify(repairPayload) },
              ];
              const slide = renderAudit.slides.find((item) => item.page === pageNumber);
              if (slide?.screenshotDataUrl) {
                repairContent.push({
                  type: "text",
                  text: `第 ${pageNumber} 页复检截图：${slide.title}`,
                });
                repairContent.push({
                  type: "image_url",
                  image_url: { url: slide.screenshotDataUrl, detail: "high" },
                });
              }
              const sinceLastRepair = Date.now() - lastRepairRequestAt;
              const pacingDelay = lastRepairRequestAt
                ? Math.max(0, REPAIR_REQUEST_MIN_INTERVAL_MS - sinceLastRepair)
                : 0;
              if (pacingDelay > 0) {
                await new Promise((resolve) => setTimeout(resolve, pacingDelay));
              }
              lastRepairRequestAt = Date.now();
              const result = await ai.completeStream(
                {
                  messages: [
                    {
                      role: "system",
                      content: [
                        repairPrompt,
                        "当前修复页数：1",
                        `第 ${pageNumber} 页必须使用 data-sg-page="page-${pageNumber}" 和 data-sg-id="page-${pageNumber}"。不得输出未请求的页。`,
                        "一次完成当前批次，不要分批回答。",
                        repairEscalationInstruction(
                          attempt,
                          previousRepairFailures,
                          input.pageStagnant,
                        ),
                        strictRetryInstruction(modelAttempt, "html", previousRepairFailure),
                        failureContext || "",
                      ].join("\n\n"),
                    },
                    {
                      role: "user",
                      content: repairContent,
                    },
                  ],
                  maxTokens: REPAIR_MAX_OUTPUT_TOKENS,
                  temperature: modelAttempt === 1 ? 0.28 : 0.16,
                  fallbackToLocal: false,
                  taskId: ctx.taskId,
                  modelTaskKey: "presentation.visual-review",
                  signal: cancellationController.signal,
                  agentMode: "direct",
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
              const identityValidation = validateGeneratedPresentationPage({
                output: result.text,
                expectedPage: pageNumber,
                expectedTitle: plan.slides[pageNumber - 1]?.title ?? "",
              });
              if (extracted.sections.length !== 1 || !identityValidation.page) {
                previousRepairFailure = [
                  `期望 1 页，实际 ${extracted.sections.length} 页`,
                  ...identityValidation.issues,
                ]
                  .filter(Boolean)
                  .join("；");
                throw generationError(
                  "PRESENTATION_REPAIR_OUTPUT_INVALID",
                  "repairing",
                  `定向修复输出未通过严格校验：期望 1 页，实际 ${extracted.sections.length} 页${identityValidation.issues.length > 0 ? `；${identityValidation.issues.join("；")}` : ""}`,
                  {
                    repairPass: attempt,
                    requestedPages: [pageNumber],
                    expectedPageCount: 1,
                    actualPageCount: extracted.sections.length,
                    provider: result.provider,
                    modelOutput: modelOutputDiagnostics(result.text),
                  },
                );
              }
              return {
                section: identityValidation.page.section,
                styles: identityValidation.page.styles,
                chars: result.text.length,
              };
            },
          });
          return repairResult;
        };

        while (!repairCompleted) {
          if (repairQueue.length === 0) {
            repairCompleted = true;
            break;
          }
          const pageNumber: number | undefined = repairQueue[0];
          if (pageNumber === undefined) {
            repairQueue.shift();
            continue;
          }
          const attempts = pageAttempts.get(pageNumber) ?? 0;
          if (attempts >= MAX_REPAIR_PASSES) {
            // This page could not be fixed within its attempt budget; park it
            // so the remaining pages still get repaired before the run fails.
            repairQueue.shift();
            exhaustedRepairPages.push(pageNumber);
            await report(
              91,
              `第 ${pageNumber} 页连续 ${MAX_REPAIR_PASSES} 轮复检未通过，先修复其他页面`,
              {
                phase: "repairing",
                phaseLabel: "定向修复",
                activity: "processing",
                renderSummary: renderAudit.summary,
                renderIssueCount: renderAudit.issues.length,
                repairPages: [...repairQueue],
                repairingPages: [],
                verifyingPages: [],
                repairFailedPages: [...exhaustedRepairPages],
                repairedPages: verifiedRepairPages,
                repairPass,
              },
            );
            continue;
          }
          if (repairCalls >= maxRepairCalls) {
            throw generationError(
              "PRESENTATION_REPAIR_BUDGET_EXHAUSTED",
              "repairing",
              `定向修复调用次数超过上限：${maxRepairCalls}`,
              { repairQueue: [...repairQueue], repairPass, repairCalls, maxRepairCalls },
            );
          }
          const currentPages = extractSlideBatch(html).sections;
          if (currentPages.length !== expectedPageCount) {
            throw generationError(
              "PRESENTATION_REPAIR_PAGE_COUNT_MISMATCH",
              "repairing",
              `定向修复页数异常：期望 ${expectedPageCount} 页，实际 ${currentPages.length} 页`,
              { repairPass, expectedPageCount, actualPageCount: currentPages.length },
            );
          }
          const attemptProgress = attempts === 0 ? 88 : 91;
          const verifyProgress = attempts === 0 ? 89 : 92;
          await report(attemptProgress, `定向修复第 ${pageNumber} 页`, {
            phase: "repairing",
            phaseLabel: `定向修复第 ${pageNumber} 页`,
            activity: "processing",
            repairApplied: true,
            repairPages: [...repairQueue],
            repairingPages: [pageNumber],
            verifyingPages: [],
            repairFailedPages: [...exhaustedRepairPages],
            repairedPages: verifiedRepairPages,
            repairPass,
          });
          let extractedRepair: Awaited<ReturnType<typeof requestRepair>>;
          try {
            extractedRepair = await requestRepair({
              pageNumber,
              attempt: attempts + 1,
              currentSection: currentPages[pageNumber - 1] ?? "",
              pageNoEffect: noEffectPages.has(pageNumber),
              pageStagnant: stagnantPages.has(pageNumber),
            });
          } catch (error) {
            const failure = error instanceof Error ? error.message : String(error);
            previousRepairFailures = [...previousRepairFailures, failure].slice(-8);
            try {
              await persistRepairResume({
                html,
                plan,
                repairPass,
                completedPages: verifiedRepairPages,
                pendingPages: [...repairQueue],
                previousRepairFailures,
                deterministicIssues: issues,
                renderAudit,
                review,
              });
            } catch (checkpointError) {
              ctx.logger.warn(
                { taskId: ctx.taskId, err: String(checkpointError) },
                "failed to persist repair failure checkpoint",
              );
            }
            throw error;
          }
          const originalSection = currentPages[pageNumber - 1] ?? "";
          if (!originalSection) {
            throw generationError(
              "PRESENTATION_REPAIR_OUTPUT_INVALID",
              "repairing",
              `定向修复未返回第 ${pageNumber} 页的可匹配页面`,
              {
                repairPass,
                page: pageNumber,
                requestedPages: [pageNumber],
                provider: undefined,
                modelOutput: undefined,
              },
            );
          }
          const safeRepair = applyPresentationRepairsPreservingPageCount(
            html,
            new Map([[pageNumber, preservePageIdentity(originalSection, extractedRepair.section)]]),
            extractedRepair.styles,
            expectedPageCount,
            parsed.title,
            plannedTitles,
          );
          html = safeRepair.html;
          if (safeRepair.skippedPages.length > 0) {
            throw generationError(
              "PRESENTATION_REPAIR_PAGE_COUNT_VIOLATION",
              "repairing",
              `定向修复违反页数守恒，已拒绝替换第 ${safeRepair.skippedPages.join("、")} 页`,
              { repairPass, pages: safeRepair.skippedPages },
            );
          }
          repairPass += 1;
          pageAttempts.set(pageNumber, attempts + 1);
          checkpoint.receivedChars = (checkpoint.receivedChars ?? 0) + extractedRepair.chars;
          await persistRepairResume({
            html,
            plan,
            repairPass,
            completedPages: verifiedRepairPages,
            pendingPages: [...repairQueue],
            previousRepairFailures,
            deterministicIssues: issues,
            renderAudit,
            review,
          });
          await report(attemptProgress, `第 ${pageNumber} 页修复稿已生成`, {
            phase: "repairing",
            phaseLabel: "定向修复",
            activity: "processing",
            repairApplied: true,
            repairPages: [...repairQueue],
            repairingPages: [],
            verifyingPages: [],
            repairFailedPages: [...exhaustedRepairPages],
            repairedPages: verifiedRepairPages,
            repairPass,
          });
          await report(verifyProgress, `第 ${pageNumber} 页复检中`, {
            phase: "repairing",
            phaseLabel: "修复后复检",
            activity: "processing",
            repairApplied: true,
            repairPages: [...repairQueue],
            repairingPages: [],
            verifyingPages: [pageNumber],
            repairFailedPages: [...exhaustedRepairPages],
            repairedPages: verifiedRepairPages,
            repairPass,
          });
          // One Chromium session for both phases: the audit then measures the
          // exact deck the fit produced instead of a second cold launch.
          const stageRun = await retryTaskUnit({
            taskId: ctx.taskId,
            logger: ctx.logger,
            stage: `repairing.chromium-fit-audit-page-${pageNumber}-attempt-${attempts + 1}`,
            signal: cancellationController.signal,
            run: () =>
              fitAndAuditPresentationHtml(html, {
                screenshots: true,
                screenshotPages: [pageNumber],
              }),
          });
          html = stageRun.html;
          renderAudit = stageRun.audit;
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
          checkpoint.renderSummary = renderAudit.summary;
          checkpoint.renderIssueCount = renderAudit.issues.length;
          const repairedTitles = extractCompletedPageTitles(html);
          checkpoint.pageTitles = repairedTitles;
          checkpoint.completedPages = repairedTitles.length;
          // A repaired page that reports byte-identical measurements did not
          // change in the rendered output — usually author CSS that never
          // matched. Flag it so the next attempt fixes selectors, not layout.
          const signature = renderAuditErrorSignature(renderAudit, pageNumber);
          const previousSignature = previousIssueSignatures.get(pageNumber);
          previousIssueSignatures.set(pageNumber, signature);
          const pageNoEffect = previousSignature !== undefined && previousSignature === signature;
          if (pageNoEffect) {
            noEffectPages.add(pageNumber);
            noEffectAttempts.set(pageNumber, (noEffectAttempts.get(pageNumber) ?? 0) + 1);
          } else {
            noEffectPages.delete(pageNumber);
            noEffectAttempts.delete(pageNumber);
          }
          if (pageNoEffect) {
            ctx.logger.warn(
              { taskId: ctx.taskId, repairPass, page: pageNumber },
              "repair attempt produced no measured change; injecting selector hint",
            );
          }
          const pageCodes = [
            ...issues
              .filter((issue) => issueMentionsPage(issue.message, pageNumber))
              .map((issue) => issue.code),
            ...renderAudit.issues
              .filter((issue) => issue.page === pageNumber && issue.severity === "error")
              .map((issue) => issue.code),
          ].sort();
          const previousCodes = pageBlockingCodes.get(pageNumber);
          const pageStagnant =
            previousCodes !== undefined &&
            previousCodes.length === pageCodes.length &&
            previousCodes.every((code, position) => code === previousCodes[position]);
          pageBlockingCodes.set(pageNumber, pageCodes);
          if (pageStagnant) stagnantPages.add(pageNumber);
          else stagnantPages.delete(pageNumber);
          // Fresh checks only: the review snapshot predates every repair.
          const postRepairPages = issuePageNumbers({
            deterministicIssues: issues,
            renderAudit,
            review,
            pageCount: expectedPageCount,
            includeReviewIssues: false,
          });
          if (!postRepairPages.includes(pageNumber)) {
            repairQueue.shift();
            verifiedRepairPages = [...new Set([...verifiedRepairPages, pageNumber])].sort(
              (a, b) => a - b,
            );
            pageLastFailures.delete(pageNumber);
            await persistRepairResume({
              html,
              plan,
              repairPass,
              completedPages: verifiedRepairPages,
              pendingPages: [...repairQueue],
              previousRepairFailures,
              deterministicIssues: issues,
              renderAudit,
              review,
            });
            await report(verifyProgress, `第 ${pageNumber} 页复检通过`, {
              phase: "repairing",
              phaseLabel: "定向修复",
              activity: "processing",
              renderSummary: renderAudit.summary,
              renderIssueCount: renderAudit.issues.length,
              repairPages: [...repairQueue],
              repairingPages: [],
              verifyingPages: [],
              repairFailedPages: [...exhaustedRepairPages],
              repairedPages: verifiedRepairPages,
              repairPass,
            });
          } else if (shouldParkNoEffectRepair({ noEffectAttempts: noEffectAttempts.get(pageNumber) ?? 0 })) {
            repairQueue.shift();
            exhaustedRepairPages.push(pageNumber);
            await persistRepairResume({
              html,
              plan,
              repairPass,
              completedPages: verifiedRepairPages,
              pendingPages: [...repairQueue],
              previousRepairFailures,
              deterministicIssues: issues,
              renderAudit,
              review,
            });
            await report(verifyProgress, `第 ${pageNumber} 页连续两次复检无变化，转入确定性压缩`, {
              phase: "repairing",
              phaseLabel: "跳过无效重复修复",
              activity: "processing",
              renderSummary: renderAudit.summary,
              renderIssueCount: renderAudit.issues.length,
              repairPages: [...repairQueue],
              repairingPages: [],
              verifyingPages: [],
              repairFailedPages: [...exhaustedRepairPages],
              repairedPages: verifiedRepairPages,
              repairPass,
            });
          } else {
            const pageFailures = [
              ...issues
                .filter((issue) => issueMentionsPage(issue.message, pageNumber))
                .map((issue) => issue.message),
              ...renderAudit.issues
                .filter((issue) => issue.page === pageNumber && issue.severity === "error")
                .map((issue) => issue.message),
            ];
            if (pageFailures.length > 0) {
              // previousRepairFailures carries page attribution for the repair
              // context; pageLastFailures stays raw so the final failure message
              // can add exactly one "第 N 页" prefix.
              previousRepairFailures = [
                ...previousRepairFailures,
                ...pageFailures.map((message) => `第 ${pageNumber} 页：${message}`),
              ].slice(-8);
              pageLastFailures.set(pageNumber, pageFailures);
            }
            // Repairs can regress other pages; they join the queue behind the
            // page being retried so nothing silently drifts out of spec.
            for (const page of postRepairPages) {
              if (page === pageNumber || exhaustedRepairPages.includes(page)) continue;
              // A later replacement can regress a page that had already passed
              // its own re-audit. Remove that page from the verified set and
              // put it back in the queue; otherwise the run could ship a deck
              // with fresh blocking errors while reporting every page done.
              if (verifiedRepairPages.includes(page)) {
                verifiedRepairPages = verifiedRepairPages.filter((item) => item !== page);
              }
              if (!repairQueue.includes(page)) repairQueue.push(page);
            }
            await persistRepairResume({
              html,
              plan,
              repairPass,
              completedPages: verifiedRepairPages,
              pendingPages: [...repairQueue],
              previousRepairFailures,
              deterministicIssues: issues,
              renderAudit,
              review,
            });
            await report(92, `第 ${pageNumber} 页复检未通过，继续修复该页`, {
              phase: "repairing",
              phaseLabel: "复检未通过",
              activity: "processing",
              renderSummary: renderAudit.summary,
              renderIssueCount: renderAudit.issues.length,
              repairPages: [...repairQueue],
              repairingPages: [],
              verifyingPages: [],
              repairFailedPages: [...new Set([...exhaustedRepairPages, pageNumber])],
              repairedPages: verifiedRepairPages,
              repairPass,
            });
          }
        }
        if (exhaustedRepairPages.length > 0) {
          // The parked pages burned their attempt budget. Ship the deck by
          // force-fitting them (slightly denser, issues downgraded to warnings)
          // instead of throwing away every page that was repaired successfully.
          const degradeRun = await retryTaskUnit({
            taskId: ctx.taskId,
            logger: ctx.logger,
            stage: `repairing.degrade-fit-${exhaustedRepairPages.join("-")}`,
            signal: cancellationController.signal,
            run: () =>
              fitAndAuditPresentationHtml(html, {
                screenshots: true,
                screenshotPages: [...exhaustedRepairPages],
                degradePages: [...exhaustedRepairPages],
              }),
          });
          html = degradeRun.html;
          renderAudit = degradeRun.audit;
          issues = [
            ...deterministicHtmlIssues(html),
            ...plannedSlideCoverageIssues(html, plannedTitles),
          ];
          checkpoint.renderSummary = renderAudit.summary;
          checkpoint.renderIssueCount = renderAudit.issues.length;
          const degradedPageSet = new Set(exhaustedRepairPages);
          const blockingOutsideDegraded = [
            ...renderAudit.issues.filter(
              (issue) =>
                issue.severity === "error" &&
                !degradedPageSet.has(issue.page) &&
                issue.code !== "RENDER_CONTENT_UNDERFILL",
            ),
            ...issues.filter(
              (issue) =>
                !exhaustedRepairPages.some((page) => issueMentionsPage(issue.message, page)),
            ),
          ];
          if (blockingOutsideDegraded.length > 0) {
            const messages = exhaustedRepairPages.map(
              (page) =>
                `第 ${page} 页：${(pageLastFailures.get(page) ?? []).join("；") || "复检未通过"}`,
            );
            throw generationError(
              "PRESENTATION_REPAIR_FAILED",
              "repairing",
              `演示渲染校验失败：${messages.join("；")}`,
              { repairPass, issues: messages },
            );
          }
          const degradeSummary = exhaustedRepairPages.map((page) => {
            const applied = degradeRun.applied.find((item) => item.page === page);
            return `第 ${page} 页×${applied?.scale ? applied.scale.toFixed(2) : "1.00"}`;
          });
          await report(
            93,
            `第 ${exhaustedRepairPages.join("、")} 页修复未收敛，已降级缩放通过复检（${degradeSummary.join("、")}，该页字号问题降为警告）`,
            {
              phase: "repairing",
              phaseLabel: "定向修复",
              activity: "processing",
              renderSummary: renderAudit.summary,
              renderIssueCount: renderAudit.issues.length,
              repairPages: [],
              repairingPages: [],
              verifyingPages: [],
              repairFailedPages: [...exhaustedRepairPages],
              repairedPages: verifiedRepairPages,
              repairPass,
            },
          );
        }
        if (issues.length > 0) {
          throw generationError(
            "PRESENTATION_HTML_VALIDATION_FAILED",
            "repairing",
            `演示 HTML 校验失败：${issues.map((issue) => issue.message).join("；")}`,
            { issues },
          );
        }
        const finalBlockingRenderIssues = renderAudit.issues.filter(
          (issue) => issue.severity === "error" && issue.code !== "RENDER_CONTENT_UNDERFILL",
        );
        if (finalBlockingRenderIssues.length > 0) {
          throw generationError(
            "PRESENTATION_REPAIR_FAILED",
            "repairing",
            `演示渲染校验失败：${finalBlockingRenderIssues.map((issue) => issue.message).join("；")}`,
            { repairPass, issues: finalBlockingRenderIssues },
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
          repairPages: verifiedRepairPages,
          repairingPages: [],
          verifyingPages: [],
          repairFailedPages: [],
          repairedPages: verifiedRepairPages,
        });
      } else if (issues.length > 0) {
        throw generationError(
          "PRESENTATION_HTML_VALIDATION_FAILED",
          "rendering",
          `演示 HTML 校验失败：${issues.map((issue) => issue.message).join("；")}`,
          { issues },
        );
      }
    }

    await report(95, "编译可编辑元素标签", {
      phase: "compiling",
      phaseLabel: "编译编辑能力",
      activity: "processing",
      compilingPages: plannedPageNumbers,
      compiledPages: [],
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
      compilingPages: [],
      compiledPages: plannedPageNumbers,
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
        "failed to dispose Mastra skill context",
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
