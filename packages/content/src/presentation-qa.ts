/**
 * H5 演示的渲染后质量预检。
 *
 * 这不是浏览器截图替代品，而是截图前的 deterministic gate：在进入真实浏览器
 * 或发布流程前，先检查页面数量、视觉覆盖率、内容密度、图表数据、图片来源和
 * 连续布局重复，避免明显退化的 HTML 继续流转。
 */

export type PresentationHtmlQualitySeverity = "error" | "warning";

export interface PresentationHtmlQualityIssue {
  code: string;
  message: string;
  severity: PresentationHtmlQualitySeverity;
  pageId?: string;
  pageIndex?: number;
}

export interface PresentationHtmlQualityReport {
  pageCount: number;
  contentPageCount: number;
  visualPageCount: number;
  visualCoverage: number;
  issues: PresentationHtmlQualityIssue[];
}

interface HtmlPage {
  attrs: string;
  body: string;
  id: string;
  index: number;
  layout: string;
}

const PAGE_PATTERN = /<section\b([^>]*data-sg-page[^>]*)>([\s\S]*?)<\/section>/gi;
const VISUAL_KIND_PATTERN =
  /data-sg-kind=["'](?:image|chart|metric|card|timeline|quote|table|code|code-island|counter)["']/i;
const SOURCE_KIND_PATTERN = /data-sg-kind=["'](?:image|chart|metric|quote)["']/gi;

function attr(attrs: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attrs.match(new RegExp(`${escaped}=["']([^"']*)["']`, "i"));
  return match?.[1] ?? "";
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function visibleText(value: string): string {
  return decodeHtml(value.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractPages(html: string): HtmlPage[] {
  const pages: HtmlPage[] = [];
  for (const match of html.matchAll(PAGE_PATTERN)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    pages.push({
      attrs,
      body,
      id: attr(attrs, "data-sg-id") || `page-${pages.length + 1}`,
      index: pages.length,
      layout: attr(attrs, "data-sg-page") || "content",
    });
  }
  return pages;
}

function issue(
  page: HtmlPage,
  code: string,
  message: string,
  severity: PresentationHtmlQualitySeverity,
): PresentationHtmlQualityIssue {
  return { code, message, severity, pageId: page.id, pageIndex: page.index };
}

function checkPage(page: HtmlPage, previousContentLayout: string): PresentationHtmlQualityIssue[] {
  const issues: PresentationHtmlQualityIssue[] = [];
  const text = visibleText(page.body);
  const title = visibleText(page.body.match(/<h[12]\b[^>]*>[\s\S]*?<\/h[12]>/i)?.[0] ?? "");
  const isContent = !["title", "section", "closing"].includes(page.layout);
  const visual = VISUAL_KIND_PATTERN.test(page.body);

  if (!title) {
    issues.push(issue(page, "HTML_TITLE_MISSING", `页面 ${page.id} 缺少可见标题`, "error"));
  } else if (title.length > 80) {
    issues.push(
      issue(
        page,
        "HTML_TITLE_TOO_LONG",
        `页面 ${page.id} 标题过长（${title.length} 字），可能发生换行挤压`,
        "warning",
      ),
    );
  }

  if (isContent && !visual) {
    issues.push(issue(page, "HTML_TEXT_ONLY", `页面 ${page.id} 渲染后仍只有文本`, "warning"));
  }

  const bulletCount = (page.body.match(/<li\b/gi) ?? []).length;
  if (bulletCount > 4) {
    issues.push(
      issue(
        page,
        "HTML_BULLET_DENSITY_HIGH",
        `页面 ${page.id} 有 ${bulletCount} 条列表项`,
        "warning",
      ),
    );
  }
  if (text.length > 700) {
    issues.push(
      issue(
        page,
        "HTML_TEXT_DENSITY_HIGH",
        `页面 ${page.id} 可见文本约 ${text.length} 字，建议拆页或转为图解`,
        "warning",
      ),
    );
  }

  if (isContent && previousContentLayout && previousContentLayout === page.layout) {
    issues.push(
      issue(
        page,
        "HTML_REPEATED_LAYOUT",
        `页面 ${page.id} 与上一内容页连续使用 ${page.layout}`,
        "warning",
      ),
    );
  }

  for (const chartMatch of page.body.matchAll(/data-sg-chart=["']([^"']*)["']/gi)) {
    const config = decodeHtml(chartMatch[1] ?? "");
    const elementStart = page.body.lastIndexOf("<", chartMatch.index ?? 0);
    const elementEnd = page.body.indexOf(">", chartMatch.index ?? 0);
    const element = page.body.slice(elementStart, elementEnd >= 0 ? elementEnd + 1 : undefined);
    const source = decodeHtml(element.match(/data-sg-source=["']([^"']+)["']/i)?.[1] ?? "");
    const hasStructuredData = /["']?data["']?\s*:\s*\[[^\]]+\]/i.test(config);
    const hasReferencedData = source.length > 0 && /\d/.test(source);
    if (!hasStructuredData && !hasReferencedData) {
      issues.push(
        issue(page, "HTML_CHART_DATA_MISSING", `页面 ${page.id} 图表没有真实数据`, "error"),
      );
    }
  }

  for (const kindMatch of page.body.matchAll(SOURCE_KIND_PATTERN)) {
    const start = Math.max(0, (kindMatch.index ?? 0) - 160);
    const snippet = page.body.slice(start, (kindMatch.index ?? 0) + 320);
    if (!/data-sg-source=["'][^"']+["']/i.test(snippet)) {
      issues.push(
        issue(page, "HTML_SOURCE_REF_MISSING", `页面 ${page.id} 的视觉证据缺少来源定位`, "warning"),
      );
    }
  }

  if (/<img\b[^>]*\bsrc=["']\s*["']/i.test(page.body)) {
    issues.push(issue(page, "HTML_IMAGE_SOURCE_MISSING", `页面 ${page.id} 图片缺少 src`, "error"));
  }
  return issues;
}

export function inspectPresentationHtmlQuality(html: string): PresentationHtmlQualityReport {
  const pages = extractPages(html);
  if (pages.length === 0) {
    return {
      pageCount: 0,
      contentPageCount: 0,
      visualPageCount: 0,
      visualCoverage: 0,
      issues: [
        { code: "HTML_NO_PAGES", message: "HTML 缺少 data-sg-page 页面", severity: "error" },
      ],
    };
  }

  const issues: PresentationHtmlQualityIssue[] = [];
  let contentPageCount = 0;
  let visualPageCount = 0;
  let previousContentLayout = "";
  for (const page of pages) {
    const isContent = !["title", "section", "closing"].includes(page.layout);
    if (isContent) contentPageCount += 1;
    if (VISUAL_KIND_PATTERN.test(page.body)) visualPageCount += 1;
    issues.push(...checkPage(page, isContent ? previousContentLayout : ""));
    if (isContent) previousContentLayout = page.layout;
  }
  const visualCoverage = contentPageCount > 0 ? visualPageCount / contentPageCount : 1;
  if (contentPageCount >= 5 && visualCoverage < 0.7) {
    issues.push({
      code: "HTML_VISUAL_COVERAGE_LOW",
      message: `视觉页面占比仅 ${Math.round(visualCoverage * 100)}%，专业演示应至少达到 70%`,
      severity: "warning",
    });
  }
  return { pageCount: pages.length, contentPageCount, visualPageCount, visualCoverage, issues };
}

export function validatePresentationHtmlVisualQuality(
  html: string,
): PresentationHtmlQualityIssue[] {
  return inspectPresentationHtmlQuality(html).issues;
}
