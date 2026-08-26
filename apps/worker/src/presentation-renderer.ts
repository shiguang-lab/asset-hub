import { existsSync } from "node:fs";
import { SG_STATICIZE_CSS } from "@shiguang/content";
import { type Browser, chromium, type Page } from "playwright-core";

export type RenderIssueSeverity = "error" | "warning";

export interface PresentationRenderIssue {
  code: string;
  severity: RenderIssueSeverity;
  page: number;
  pageId: string;
  elementId?: string;
  message: string;
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
  }>;
}

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
const MIN_AUTO_FIT_SCALE = 0.72;

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
    .replace(/\sdata-sg-auto-fit=(?:"[^"]*"|'[^']*')/gi, "");
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
  const style = `<style data-sg-static-style>${SG_STATICIZE_CSS}</style>`;
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
    if (!fit) return open;
    return open.replace(/>$/, ` data-sg-auto-fit="${fit.scale.toFixed(4)}">`);
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

/**
 * Resolve calculable fixed-stage geometry before asking the model to redesign pages.
 * Text boxes may grow, then the whole page is uniformly zoomed when the resulting
 * composition is slightly larger than 1920×1080. Very dense pages remain blocking
 * below the minimum scale so AI repair still has to simplify them.
 */
export async function fitPresentationHtmlToStage(html: string): Promise<PresentationStageFit> {
  const cleanHtml = stripStageFit(html);
  const path = executablePath();
  if (!path) return { html: cleanHtml, applied: [] };

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
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
    await page.setContent(staticRenderHtml(cleanHtml), {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await settlePage(page);
    const count = await page.locator("[data-sg-page]").count();
    const applied: PresentationStageFit["applied"] = [];

    for (let index = 0; index < count; index += 1) {
      const fit = await page.evaluate(
        ({ pageIndex, stageWidth, stageHeight, minimumScale }) => {
          const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-sg-page]"));
          pages.forEach((item, itemIndex) => {
            const active = itemIndex === pageIndex;
            item.classList.toggle("sg-active", active);
            item.setAttribute("aria-hidden", active ? "false" : "true");
            item.style.setProperty("display", active ? "flex" : "none", "important");
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

          const requiredWidth = Math.max(stageWidth, slide.scrollWidth);
          const requiredHeight = Math.max(stageHeight, slide.scrollHeight);
          let scale = Math.min(1, stageWidth / requiredWidth, stageHeight / requiredHeight);
          if (scale < 0.999) scale *= 0.985;
          scale = Math.max(minimumScale, scale);

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
              const rect = element.getBoundingClientRect();
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

          return {
            pageId: slide.getAttribute("data-sg-id") || `page-${pageIndex + 1}`,
            scale,
            repairedTextIds: [...new Set(repairedTextIds)],
          };
        },
        {
          pageIndex: index,
          stageWidth: STAGE_WIDTH,
          stageHeight: STAGE_HEIGHT,
          minimumScale: MIN_AUTO_FIT_SCALE,
        },
      );
      if (fit && (fit.scale < 0.999 || fit.repairedTextIds.length > 0)) {
        applied.push({ page: index + 1, ...fit });
      }
    }
    await context.close();
    return { html: injectStageFit(cleanHtml, applied), applied };
  } catch {
    return { html: cleanHtml, applied: [] };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function settlePage(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts)
        await Promise.race([fonts.ready, new Promise((resolve) => setTimeout(resolve, 2500))]);
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

export async function renderPresentationAudit(
  html: string,
  options: { screenshots?: boolean; maxScreenshots?: number } = {},
): Promise<PresentationRenderAudit> {
  const path = executablePath();
  if (!path) {
    return {
      available: false,
      pageCount: 0,
      issues: [],
      slides: [],
      consoleErrors: [],
      summary: "当前 worker 未找到 Chromium，已跳过浏览器视觉审查",
    };
  }

  let browser: Browser | null = null;
  const consoleErrors: string[] = [];
  try {
    browser = await chromium.launch({
      executablePath: path,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("console", (entry) => {
      if (entry.type() === "error" && consoleErrors.length < 20) consoleErrors.push(entry.text());
    });
    page.on("pageerror", (error) => {
      if (consoleErrors.length < 20) consoleErrors.push(error.message);
    });
    await page.setContent(staticRenderHtml(html), {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await settlePage(page);

    const pageCount = await page.locator("[data-sg-page]").count();
    const issues: PresentationRenderIssue[] = [];
    const slides: PresentationSlideAudit[] = [];
    const captureCount = Math.min(options.maxScreenshots ?? 12, pageCount);

    for (let index = 0; index < pageCount; index += 1) {
      const result = await page.evaluate((pageIndex) => {
        const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-sg-page]"));
        pages.forEach((item, itemIndex) => {
          const active = itemIndex === pageIndex;
          item.classList.toggle("sg-active", active);
          item.setAttribute("aria-hidden", active ? "false" : "true");
          item.style.setProperty("display", active ? "flex" : "none", "important");
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
        }> = [];

        if (
          !slide.hasAttribute("data-sg-auto-fit") &&
          (slide.scrollWidth > 1921 || slide.scrollHeight > 1081)
        ) {
          found.push({
            code: "RENDER_SLIDE_OVERFLOW",
            severity: "error",
            message: `页面内容尺寸 ${slide.scrollWidth}×${slide.scrollHeight} 超过 1920×1080`,
          });
        }

        const visible = Array.from(slide.querySelectorAll<HTMLElement>("[data-sg-id]"))
          .filter((element) => element !== slide)
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number(style.opacity || 1) > 0.01 &&
              rect.width > 1 &&
              rect.height > 1
            );
          });

        for (const element of visible) {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const elementId = element.getAttribute("data-sg-id") || undefined;
          const kind = element.getAttribute("data-sg-kind") || "";
          const semantic = /^(text|image|chart|metric|table|link)$/.test(kind);
          const overflow =
            rect.left < slideRect.left - 2 ||
            rect.top < slideRect.top - 2 ||
            rect.right > slideRect.right + 2 ||
            rect.bottom > slideRect.bottom + 2;
          if (overflow && semantic) {
            found.push({
              code: "RENDER_ELEMENT_OUTSIDE_STAGE",
              severity: "error",
              elementId,
              message: `${elementId ?? element.tagName} 越出固定画布`,
            });
          }
          const text = (element.innerText || "").trim();
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
            });
          }
          const pageFitScale = Number.parseFloat(slide.getAttribute("data-sg-auto-fit") || "1");
          const fontSize = Number.parseFloat(style.fontSize || "0") * pageFitScale;
          const role = element.getAttribute("data-sg-role") || "";
          if (
            text.length >= 4 &&
            fontSize > 0 &&
            fontSize < 22 &&
            !/source|footer|caption/.test(role) &&
            !["FIGCAPTION", "SMALL"].includes(element.tagName)
          ) {
            found.push({
              code: "RENDER_FONT_TOO_SMALL",
              severity: "warning",
              elementId,
              message: `${elementId ?? element.tagName} 字号仅 ${fontSize}px`,
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

        const siblings = visible.filter((element) => {
          const kind = element.getAttribute("data-sg-kind") || "";
          return /^(text|image|chart|metric|table|code-island)$/.test(kind);
        });
        for (let a = 0; a < siblings.length; a += 1) {
          for (let b = a + 1; b < siblings.length; b += 1) {
            const first = siblings[a];
            const second = siblings[b];
            if (!first || !second || first.contains(second) || second.contains(first)) continue;
            if (first.parentElement !== second.parentElement) continue;
            const ra = first.getBoundingClientRect();
            const rb = second.getBoundingClientRect();
            const width = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
            const height = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
            const overlap = width * height;
            const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
            if (smaller > 0 && overlap / smaller > 0.28) {
              found.push({
                code: "RENDER_UNEXPECTED_OVERLAP",
                severity: "warning",
                elementId: first.getAttribute("data-sg-id") || undefined,
                message: `${first.getAttribute("data-sg-id") ?? first.tagName} 与 ${second.getAttribute("data-sg-id") ?? second.tagName} 大面积重叠`,
              });
            }
          }
        }
        return { pageId, title, found };
      }, index);
      if (!result) continue;
      for (const found of result.found) {
        issues.push({
          ...found,
          page: index + 1,
          pageId: result.pageId,
        });
      }
      let screenshotDataUrl: string | undefined;
      if (options.screenshots !== false && index < captureCount) {
        const screenshot = await page.screenshot({ type: "jpeg", quality: 68 });
        screenshotDataUrl = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
      }
      slides.push({
        page: index + 1,
        pageId: result.pageId,
        title: result.title,
        screenshotDataUrl,
        issueCount: result.found.length,
      });
    }
    await context.close();
    return {
      available: true,
      pageCount,
      issues,
      slides,
      consoleErrors,
      summary: auditSummary(pageCount, issues),
    };
  } catch (error) {
    return {
      available: false,
      pageCount: 0,
      issues: [],
      slides: [],
      consoleErrors: [error instanceof Error ? error.message : String(error)],
      summary: "Chromium 渲染失败，已回退到 HTML 质量检查",
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
