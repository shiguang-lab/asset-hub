import { existsSync } from "node:fs";
import { SG_FIXED_STAGE_CSS, SG_STATICIZE_CSS } from "@shiguang/content";
import { type Browser, chromium, type Page } from "playwright-core";

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

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
// Auto-fit only absorbs sub-percent browser/font metric drift. Zooming a page
// that is genuinely over-composed hides the defect twice over: it silently
// pushes body text below the legibility floor and it reports the symptom
// Allow auto-fit zoom down to 0.89 to absorb reasonable minor overflows
// without causing cascading repair deadlocks.
const MIN_AUTO_FIT_SCALE = 0.89;
const FIT_SAFETY_MARGIN = 0.985;
/**
 * Last-resort floor for pages whose repair budget is exhausted: force-fit zooms
 * down to here (fonts ~20px effective) so the deck ships slightly denser with
 * warning-level issues instead of failing outright.
 */
const DEGRADE_MIN_AUTO_FIT_SCALE = 0.9;
/** Legibility floor for body text on the 1920×1080 stage, in screen pixels. */
const TEXT_FONT_FLOOR = 22;
/** Data-dense regions legitimately render smaller than body copy. */
const DENSE_TEXT_FONT_FLOOR = 16;
const EXEMPT_FONT_ROLES = /^(source|footer|caption|decoration)$/;
const DENSE_FONT_TARGETS = /^(table|chart|metric)$/;
const EXEMPT_FONT_TAGS = ["FIGCAPTION", "SMALL"];
const FONT_CLASS_TOKEN_SPLIT = /[^a-z0-9]+/;
const UNDERFILL_ERROR_RATIO = 0.62;
const UNDERFILL_WARNING_RATIO = 0.72;

/**
 * Role attributes only exist after the annotation stage, so during generation
 * and repair the author's own class vocabulary is the only signal that an
 * element is a source note, footer or caption. Token-boundary matching keeps
 * `data-source`/`source-line` exempt without dragging in `resources`.
 */
function fontClassTokens(className: string | undefined): string[] {
  return (className ?? "").toLowerCase().split(FONT_CLASS_TOKEN_SPLIT).filter(Boolean);
}

/**
 * Decide how much a page may be zoomed so it lands inside the fixed stage.
 * `overfilled` marks pages that need more than a cosmetic correction: the
 * caller must leave them at their authored size so the overflow stays visible
 * to the repair loop instead of being converted into unreadable text.
 * `force` (degrade mode) is the last-resort path for pages whose repair budget
 * is exhausted: it always returns a zoom clamped to `minimumScale` so the deck
 * can ship slightly denser instead of failing outright.
 */
export function resolveStageFitScale(input: {
  requiredWidth: number;
  requiredHeight: number;
  stageWidth?: number;
  stageHeight?: number;
  minimumScale?: number;
  force?: boolean;
}): { scale: number; overfilled: boolean } {
  const stageWidth = input.stageWidth ?? STAGE_WIDTH;
  const stageHeight = input.stageHeight ?? STAGE_HEIGHT;
  const minimumScale = input.minimumScale ?? MIN_AUTO_FIT_SCALE;
  const required = Math.min(
    1,
    stageWidth / Math.max(stageWidth, input.requiredWidth),
    stageHeight / Math.max(stageHeight, input.requiredHeight),
  );
  if (required >= 0.999) return { scale: 1, overfilled: false };
  if (!input.force && required < minimumScale) return { scale: 1, overfilled: true };
  // The margin only guards against sub-pixel rounding after the zoom; the
  // overfilled decision above must stay based on the honest required ratio.
  return {
    scale: Math.max(minimumScale, required * FIT_SAFETY_MARGIN),
    overfilled: false,
  };
}

/**
 * Minimum effective font size for an element on the stage, or null when the
 * element is exempt (source notes, decoration, captions).
 */
export function resolveFontFloor(input: {
  kind: string;
  role: string;
  tagName: string;
  className?: string;
}): number | null {
  const role = input.role.trim().toLowerCase();
  if (EXEMPT_FONT_ROLES.test(role)) return null;
  if (EXEMPT_FONT_TAGS.includes(input.tagName)) return null;
  const tokens = fontClassTokens(input.className);
  if (tokens.some((token) => EXEMPT_FONT_ROLES.test(token))) return null;
  const kind = input.kind.trim().toLowerCase();
  if (DENSE_FONT_TARGETS.test(kind) || DENSE_FONT_TARGETS.test(role)) return DENSE_TEXT_FONT_FLOOR;
  if (tokens.some((token) => DENSE_FONT_TARGETS.test(token))) return DENSE_TEXT_FONT_FLOOR;
  return TEXT_FONT_FLOOR;
}

/** Classify a content page whose meaningful elements stop too early vertically. */
export function resolveUnderfillSeverity(contentBottomRatio: number): "error" | "warning" | null {
  if (!Number.isFinite(contentBottomRatio) || contentBottomRatio >= UNDERFILL_WARNING_RATIO)
    return null;
  return contentBottomRatio < UNDERFILL_ERROR_RATIO ? "error" : "warning";
}

/**
 * Font issues have to tell the model what to do, not just what was measured.
 * Naming the number alone makes the model enlarge the font, which grows the
 * page and feeds the overflow rule — the deadlock this message exists to break.
 * On a page that is not overflowing, "cut content" advice is actively wrong:
 * the usual cause is author CSS that never matched its target (dead selectors,
 * inherited component sizes), so the message points at selector scoping first.
 */
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

const CHROMIUM_CANDIDATES = [
  process.env.PRESENTATION_CHROMIUM_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((value): value is string => Boolean(value));

function executablePath(): string | undefined {
  return CHROMIUM_CANDIDATES.find((candidate) => existsSync(candidate));
}

function stripStageFit(html: string): string {
  return html
    .replace(/<style\b[^>]*data-sg-stage-fit[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\sdata-sg-auto-fit=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\sdata-sg-degrade-fit=(?:"[^"]*"|'[^']*')/gi, "");
}

function cssString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, " ");
}

function staticRenderHtml(html: string): string {
  const marked = /data-sg-static\s*=/i.test(html)
    ? html
    : /<html\b/i.test(html)
      ? html.replace(/<html\b/i, '<html data-sg-static="1"')
      : `<html data-sg-static="1"><head></head><body>${html}</body></html>`;
  // Audit the same 1920×1080 box the editor/player injects. Without the fixed
  // stage, an authored page with no explicit height collapses to its children
  // (for example 687px), and half-height content is misreported as 93% full.
  const style = `<style data-sg-static-style>${SG_FIXED_STAGE_CSS}\n${SG_STATICIZE_CSS}</style>`;
  // Authored styles are frequently emitted inside <body>, after </head>. The
  // staticization overrides have to come last or a matching `!important` rule
  // from the model wins and animations survive into the audit.
  if (marked.includes("</body>")) return marked.replace("</body>", `${style}</body>`);
  return marked.includes("</head>")
    ? marked.replace("</head>", `${style}</head>`)
    : `${style}${marked}`;
}

function injectStageFit(html: string, applied: PresentationStageFit["applied"]): string {
  if (applied.length === 0) return html;
  const byPage = new Map(applied.map((fit) => [fit.page, fit]));
  let page = 0;
  let result = html.replace(/<section\b[^>]*data-sg-page[^>]*>/gi, (open) => {
    page += 1;
    const fit = byPage.get(page);
    // The marker doubles as "this page was zoomed", which is what suppresses
    // the page-level overflow rule during the audit. Pages that only received
    // a text-box repair must keep reporting their real overflow. Degrade pages
    // carry an extra marker so their issues downgrade to warnings.
    if (!fit || fit.overfilled || fit.scale >= 0.999) return open;
    const degradeAttr = fit.degraded ? ' data-sg-degrade-fit="1"' : "";
    return open.replace(/>$/, ` data-sg-auto-fit="${fit.scale.toFixed(4)}"${degradeAttr}`);
  });
  const rules: string[] = [];
  for (const fit of applied) {
    const selector = `section[data-sg-page][data-sg-id="${cssString(fit.pageId)}"]`;
    if (fit.scale < 0.999) {
      const width = STAGE_WIDTH / fit.scale;
      const height = STAGE_HEIGHT / fit.scale;
      rules.push(
        `${selector}{zoom:${fit.scale.toFixed(5)}!important;width:${width.toFixed(2)}px!important;min-width:${width.toFixed(2)}px!important;max-width:${width.toFixed(2)}px!important;height:${height.toFixed(2)}px!important;min-height:${height.toFixed(2)}px!important;max-height:${height.toFixed(2)}px!important;}`,
      );
    }
    for (const id of fit.repairedTextIds) {
      rules.push(
        `${selector} [data-sg-id="${cssString(id)}"]{min-width:0!important;height:auto!important;min-height:0!important;max-height:none!important;flex-shrink:0!important;overflow:visible!important;text-overflow:clip!important;white-space:normal!important;overflow-wrap:anywhere!important;-webkit-line-clamp:unset!important;line-clamp:unset!important;}`,
      );
    }
  }
  const style = `<style data-sg-stage-fit>\n${rules.join("\n")}\n</style>`;
  result = result.includes("</head>")
    ? result.replace("</head>", `${style}</head>`)
    : `${style}${result}`;
  return result;
}

interface StageSession {
  browser: Browser;
  page: Page;
  consoleErrors: string[];
}

async function openStageSession(): Promise<StageSession | null> {
  const path = executablePath();
  if (!path) return null;
  const browser = await chromium.launch({
    executablePath: path,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: STAGE_WIDTH, height: STAGE_HEIGHT },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (entry) => {
    if (entry.type() === "error" && consoleErrors.length < 20) consoleErrors.push(entry.text());
  });
  page.on("pageerror", (error) => {
    if (consoleErrors.length < 20) consoleErrors.push(error.message);
  });
  return { browser, page, consoleErrors };
}

/**
 * A rotated element's axis-aligned bounding box is larger than the box the
 * author actually placed, so a 2° tilt reads as an out-of-stage error. Measure
 * without the rotation but keep any translate/scale. Shared by the fit and the
 * audit pass so both judge the same geometry.
 */
const MEASURE_RECT_SOURCE = `window.__sgMeasureRect = (element) => {
  const rect = element.getBoundingClientRect();
  const raw = getComputedStyle(element).transform;
  const match = raw && raw !== "none" ? /^matrix\\(([^)]+)\\)$/.exec(raw) : null;
  if (!match) return rect;
  const values = match[1].split(",").map((value) => Number.parseFloat(value.trim()));
  if (values.length !== 6 || values.some((value) => Number.isNaN(value))) return rect;
  const a = values[0], b = values[1], c = values[2], d = values[3], e = values[4], f = values[5];
  if (Math.abs(b) < 0.001 && Math.abs(c) < 0.001) return rect;
  const previous = element.style.getPropertyValue("transform");
  const priority = element.style.getPropertyPriority("transform");
  element.style.setProperty(
    "transform",
    "translate(" + e + "px, " + f + "px) scale(" + Math.hypot(a, b) + ", " + Math.hypot(c, d) + ")",
    "important",
  );
  const stripped = element.getBoundingClientRect();
  if (priority) element.style.setProperty("transform", previous, priority);
  else if (previous) element.style.setProperty("transform", previous);
  else element.style.removeProperty("transform");
  return stripped;
};
window.__sgStripRotations = (root) => {
  const restores = [];
  for (const element of root.querySelectorAll("*")) {
    const raw = getComputedStyle(element).transform;
    const match = raw && raw !== "none" ? /^matrix\\(([^)]+)\\)$/.exec(raw) : null;
    if (!match) continue;
    const v = match[1].split(",").map((value) => Number.parseFloat(value.trim()));
    if (v.length !== 6 || v.some((value) => Number.isNaN(value))) continue;
    if (Math.abs(v[1]) < 0.001 && Math.abs(v[2]) < 0.001) continue;
    const previous = element.style.getPropertyValue("transform");
    const priority = element.style.getPropertyPriority("transform");
    element.style.setProperty(
      "transform",
      "translate(" + v[4] + "px, " + v[5] + "px) scale(" + Math.hypot(v[0], v[1]) + ", " + Math.hypot(v[2], v[3]) + ")",
      "important",
    );
    restores.push(() => {
      if (priority) element.style.setProperty("transform", previous, priority);
      else if (previous) element.style.setProperty("transform", previous);
      else element.style.removeProperty("transform");
    });
  }
  return () => { for (const restore of restores) restore(); };
};`;

async function loadStagePage(page: Page, html: string): Promise<void> {
  await page.setContent(staticRenderHtml(html), { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.evaluate(MEASURE_RECT_SOURCE);
  await settlePage(page);
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("[data-sg-page]").forEach((item) => {
      if (item.hasAttribute("data-sg-render-display")) return;
      const display = getComputedStyle(item).display;
      item.setAttribute("data-sg-render-display", display === "none" ? "block" : display);
    });
    // Apply the fixed-stage selectors only after preserving each page's
    // authored display mode; the runtime's inactive-page rule uses display:none.
    document.documentElement.setAttribute("data-sg-mode", "slide");
    document.documentElement.setAttribute("data-sg-runtime-ready", "1");
  });
}

/**
 * Resolve calculable fixed-stage geometry before asking the model to redesign pages.
 * Text boxes may grow, then the whole page is uniformly zoomed when the resulting
 * composition only overshoots the stage by a sub-percent metric drift. Pages that
 * need more than that keep their authored size on purpose: zooming them would push
 * body text below the legibility floor and report the symptom instead of the
 * over-composition that caused it.
 */
export async function fitPresentationHtmlToStage(html: string): Promise<PresentationStageFit> {
  const cleanHtml = stripStageFit(html);
  let session: StageSession | null = null;
  try {
    session = await openStageSession();
    if (!session) return { html: cleanHtml, applied: [] };
    await loadStagePage(session.page, cleanHtml);
    return await fitStagePage(session.page, cleanHtml);
  } catch (error) {
    // Silently returning the untouched deck used to look like "no page needed
    // resizing", which made measurement failures indistinguishable from a
    // clean result.
    console.warn("[presentation] stage fit failed; pages keep their authored size", error);
    return { html: cleanHtml, applied: [] };
  } finally {
    await session?.browser.close().catch(() => undefined);
  }
}

async function fitStagePage(
  page: Page,
  cleanHtml: string,
  options: { degradePages?: ReadonlySet<number> } = {},
): Promise<PresentationStageFit> {
  {
    const count = await page.locator("[data-sg-page]").count();
    const applied: PresentationStageFit["applied"] = [];

    for (let index = 0; index < count; index += 1) {
      const measured = await page.evaluate(
        ({ pageIndex, stageWidth, stageHeight }) => {
          const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-sg-page]"));
          pages.forEach((item, itemIndex) => {
            const active = itemIndex === pageIndex;
            item.classList.toggle("sg-active", active);
            item.setAttribute("aria-hidden", active ? "false" : "true");
            item.style.setProperty(
              "display",
              active ? item.getAttribute("data-sg-render-display") || "block" : "none",
              "important",
            );
            item.style.setProperty("transform", "none", "important");
          });
          const slide = pages[pageIndex];
          if (!slide) return null;
          document.documentElement.setAttribute("data-sg-mode", "slide");
          Object.assign(document.documentElement.style, {
            width: `${stageWidth}px`,
            height: `${stageHeight}px`,
          });
          Object.assign(document.body.style, {
            width: `${stageWidth}px`,
            height: `${stageHeight}px`,
          });

          const repairedTextIds: string[] = [];
          const candidates = Array.from(slide.querySelectorAll<HTMLElement>("[data-sg-id]"));
          for (const element of candidates) {
            const text = (element.innerText || "").trim();
            if (!text) continue;
            if (
              element.scrollWidth <= element.clientWidth + 2 &&
              element.scrollHeight <= element.clientHeight + 2
            ) {
              continue;
            }
            const id = element.getAttribute("data-sg-id");
            if (!id) continue;
            repairedTextIds.push(id);
            element.style.setProperty("min-width", "0", "important");
            element.style.setProperty("height", "auto", "important");
            element.style.setProperty("min-height", "0", "important");
            element.style.setProperty("max-height", "none", "important");
            element.style.setProperty("flex-shrink", "0", "important");
            element.style.setProperty("overflow", "visible", "important");
            element.style.setProperty("text-overflow", "clip", "important");
            element.style.setProperty("white-space", "normal", "important");
            element.style.setProperty("overflow-wrap", "anywhere", "important");
            element.style.setProperty("-webkit-line-clamp", "unset", "important");
          }

          // A tilted card makes the slide scrollable even when the box the
          // author placed sits inside the stage. Read the required size with
          // rotations removed so a decorative tilt cannot zoom the whole page.
          const stripRotations = (
            window as unknown as { __sgStripRotations?: (root: Element) => () => void }
          ).__sgStripRotations;
          const restore = stripRotations ? stripRotations(slide) : null;
          const requiredWidth = Math.max(stageWidth, slide.scrollWidth);
          const requiredHeight = Math.max(stageHeight, slide.scrollHeight);
          restore?.();

          return {
            pageId: slide.getAttribute("data-sg-id") || `page-${pageIndex + 1}`,
            requiredWidth,
            requiredHeight,
            repairedTextIds: [...new Set(repairedTextIds)],
          };
        },
        { pageIndex: index, stageWidth: STAGE_WIDTH, stageHeight: STAGE_HEIGHT },
      );
      if (!measured) continue;

      // Whether a page may be zoomed is a rendering policy, not a measurement
      // detail. Keeping it here lets the same rule be unit tested. Degrade
      // pages have burned their repair budget: force-fit them so the deck
      // ships instead of failing, and let the audit downgrade their issues.
      const degrade = options.degradePages?.has(index + 1) ?? false;
      const { scale, overfilled } = resolveStageFitScale({
        requiredWidth: measured.requiredWidth,
        requiredHeight: measured.requiredHeight,
        ...(degrade ? { force: true, minimumScale: DEGRADE_MIN_AUTO_FIT_SCALE } : {}),
      });

      let finalScale = scale;
      // Degrade pages enter the correction loop even at scale 1: their overflow
      // may come from an absolutely positioned element that scrollHeight never
      // sees, and only the per-element rect pass can absorb it.
      if (!overfilled && (scale < 0.999 || degrade)) {
        const zoomed = await page.evaluate(
          ({ pageIndex, initialScale, minimumScale, stageWidth, stageHeight }) => {
            const slide = Array.from(document.querySelectorAll<HTMLElement>("[data-sg-page]"))[
              pageIndex
            ];
            if (!slide) return null;
            let scale = initialScale;
            const measureRect = (
              window as unknown as { __sgMeasureRect?: (el: HTMLElement) => DOMRect }
            ).__sgMeasureRect;
            const applyScale = () => {
              slide.style.setProperty("zoom", String(scale), "important");
              const logicalWidth = stageWidth / scale;
              const logicalHeight = stageHeight / scale;
              for (const property of ["width", "min-width", "max-width"]) {
                slide.style.setProperty(property, `${logicalWidth}px`, "important");
              }
              for (const property of ["height", "min-height", "max-height"]) {
                slide.style.setProperty(property, `${logicalHeight}px`, "important");
              }
            };
            applyScale();

            for (let pass = 0; pass < 3; pass += 1) {
              const stageRect = slide.getBoundingClientRect();
              const visible = Array.from(slide.querySelectorAll<HTMLElement>("[data-sg-id]"))
                .map((element) => ({ element, style: getComputedStyle(element) }))
                .filter(({ element, style }) => {
                  const rect = element.getBoundingClientRect();
                  return (
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    Number(style.opacity || 1) > 0.01 &&
                    rect.width > 1 &&
                    rect.height > 1
                  );
                });
              let maxRight = stageRect.left + stageWidth;
              let maxBottom = stageRect.top + stageHeight;
              for (const { element } of visible) {
                const rect = measureRect ? measureRect(element) : element.getBoundingClientRect();
                maxRight = Math.max(maxRight, rect.right);
                maxBottom = Math.max(maxBottom, rect.bottom);
              }
              const correction = Math.min(
                1,
                stageWidth / Math.max(stageWidth, maxRight - stageRect.left),
                stageHeight / Math.max(stageHeight, maxBottom - stageRect.top),
              );
              if (correction >= 0.997 || scale <= minimumScale) break;
              scale = Math.max(minimumScale, scale * correction * 0.985);
              applyScale();
            }

            return { scale };
          },
          {
            pageIndex: index,
            initialScale: scale,
            minimumScale: degrade ? DEGRADE_MIN_AUTO_FIT_SCALE : MIN_AUTO_FIT_SCALE,
            stageWidth: STAGE_WIDTH,
            stageHeight: STAGE_HEIGHT,
          },
        );
        finalScale = zoomed?.scale ?? scale;
      }

      if (overfilled || finalScale < 0.999 || measured.repairedTextIds.length > 0) {
        applied.push({
          page: index + 1,
          pageId: measured.pageId,
          scale: overfilled ? 1 : finalScale,
          repairedTextIds: measured.repairedTextIds,
          ...(overfilled ? { overfilled: true } : {}),
          ...(degrade && finalScale < 0.999 ? { degraded: true } : {}),
        });
      }
      if (!overfilled && finalScale < 0.999) {
        // Marks the live DOM too, so an audit running in the same session
        // agrees with the serialized deck about which pages were zoomed.
        await page.evaluate(
          ({ pageIndex, scale, degrade }) => {
            const slide = Array.from(document.querySelectorAll<HTMLElement>("[data-sg-page]"))[
              pageIndex
            ];
            slide?.setAttribute("data-sg-auto-fit", scale.toFixed(4));
            if (degrade) slide?.setAttribute("data-sg-degrade-fit", "1");
          },
          { pageIndex: index, scale: finalScale, degrade },
        );
      }
    }
    return { html: injectStageFit(cleanHtml, applied), applied };
  }
}

async function settlePage(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts)
        await Promise.race([fonts.ready, new Promise((resolve) => setTimeout(resolve, 2500))]);
      // CSS overrides cannot stop script-driven animations (Web Animations API,
      // rAF loops). Seeking every running animation to its end keeps the audit
      // from measuring a mid-flight transform offset. Infinite effects (spinners)
      // cannot be finished; skipping them must not abort the settle itself.
      const animations = (
        document as Document & { getAnimations?: () => Animation[] }
      ).getAnimations?.();
      if (animations)
        for (const animation of animations) {
          try {
            animation.finish();
          } catch {
            // infinite target effect end — leave it running
          }
        }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })
    .catch(() => undefined);
  await page.waitForTimeout(350);
}

function auditSummary(pageCount: number, issues: PresentationRenderIssue[]): string {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return `${pageCount} 页已真实渲染；${errors} 个阻断问题，${warnings} 个视觉警告`;
}

export type PresentationAuditOptions = {
  screenshots?: boolean;
  maxScreenshots?: number;
  screenshotPages?: number[];
  onPage?: (input: { page: number; pageCount: number }) => Promise<void> | void;
  /**
   * Pages whose repair budget is exhausted: force-fit them down to
   * DEGRADE_MIN_AUTO_FIT_SCALE and downgrade their audit issues to warnings so
   * the deck ships instead of failing on one stubborn page.
   */
  degradePages?: number[];
};

export interface PresentationStageRun {
  html: string;
  applied: PresentationStageFit["applied"];
  audit: PresentationRenderAudit;
}

function unavailableAudit(summary: string, consoleErrors: string[] = []): PresentationRenderAudit {
  return { available: false, pageCount: 0, issues: [], slides: [], consoleErrors, summary };
}

export async function renderPresentationAudit(
  html: string,
  options: PresentationAuditOptions = {},
): Promise<PresentationRenderAudit> {
  let session: StageSession | null = null;
  try {
    session = await openStageSession();
    if (!session) return unavailableAudit("当前 worker 未找到 Chromium，已跳过浏览器视觉审查");
    await loadStagePage(session.page, html);
    return await auditStagePage(session.page, options, session.consoleErrors);
  } catch (error) {
    return unavailableAudit("Chromium 渲染失败，已回退到 HTML 质量检查", [
      error instanceof Error ? error.message : String(error),
    ]);
  } finally {
    await session?.browser.close().catch(() => undefined);
  }
}

/**
 * Fit and audit in one Chromium session, on one DOM. Running the audit against
 * the very deck the fit just produced removes the font-metric drift between two
 * cold browser launches and halves the Chromium start-up cost of every repair
 * pass.
 */
export async function fitAndAuditPresentationHtml(
  html: string,
  options: PresentationAuditOptions = {},
): Promise<PresentationStageRun> {
  const cleanHtml = stripStageFit(html);
  let session: StageSession | null = null;
  try {
    session = await openStageSession();
    if (!session) {
      return {
        html: cleanHtml,
        applied: [],
        audit: unavailableAudit("当前 worker 未找到 Chromium，已跳过浏览器视觉审查"),
      };
    }
    await loadStagePage(session.page, cleanHtml);
    const fit = await fitStagePage(session.page, cleanHtml, {
      degradePages: new Set(options.degradePages ?? []),
    });
    const audit = await auditStagePage(session.page, options, session.consoleErrors);
    return { html: fit.html, applied: fit.applied, audit };
  } catch (error) {
    console.warn("[presentation] stage fit and audit failed", error);
    return {
      html: cleanHtml,
      applied: [],
      audit: unavailableAudit("Chromium 渲染失败，已回退到 HTML 质量检查", [
        error instanceof Error ? error.message : String(error),
      ]),
    };
  } finally {
    await session?.browser.close().catch(() => undefined);
  }
}

async function auditStagePage(
  page: Page,
  options: PresentationAuditOptions,
  consoleErrors: string[],
): Promise<PresentationRenderAudit> {
  {
    const pageCount = await page.locator("[data-sg-page]").count();
    const issues: PresentationRenderIssue[] = [];
    const slides: PresentationSlideAudit[] = [];
    const captureCount = Math.min(options.maxScreenshots ?? 12, pageCount);
    const screenshotPages = options.screenshotPages
      ? new Set(options.screenshotPages.filter((item) => item >= 1 && item <= pageCount))
      : null;

    for (let index = 0; index < pageCount; index += 1) {
      const result = await page.evaluate((pageIndex) => {
        // Keep these literals aligned with resolveUnderfillSeverity. Functions
        // and module constants are not available inside Playwright evaluate.
        const underfillErrorRatio = 0.62;
        const underfillWarningRatio = 0.72;
        const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-sg-page]"));
        pages.forEach((item, itemIndex) => {
          const active = itemIndex === pageIndex;
          item.classList.toggle("sg-active", active);
          item.setAttribute("aria-hidden", active ? "false" : "true");
          item.style.setProperty(
            "display",
            active ? item.getAttribute("data-sg-render-display") || "block" : "none",
            "important",
          );
          item.style.setProperty("transform", "none", "important");
        });
        const slide = pages[pageIndex];
        if (!slide) return null;
        document.documentElement.setAttribute("data-sg-mode", "slide");
        document.documentElement.style.width = "1920px";
        document.documentElement.style.height = "1080px";
        document.body.style.width = "1920px";
        document.body.style.height = "1080px";
        window.scrollTo(0, 0);

        const measureRect = (
          window as unknown as { __sgMeasureRect?: (el: HTMLElement) => DOMRect }
        ).__sgMeasureRect;

        const slideRect = slide.getBoundingClientRect();
        const pageId = slide.getAttribute("data-sg-id") || `page-${pageIndex + 1}`;
        const heading = slide.querySelector<HTMLElement>("h1,h2");
        const title = (
          heading?.innerText ||
          slide.getAttribute("aria-label") ||
          `第 ${pageIndex + 1} 页`
        )
          .replace(/\s+/g, " ")
          .trim();
        const found: Array<{
          code: string;
          severity: "error" | "warning";
          elementId?: string;
          message: string;
          geometry?: PresentationElementGeometry;
        }> = [];
        // Legibility is judged in Node so the same rule can be unit tested.
        const fontCandidates: Array<{
          elementId?: string;
          kind: string;
          role: string;
          tagName: string;
          className: string;
          designFontSize: number;
          directTextLength: number;
        }> = [];
        // Read the zoom back out of the live layout instead of trusting the
        // value serialized by the fit pass: both numbers then come from the
        // same DOM, so a different browser session cannot skew the effective
        // font size the audit reports.
        const declaredScale = Number.parseFloat(slide.getAttribute("data-sg-auto-fit") || "1");
        const layoutWidth = slide.offsetWidth;
        const measuredScale = layoutWidth > 0 ? slideRect.width / layoutWidth : 1;
        const pageFitScale =
          Number.isFinite(measuredScale) && measuredScale > 0.5 && measuredScale <= 1.05
            ? measuredScale
            : declaredScale;

        const stripRotations = (
          window as unknown as { __sgStripRotations?: (root: Element) => () => void }
        ).__sgStripRotations;
        const restoreRotations = stripRotations ? stripRotations(slide) : null;
        const contentWidth = slide.scrollWidth;
        const contentHeight = slide.scrollHeight;

        // The page-level overflow number alone tells the model to "compress N%"
        // without naming a target. Name the deepest offending elements (including
        // id-less wrappers like source lines and grid containers) so the repair
        // knows exactly which box to move or shrink.
        const overflowOffenders: string[] = [];
        if (contentWidth > 1921 || contentHeight > 1081) {
          const offenders: Array<{ label: string; over: number }> = [];
          for (const el of slide.querySelectorAll("*")) {
            if (el === slide || /^(STYLE|SCRIPT)$/.test(el.tagName)) continue;
            const rect = el.getBoundingClientRect();
            const over = Math.max(
              Math.round(rect.bottom - slideRect.top - 1080),
              Math.round(rect.right - slideRect.left - 1920),
            );
            if (over <= 2) continue;
            const classToken = (el.getAttribute("class") || "").trim().split(/\s+/)[0] ?? "";
            const id = el.getAttribute("data-sg-id");
            const ownText = (el.textContent || "").trim().slice(0, 14);
            offenders.push({
              over,
              label: `${el.tagName.toLowerCase()}${id ? `#${id}` : ""}${
                classToken ? `.${classToken}` : ""
              }${ownText ? `「${ownText}」` : ""}`,
            });
          }
          offenders.sort((a, b) => b.over - a.over);
          const seen = new Set<string>();
          for (const offender of offenders) {
            if (overflowOffenders.length >= 3) break;
            const token = offender.label.replace(/「[\s\S]*$/, "");
            if (seen.has(token)) continue;
            seen.add(token);
            overflowOffenders.push(`${offender.label} +${offender.over}px`);
          }
        }
        if (restoreRotations) restoreRotations();

        // Degrade-fit pages shipped with a forced zoom: their residual overflow
        // and small fonts stay visible but as warnings, never blockers.
        const degraded = slide.hasAttribute("data-sg-degrade-fit");
        if (
          (!slide.hasAttribute("data-sg-auto-fit") || degraded) &&
          (contentWidth > 1921 || contentHeight > 1081)
        ) {
          const extraWidth = Math.max(0, contentWidth - 1920);
          const extraHeight = Math.max(0, contentHeight - 1080);
          const directions = [
            extraWidth > 0 ? `横向超出 ${extraWidth}px` : "",
            extraHeight > 0 ? `纵向超出 ${extraHeight}px` : "",
          ].filter(Boolean);
          const shrink = Math.round((Math.max(extraWidth / 1920, extraHeight / 1080) || 0) * 100);
          found.push({
            code: "RENDER_SLIDE_OVERFLOW",
            severity: degraded ? "warning" : "error",
            message: `${
              degraded ? "已降级缩放仍超出：" : ""
            }页面内容尺寸 ${contentWidth}×${contentHeight} 超过 1920×1080（${directions.join("、")}，需压缩约 ${shrink}%）：平台不会缩放掩盖超载，请删减条目、压缩间距，或把卡片网格改为多列紧凑矩阵/表格${
              overflowOffenders.length > 0
                ? `；越界最深的元素：${overflowOffenders.join("、")}（相对画布底/右边）`
                : ""
            }`,
          });
        }

        const visible: Array<{
          element: HTMLElement;
          style: CSSStyleDeclaration;
          rect: DOMRect;
        }> = [];
        // Instrumentation normally adds data-sg-id, but generated source lines,
        // SVG labels and custom wrappers can remain id-less. Only walking the
        // instrumented subset made those nodes invisible to overflow/clipping
        // diagnostics. Include id-less leaf text/visual nodes while skipping
        // wrappers that already contain an identified descendant.
        const candidates = Array.from(slide.querySelectorAll<HTMLElement>("*"));
        for (const element of candidates) {
          if (element === slide) continue;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity || 1) <= 0.01 ||
            rect.width <= 1 ||
            rect.height <= 1
          ) {
            continue;
          }
          const elementId = element.getAttribute("data-sg-id");
          const kind = element.getAttribute("data-sg-kind") || "";
          const className = element.getAttribute("class") || "";
          const hasVisualTag = /^(IMG|SVG|CANVAS|TABLE|FIGURE)$/.test(element.tagName);
          const hasVisualAttr = Boolean(element.getAttribute("data-sg-chart"));
          const text = (element.innerText || element.textContent || "").trim();
          const hasIdentifiedDescendant = Boolean(element.querySelector("[data-sg-id]"));
          const isIdlessSemantic =
            !elementId &&
            !hasIdentifiedDescendant &&
            (hasVisualTag ||
              hasVisualAttr ||
              Boolean(kind) ||
              /(?:^|[-_ ](?:source|data-source|footer|caption))(?:$|[-_ ])/i.test(className) ||
              text.length >= 2);
          if (!elementId && !isIdlessSemantic) continue;
          visible.push({
            element,
            style,
            rect: measureRect ? measureRect(element) : rect,
          });
        }

        // Fit logic catches overflow but cannot catch an unfinished page that
        // only uses the upper half of the stage. Treat severe underfill as a
        // repairable error on normal content pages; cover and closing pages
        // remain intentionally sparse.
        const pageCount = document.querySelectorAll("[data-sg-page]").length;
        const meaningful = visible.filter(({ element, style }) => {
          const role = element.getAttribute("data-sg-role") || "";
          const className = element.getAttribute("class") || "";
          const kind = element.getAttribute("data-sg-kind") || "";
          const text = (element.innerText || element.textContent || "").trim();
          const rect = element.getBoundingClientRect();
          const decorative =
            /^(decoration|background|atmosphere|source|footer|caption)$/i.test(role) ||
            /(?:^|[-_ ])(?:bg|background|atmosphere|source|footer|caption)(?:$|[-_ ])/i.test(
              className,
            );
          const structural =
            /(?:^|[-_ ])(?:sidebar|page-container|content-area|sg-grid|page-content)(?:$|[-_ ])/i.test(
              className,
            ) && rect.height >= slideRect.height * 0.72;
          const fullStageSurface =
            rect.width >= slideRect.width * 0.9 && rect.height >= slideRect.height * 0.72;
          const directText = Array.from(element.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || "")
            .join("")
            .trim();
          const hasVisibleColor = (value: string): boolean => {
            const normalized = value.trim().toLowerCase();
            if (!normalized || normalized === "transparent") return false;
            const rgba = normalized.match(/^rgba?\(([^)]+)\)$/);
            if (!rgba) return true;
            const parts = rgba[1]?.split(/[\s,/]+/).filter(Boolean) ?? [];
            return parts.length < 4 || Number.parseFloat(parts[3] || "1") > 0.01;
          };
          const hasBorder = ["Top", "Right", "Bottom", "Left"].some(
            (side) =>
              Number.parseFloat(
                style[`border${side}Width` as keyof CSSStyleDeclaration] as string,
              ) > 0.5 &&
              style[`border${side}Style` as keyof CSSStyleDeclaration] !== "none" &&
              hasVisibleColor(style[`border${side}Color` as keyof CSSStyleDeclaration] as string),
          );
          const hasVisualSurface =
            hasVisibleColor(style.backgroundColor) ||
            style.backgroundImage !== "none" ||
            hasBorder ||
            style.boxShadow !== "none" ||
            (Number.parseFloat(style.outlineWidth) > 0.5 && style.outlineStyle !== "none");
          // A transparent grid/flex wrapper can span the whole stage while all
          // of its visible cards stop halfway down. Counting that wrapper made
          // the occupancy audit certify the exact half-page defect it exists
          // to catch. Descendant text/visual nodes are measured separately.
          const transparentLayoutContainer =
            /^(?:grid|inline-grid|flex|inline-flex)$/.test(style.display) &&
            element.childElementCount > 0 &&
            directText.length === 0 &&
            !hasVisualSurface;
          return (
            !decorative &&
            !structural &&
            !fullStageSurface &&
            !transparentLayoutContainer &&
            (Boolean(kind) || text.length >= 2)
          );
        });
        if (pageIndex > 0 && pageIndex < pageCount - 1 && meaningful.length >= 3) {
          const maxBottom = Math.max(...meaningful.map(({ rect }) => rect.bottom));
          const contentBottomRatio = (maxBottom - slideRect.top) / Math.max(slideRect.height, 1);
          const underfillSeverity =
            contentBottomRatio < underfillErrorRatio
              ? "error"
              : contentBottomRatio < underfillWarningRatio
                ? "warning"
                : null;
          if (underfillSeverity) {
            found.push({
              code: "RENDER_CONTENT_UNDERFILL",
              severity: underfillSeverity,
              message: `页面内容仅占画布纵向 ${Math.round(contentBottomRatio * 100)}%，建议重排到 70%–90% 的安全占位区，避免上半屏堆叠、下半屏空置`,
            });
          }
        }

        for (const { element, style, rect } of visible) {
          // Decorative duplicates and animation tracks are intentionally marked
          // aria-hidden and may extend beyond an overflow-clipped container.
          // They are not user-facing content and must not block a deck during
          // render validation (for example, a marquee's duplicated text).
          if (element.closest('[aria-hidden="true"]')) continue;
          const elementId = element.getAttribute("data-sg-id") || undefined;
          const kind = element.getAttribute("data-sg-kind") || "";
          const text = (element.innerText || element.textContent || "").trim();
          // Anything carrying visible text has to stay on the canvas regardless
          // of whether the author tagged a kind — source lines and label divs
          // written without data-sg-kind were previously invisible to this
          // check, and the repair then only got the page-level overflow number.
          const semantic = /^(text|image|chart|metric|table|link)$/.test(kind) || text.length >= 2;
          const overflow = {
            left: Math.max(0, Math.round(slideRect.left - rect.left)),
            top: Math.max(0, Math.round(slideRect.top - rect.top)),
            right: Math.max(0, Math.round(rect.right - slideRect.right)),
            bottom: Math.max(0, Math.round(rect.bottom - slideRect.bottom)),
          };
          const parent = element.parentElement;
          const parentRect = parent?.getBoundingClientRect();
          const geometry: PresentationElementGeometry = {
            element: {
              ...(elementId ? { id: elementId } : {}),
              kind,
              tagName: element.tagName,
              x: Math.round(rect.left - slideRect.left),
              y: Math.round(rect.top - slideRect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            stage: {
              width: Math.round(slideRect.width),
              height: Math.round(slideRect.height),
            },
            overflow,
            ...(parent && parentRect
              ? {
                  parent: {
                    ...(parent.getAttribute("data-sg-id")
                      ? { id: parent.getAttribute("data-sg-id") ?? undefined }
                      : {}),
                    tagName: parent.tagName,
                    x: Math.round(parentRect.left - slideRect.left),
                    y: Math.round(parentRect.top - slideRect.top),
                    width: Math.round(parentRect.width),
                    height: Math.round(parentRect.height),
                  },
                }
              : {}),
            style: {
              display: style.display,
              position: style.position,
              overflowX: style.overflowX,
              overflowY: style.overflowY,
              fontSize: style.fontSize,
            },
          };
          const overflowDirections = Object.entries(overflow)
            .filter(([, pixels]) => pixels > 2)
            .map(([direction, pixels]) => {
              const label =
                direction === "left"
                  ? "左侧"
                  : direction === "right"
                    ? "右侧"
                    : direction === "top"
                      ? "上方"
                      : "下方";
              return `${label} ${pixels}px`;
            });
          if (overflowDirections.length > 0 && semantic) {
            found.push({
              code: "RENDER_ELEMENT_OUTSIDE_STAGE",
              severity: "error",
              elementId,
              message: `${elementId ?? element.tagName} 越出固定画布（${overflowDirections.join("、")}）`,
              geometry,
            });
          }
          const horizontalTextClipped =
            element.scrollWidth > element.clientWidth + 2 && style.overflowX !== "visible";
          const verticalTextClipped =
            element.scrollHeight > element.clientHeight + 2 && style.overflowY !== "visible";
          if (text && (horizontalTextClipped || verticalTextClipped)) {
            found.push({
              code: "RENDER_TEXT_CLIPPED",
              severity: "error",
              elementId,
              message: `${elementId ?? element.tagName} 的文本被裁切`,
              geometry,
            });
          }
          // Only the element's direct text nodes describe its own typography.
          // Recursing through descendants makes a layout wrapper (for example
          // a `data-sg-kind="card"` grid) inherit the smallest child font and
          // report a false blocker against the wrapper itself.
          let directTextLength = 0;
          let smallestOwnFontSize = Number.POSITIVE_INFINITY;
          for (const node of Array.from(element.childNodes)) {
            if (node.nodeType !== Node.TEXT_NODE) continue;
            const value = node.nodeValue ?? "";
            if (!value.trim()) continue;
            directTextLength += value.trim().length;
            const parent = (node.parentElement ?? element) as HTMLElement;
            const parentStyle = getComputedStyle(parent);
            if (parentStyle.display === "none" || parentStyle.visibility === "hidden") continue;
            const size = Number.parseFloat(parentStyle.fontSize || "0");
            if (size > 0) smallestOwnFontSize = Math.min(smallestOwnFontSize, size);
          }
          // Id-less leaf nodes are included above for overflow/clipping
          // diagnostics, but they often duplicate the same inherited text
          // through nested spans. Keep font-size gating to explicitly
          // instrumented or semantically tagged elements so one paragraph
          // cannot produce dozens of duplicate blockers.
          const fontSemantic = Boolean(elementId || kind || element.getAttribute("data-sg-role"));
          if (fontSemantic && directTextLength >= 4 && Number.isFinite(smallestOwnFontSize)) {
            fontCandidates.push({
              elementId,
              kind,
              role: element.getAttribute("data-sg-role") || "",
              tagName: element.tagName,
              className: element.getAttribute("class") || "",
              designFontSize: smallestOwnFontSize,
              directTextLength,
            });
          }
        }

        if (heading) {
          const range = document.createRange();
          range.selectNodeContents(heading);
          const lines = Array.from(range.getClientRects()).filter((rect) => rect.width > 2);
          if (lines.length >= 2) {
            const maxWidth = Math.max(...lines.map((line) => line.width));
            const lastWidth = lines[lines.length - 1]?.width ?? maxWidth;
            if (lastWidth < maxWidth * 0.22) {
              found.push({
                code: "RENDER_TITLE_ORPHAN_LINE",
                severity: "warning",
                elementId: heading.getAttribute("data-sg-id") || undefined,
                message: "标题最后一行过短，出现孤字/孤词换行",
              });
            }
          }
          const headingRect = heading.getBoundingClientRect();
          if (headingRect.width < 280 && title.length > 8) {
            found.push({
              code: "RENDER_TITLE_COLUMN_TOO_NARROW",
              severity: "error",
              elementId: heading.getAttribute("data-sg-id") || undefined,
              message: `标题列宽仅 ${Math.round(headingRect.width)}px，容易形成竖排`,
            });
          }
        }

        const siblings = visible
          .filter((entry) => {
            const kind = entry.element.getAttribute("data-sg-kind") || "";
            const role = entry.element.getAttribute("data-sg-role") || "";
            const className = entry.element.getAttribute("class") || "";
            const text = (entry.element.innerText || entry.element.textContent || "").trim();
            const visual = /^(IMG|SVG|CANVAS|TABLE|FIGURE)$/.test(entry.element.tagName);
            const decorative =
              /^(decoration|background|atmosphere)$/i.test(role) ||
              /(?:^|[-_ ])(?:bg|background|atmosphere)(?:$|[-_ ])/i.test(className);
            return (
              !decorative &&
              (/^(text|image|chart|metric|table|code-island)$/.test(kind) ||
                visual ||
                text.length >= 2)
            );
          })
          .map((entry) => entry.element);
        let overlapReports = 0;
        for (let a = 0; a < siblings.length; a += 1) {
          for (let b = a + 1; b < siblings.length; b += 1) {
            const first = siblings[a];
            const second = siblings[b];
            if (!first || !second || first.contains(second) || second.contains(first)) continue;
            const ra = measureRect ? measureRect(first) : first.getBoundingClientRect();
            const rb = measureRect ? measureRect(second) : second.getBoundingClientRect();
            const width = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
            const height = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
            const overlap = width * height;
            const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
            if (smaller > 0 && overlap / smaller > 0.28) {
              // Full-stage decorative backdrops and tiny incidental overlaps
              // are intentionally ignored; cap reports so one bad composition
              // does not drown the repair model in pairwise noise.
              const firstRole = first.getAttribute("data-sg-role") || "";
              const secondRole = second.getAttribute("data-sg-role") || "";
              if (
                /^(decoration|background|atmosphere)$/i.test(firstRole) ||
                /^(decoration|background|atmosphere)$/i.test(secondRole)
              )
                continue;
              found.push({
                code: "RENDER_UNEXPECTED_OVERLAP",
                severity: "warning",
                elementId: first.getAttribute("data-sg-id") || undefined,
                message: `${first.getAttribute("data-sg-id") ?? first.tagName} 与 ${second.getAttribute("data-sg-id") ?? second.tagName} 大面积重叠`,
              });
              overlapReports += 1;
              if (overlapReports >= 24) break;
            }
          }
          if (overlapReports >= 24) break;
        }
        return {
          pageId,
          title,
          found,
          fontCandidates,
          pageFitScale,
          pageOverflowed: found.some((issue) => issue.code === "RENDER_SLIDE_OVERFLOW"),
          degraded: slide.hasAttribute("data-sg-degrade-fit"),
        };
      }, index);
      if (!result) continue;
      for (const found of result.found) {
        issues.push({
          ...found,
          page: index + 1,
          pageId: result.pageId,
        });
      }
      const fontIssues: PresentationRenderIssue[] = [];
      for (const candidate of result.fontCandidates) {
        const floor = resolveFontFloor({
          kind: candidate.kind,
          role: candidate.role,
          tagName: candidate.tagName,
          className: candidate.className,
        });
        if (floor === null) continue;
        const effective = candidate.designFontSize * (result.pageFitScale || 1);
        if (effective <= 0 || effective >= floor) continue;
        fontIssues.push({
          code: "RENDER_FONT_TOO_SMALL",
          severity: result.degraded ? "warning" : "error",
          page: index + 1,
          pageId: result.pageId,
          ...(candidate.elementId ? { elementId: candidate.elementId } : {}),
          message: formatFontTooSmallIssue({
            ...(candidate.elementId ? { elementId: candidate.elementId } : {}),
            designFontSize: candidate.designFontSize,
            pageFitScale: result.pageFitScale || 1,
            floor,
            overflowed: result.pageOverflowed,
          }),
        });
      }
      issues.push(...fontIssues);
      let screenshotDataUrl: string | undefined;
      if (
        options.screenshots !== false &&
        (screenshotPages ? screenshotPages.has(index + 1) : index < captureCount)
      ) {
        const screenshot = await page.screenshot({ type: "jpeg", quality: 68 });
        screenshotDataUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
      }
      slides.push({
        page: index + 1,
        pageId: result.pageId,
        title: result.title,
        screenshotDataUrl,
        issueCount: result.found.length + fontIssues.length,
      });
      await options.onPage?.({ page: index + 1, pageCount });
    }
    return {
      available: true,
      pageCount,
      issues,
      slides,
      consoleErrors,
      summary: auditSummary(pageCount, issues),
    };
  }
}
