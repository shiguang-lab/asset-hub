import { loadWorkerConfig } from "@shiguang/config";

export type RenderIssueSeverity = "error" | "warning";

export interface PresentationElementGeometry {
  element: {
    id?: string;
    kind: string;
    tagName: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  stage: { width: number; height: number };
  overflow: { left: number; top: number; right: number; bottom: number };
  parent?: {
    id?: string;
    tagName: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style: {
    display: string;
    position: string;
    overflowX: string;
    overflowY: string;
    fontSize: string;
  };
}

export interface PresentationRenderIssue {
  code: string;
  severity: RenderIssueSeverity;
  page: number;
  pageId: string;
  elementId?: string;
  message: string;
  geometry?: PresentationElementGeometry;
}

export interface PresentationSlideAudit {
  page: number;
  pageId: string;
  title: string;
  screenshotDataUrl?: string;
  issueCount: number;
}

export interface PresentationRenderAudit {
  available: boolean;
  pageCount: number;
  issues: PresentationRenderIssue[];
  slides: PresentationSlideAudit[];
  consoleErrors: string[];
  summary: string;
}

export interface PresentationStageFit {
  html: string;
  applied: Array<{
    page: number;
    pageId: string;
    scale: number;
    repairedTextIds: string[];
    /** Page is genuinely over-composed; no zoom was applied on purpose. */
    overfilled?: boolean;
    /** Repair budget exhausted; force-fit zoomed this page as a last resort. */
    degraded?: boolean;
  }>;
}

export type PresentationAuditOptions = {
  screenshots?: boolean;
  maxScreenshots?: number;
  screenshotPages?: number[];
  onPage?: (input: { page: number; pageCount: number }) => Promise<void> | void;
  degradePages?: number[];
};

export interface PresentationStageRun {
  html: string;
  applied: PresentationStageFit["applied"];
  audit: PresentationRenderAudit;
}

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const MIN_AUTO_FIT_SCALE = 0.89;
const FIT_SAFETY_MARGIN = 0.985;
const TEXT_FONT_FLOOR = 22;
const DENSE_TEXT_FONT_FLOOR = 16;
const EXEMPT_FONT_ROLES = /^(source|footer|caption|decoration)$/;
const DENSE_FONT_TARGETS = /^(table|chart|metric)$/;
const EXEMPT_FONT_TAGS = ["FIGCAPTION", "SMALL"];
const FONT_CLASS_TOKEN_SPLIT = /[^a-z0-9]+/;
const UNDERFILL_ERROR_RATIO = 0.62;

export function resolveStageFitScale(input: {
  requiredWidth: number;
  requiredHeight: number;
  force?: boolean;
  minimumScale?: number;
}): { scale: number; overfilled: boolean } {
  const minimumScale = input.minimumScale ?? MIN_AUTO_FIT_SCALE;
  const overflowRatio = Math.min(
    STAGE_WIDTH / Math.max(STAGE_WIDTH, input.requiredWidth),
    STAGE_HEIGHT / Math.max(STAGE_HEIGHT, input.requiredHeight),
  );
  if (overflowRatio >= 0.998) return { scale: 1, overfilled: false };
  if (!input.force && overflowRatio < minimumScale) return { scale: 1, overfilled: true };
  return { scale: Math.max(minimumScale, overflowRatio * FIT_SAFETY_MARGIN), overfilled: false };
}

export function resolveFontFloor(input: {
  kind: string;
  role: string;
  tagName: string;
  className?: string;
}): number | null {
  if (EXEMPT_FONT_TAGS.includes(input.tagName.toUpperCase())) return null;
  const role = input.role.toLowerCase();
  if (EXEMPT_FONT_ROLES.test(role)) return null;
  const tokens = (input.className ?? "")
    .toLowerCase()
    .split(FONT_CLASS_TOKEN_SPLIT)
    .filter(Boolean);
  if (tokens.some((token) => EXEMPT_FONT_ROLES.test(token))) return null;
  if (
    DENSE_FONT_TARGETS.test(input.kind.toLowerCase()) ||
    input.tagName.toUpperCase() === "TABLE" ||
    tokens.some((token) => DENSE_FONT_TARGETS.test(token))
  ) {
    return DENSE_TEXT_FONT_FLOOR;
  }
  return TEXT_FONT_FLOOR;
}

export function resolveUnderfillSeverity(contentBottomRatio: number): "error" | "warning" | null {
  if (contentBottomRatio < UNDERFILL_ERROR_RATIO) return "error";
  if (contentBottomRatio < 0.72) return "warning";
  return null;
}

export function formatFontTooSmallIssue(input: {
  elementId?: string;
  designFontSize: number;
  pageFitScale: number;
  floor: number;
  overflowed?: boolean;
}): string {
  const effective = Math.round(input.designFontSize * input.pageFitScale * 100) / 100;
  const design = Math.round(input.designFontSize * 100) / 100;
  const zoom = input.pageFitScale < 0.999 ? ` × 自动缩放 ${input.pageFitScale.toFixed(2)}` : "";
  const minimum = Math.ceil(input.floor / input.pageFitScale);
  const advice =
    input.overflowed === false
      ? `本页内容并未超出演示画布，无需删减或分栏；先确认字号规则真正命中了元素（页面样式选择器用 #page-N 前缀或内联 style），再把正文显式提升到 ≥${minimum}px`
      : `先删减本页内容或改为两栏，再把正文提升到 ≥${minimum}px；只放大字号会加剧越界`;
  return `${input.elementId ?? "元素"} 舞台有效字号 ${effective}px（设计 ${design}px${zoom}），低于 ${input.floor}px 下限：${advice}`;
}

function stripStageFit(html: string): string {
  return html
    .replace(/<style\b[^>]*data-sg-stage-fit[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\sdata-sg-auto-fit=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\sdata-sg-degrade-fit=(?:"[^"]*"|'[^']*')/gi, "");
}

function unavailableAudit(summary: string, consoleErrors: string[] = []): PresentationRenderAudit {
  return { available: false, pageCount: 0, issues: [], slides: [], consoleErrors, summary };
}

async function callRenderWorker(payload: {
  html: string;
  fit: boolean;
  audit: boolean;
  screenshots?: boolean;
  maxScreenshots?: number;
  screenshotPages?: number[];
  degradePages?: number[];
}): Promise<PresentationStageRun> {
  const { renderUrl, renderToken } = loadWorkerConfig();
  const res = await fetch(`${renderUrl}/internal/render/presentation`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": renderToken,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`render-worker ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as PresentationStageRun;
}

export async function fitPresentationHtmlToStage(html: string): Promise<PresentationStageFit> {
  const cleanHtml = stripStageFit(html);
  try {
    const res = await callRenderWorker({ html: cleanHtml, fit: true, audit: false });
    return { html: res.html, applied: res.applied };
  } catch (error) {
    console.warn("[presentation] stage fit failed; pages keep their authored size", error);
    return { html: cleanHtml, applied: [] };
  }
}

export async function renderPresentationAudit(
  html: string,
  options: PresentationAuditOptions = {},
): Promise<PresentationRenderAudit> {
  try {
    const res = await callRenderWorker({
      html,
      fit: false,
      audit: true,
      screenshots: options.screenshots !== false,
      maxScreenshots: options.maxScreenshots,
      screenshotPages: options.screenshotPages,
    });
    const audit = res.audit ?? unavailableAudit("render-worker 未返回审计结果");
    if (options.onPage && audit.available) {
      for (const slide of audit.slides) {
        await options.onPage({ page: slide.page, pageCount: audit.pageCount });
      }
    }
    return audit;
  } catch (error) {
    return unavailableAudit("render-worker 渲染失败，已回退到 HTML 质量检查", [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

export async function fitAndAuditPresentationHtml(
  html: string,
  options: PresentationAuditOptions = {},
): Promise<PresentationStageRun> {
  const cleanHtml = stripStageFit(html);
  try {
    const res = await callRenderWorker({
      html: cleanHtml,
      fit: true,
      audit: true,
      screenshots: options.screenshots !== false,
      maxScreenshots: options.maxScreenshots,
      screenshotPages: options.screenshotPages,
      degradePages: options.degradePages,
    });
    const audit = res.audit ?? unavailableAudit("render-worker 未返回审计结果");
    if (options.onPage && audit.available) {
      for (const slide of audit.slides) {
        await options.onPage({ page: slide.page, pageCount: audit.pageCount });
      }
    }
    return { html: res.html, applied: res.applied, audit };
  } catch (error) {
    console.warn("[presentation] stage fit and audit failed", error);
    return {
      html: cleanHtml,
      applied: [],
      audit: unavailableAudit("render-worker 渲染失败，已回退到 HTML 质量检查", [
        error instanceof Error ? error.message : String(error),
      ]),
    };
  }
}
