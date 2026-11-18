import { existsSync } from "node:fs";
import type { WorkerConfig } from "@shiguang/config";
import type { Logger } from "@shiguang/observability";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core";
import type { ApiClient } from "./api-client.js";

const VIEWPORT = { width: 1280, height: 720 };
const IDLE_CLOSE_MS = 180_000;
const BACKFILL_INTERVAL_MS = 20_000;
const BACKFILL_INITIAL_DELAY_MS = 5_000;
const FAILURE_COOLDOWN_MS = 10 * 60_000;
const ASSET_DOWNLOAD_PATH_RE = /\/api\/v1\/assets\/([^/?#]+)\/download/;

const CHROMIUM_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter((p): p is string => Boolean(p));

function resolveChromiumExecutable(): string | undefined {
  for (const candidate of CHROMIUM_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function extractHtmlForCover(
  content: {
    kind?: string;
    text?: string | null;
    manifest?: Record<string, unknown> | null;
  } | null,
): string | null {
  if (!content) return null;
  if (typeof content.text === "string" && content.text.trim().length > 0) {
    return content.text;
  }
  const manifestHtml = content.manifest?.html;
  if (typeof manifestHtml === "string" && manifestHtml.trim().length > 0) {
    return manifestHtml;
  }
  return null;
}

export class ThumbnailService {
  private browser: Browser | null = null;
  private markdownContext: BrowserContext | null = null;
  private markdownPage: Page | null = null;
  private renderSeq = 0;

  private readonly queue: string[] = [];
  private readonly queuedSet = new Set<string>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly failedUntil = new Map<string, number>();

  private draining = false;
  private stopped = false;
  private idleTimer: NodeJS.Timeout | null = null;
  private backfillTimer: NodeJS.Timeout | null = null;
  private backfillInitialTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: WorkerConfig,
    private readonly api: ApiClient,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.backfillInitialTimer = setTimeout(() => {
      void this.pollBackfill();
    }, BACKFILL_INITIAL_DELAY_MS);
    this.backfillTimer = setInterval(() => {
      void this.pollBackfill();
    }, BACKFILL_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.backfillTimer) clearInterval(this.backfillTimer);
    if (this.backfillInitialTimer) clearTimeout(this.backfillInitialTimer);
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    void this.closeBrowser();
  }

  enqueue(assetId: string, delayMs = 0): void {
    if (this.stopped || !assetId) return;
    // User-triggered new edits clear any previous failure cooldown.
    this.failedUntil.delete(assetId);
    const existingTimer = this.debounceTimers.get(assetId);
    if (existingTimer) clearTimeout(existingTimer);

    const push = () => {
      this.debounceTimers.delete(assetId);
      if (this.stopped) return;
      if (!this.queuedSet.has(assetId)) {
        this.queuedSet.add(assetId);
        this.queue.push(assetId);
      }
      void this.drain();
    };

    if (delayMs > 0) {
      this.debounceTimers.set(assetId, setTimeout(push, delayMs));
    } else {
      push();
    }
  }

  private async pollBackfill(): Promise<void> {
    if (this.stopped || this.draining || this.queue.length > 0) return;
    try {
      const pending = await this.api.listPendingThumbnails(8);
      const now = Date.now();
      for (const item of pending) {
        const retryAt = this.failedUntil.get(item.id) ?? 0;
        if (retryAt > now) continue;
        if (!this.queuedSet.has(item.id)) {
          this.queuedSet.add(item.id);
          this.queue.push(item.id);
        }
      }
      if (this.queue.length > 0) {
        void this.drain();
      }
    } catch (err) {
      this.logger.warn({ err: String(err) }, "thumbnail backfill poll failed");
    }
  }

  private async drain(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    try {
      while (!this.stopped && this.queue.length > 0) {
        const assetId = this.queue.shift();
        if (!assetId) continue;
        this.queuedSet.delete(assetId);
        await this.processAsset(assetId);
      }
    } finally {
      this.draining = false;
      if (!this.stopped) {
        this.scheduleIdleClose();
      }
    }
  }

  private scheduleIdleClose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.draining && this.queue.length === 0) {
        void this.closeBrowser();
      }
    }, IDLE_CLOSE_MS);
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    await this.closeBrowser();
    const executablePath = resolveChromiumExecutable();
    const browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-renderer-backgrounding",
        "--font-render-hinting=none",
      ],
    });
    browser.on("disconnected", () => {
      this.browser = null;
      this.markdownContext = null;
      this.markdownPage = null;
    });
    this.browser = browser;
    this.logger.info({ executablePath: executablePath ?? "bundled" }, "thumbnail browser launched");
    return browser;
  }

  private async closeBrowser(): Promise<void> {
    const mdPage = this.markdownPage;
    const mdCtx = this.markdownContext;
    const browser = this.browser;
    this.markdownPage = null;
    this.markdownContext = null;
    this.browser = null;
    await mdPage?.close().catch(() => undefined);
    await mdCtx?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  private async ensureMarkdownPage(): Promise<Page> {
    if (this.markdownPage && !this.markdownPage.isClosed()) {
      return this.markdownPage;
    }
    const browser = await this.ensureBrowser();
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: "dark",
    });
    const webOrigin = new URL(this.config.webBase).origin;
    await ctx.route("**/*", async (route) => {
      const reqUrl = route.request().url();
      const resourceType = route.request().resourceType();
      if (resourceType === "media" || resourceType === "websocket") {
        await route.abort().catch(() => undefined);
        return;
      }
      // Proxy embedded asset:<id> image requests via internal API with worker token.
      const assetMatch = ASSET_DOWNLOAD_PATH_RE.exec(reqUrl);
      if (assetMatch?.[1]) {
        const blob = await this.api.fetchInternalAssetBlob(assetMatch[1]).catch(() => null);
        if (blob) {
          await route.fulfill({
            status: 200,
            contentType: blob.contentType,
            body: blob.body,
          });
          return;
        }
        await route.abort().catch(() => undefined);
        return;
      }
      if (
        reqUrl.startsWith(webOrigin) ||
        reqUrl.startsWith("data:") ||
        reqUrl.startsWith("blob:")
      ) {
        await route.continue();
        return;
      }
      // Allow external images/fonts in Markdown, but abort non-essential third-party scripts.
      if (resourceType === "image" || resourceType === "font" || resourceType === "stylesheet") {
        await route.continue();
        return;
      }
      await route.abort().catch(() => undefined);
    });

    const page = await ctx.newPage();
    const renderUrl = `${this.config.webBase.replace(/\/+$/, "")}/render/thumbnail`;
    await page.goto(renderUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForFunction(
      () =>
        (window as unknown as { __thumbnailRendererReady?: boolean }).__thumbnailRendererReady ===
        true,
      null,
      { timeout: 15_000 },
    );
    this.markdownContext = ctx;
    this.markdownPage = page;
    return page;
  }

  private async resetMarkdownPage(): Promise<void> {
    const page = this.markdownPage;
    const ctx = this.markdownContext;
    this.markdownPage = null;
    this.markdownContext = null;
    await page?.close().catch(() => undefined);
    await ctx?.close().catch(() => undefined);
  }

  private async renderMarkdownThumbnail(title: string, markdown: string): Promise<Buffer> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const page = await this.ensureMarkdownPage();
        const seq = ++this.renderSeq;
        await page.evaluate(
          (payload) => {
            const win = window as unknown as {
              __renderThumbnail?: (p: { title: string; markdown: string; seq: number }) => void;
            };
            win.__renderThumbnail?.(payload);
          },
          { title, markdown, seq },
        );
        await page.waitForFunction(
          (expected) =>
            ((window as unknown as { __thumbnailRenderedSeq?: number }).__thumbnailRenderedSeq ??
              0) >= expected,
          seq,
          { timeout: 6_000 },
        );
        // Settle fonts and any embedded images with a strict cap so slow URLs never block.
        await page
          .evaluate(async () => {
            await Promise.race([
              document.fonts?.ready ?? Promise.resolve(),
              new Promise((resolve) => setTimeout(resolve, 600)),
            ]);
            const pendingImgs = Array.from(document.images).filter((img) => !img.complete);
            if (pendingImgs.length > 0) {
              await Promise.race([
                Promise.all(
                  pendingImgs.map(
                    (img) =>
                      new Promise((resolve) => {
                        img.addEventListener("load", resolve, { once: true });
                        img.addEventListener("error", resolve, { once: true });
                      }),
                  ),
                ),
                new Promise((resolve) => setTimeout(resolve, 1500)),
              ]);
            }
          })
          .catch(() => undefined);
        // Brief pause for Mermaid/chart SVG layout if present.
        const hasDiagram = await page
          .evaluate(() => Boolean(document.querySelector(".mermaid, svg.flowchart, canvas")))
          .catch(() => false);
        if (hasDiagram) {
          await page.waitForTimeout(350);
        }
        return await page.screenshot({ type: "jpeg", quality: 82 });
      } catch (err) {
        await this.resetMarkdownPage();
        if (attempt === 1) throw err;
      }
    }
    throw new Error("markdown thumbnail render failed");
  }

  private async renderHtmlThumbnail(html: string): Promise<Buffer> {
    const browser = await this.ensureBrowser();
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true,
    });
    try {
      await ctx.route("**/*", async (route) => {
        const reqUrl = route.request().url();
        const resourceType = route.request().resourceType();
        if (resourceType === "media" || resourceType === "websocket") {
          await route.abort().catch(() => undefined);
          return;
        }
        const assetMatch = ASSET_DOWNLOAD_PATH_RE.exec(reqUrl);
        if (assetMatch?.[1]) {
          const blob = await this.api.fetchInternalAssetBlob(assetMatch[1]).catch(() => null);
          if (blob) {
            await route.fulfill({
              status: 200,
              contentType: blob.contentType,
              body: blob.body,
            });
            return;
          }
          await route.abort().catch(() => undefined);
          return;
        }
        await route.continue();
      });

      const page = await ctx.newPage();
      await page
        .setContent(html, { waitUntil: "domcontentloaded", timeout: 4_500 })
        .catch(() => undefined);
      // Let initial CSS / chart / canvas paint settle within a strict budget.
      await page
        .evaluate(async () => {
          await Promise.race([
            document.fonts?.ready ?? Promise.resolve(),
            new Promise((resolve) => setTimeout(resolve, 600)),
          ]);
          const pendingImgs = Array.from(document.images).filter((img) => !img.complete);
          if (pendingImgs.length > 0) {
            await Promise.race([
              Promise.all(
                pendingImgs.map(
                  (img) =>
                    new Promise((resolve) => {
                      img.addEventListener("load", resolve, { once: true });
                      img.addEventListener("error", resolve, { once: true });
                    }),
                ),
              ),
              new Promise((resolve) => setTimeout(resolve, 1200)),
            ]);
          }
        })
        .catch(() => undefined);
      await page.waitForTimeout(300);
      return await page.screenshot({ type: "jpeg", quality: 80 });
    } finally {
      // Immediately tear down isolated context so multi-ten-MB HTML RAM is freed right away.
      await ctx.close().catch(() => undefined);
    }
  }

  private async processAsset(assetId: string): Promise<void> {
    const startedAt = Date.now();
    try {
      const source = await this.api.getThumbnailSource(assetId);
      if (!source || source.hasCurrentThumbnail) return;

      let jpeg: Buffer | null = null;
      if (source.type === "document" || source.type === "report") {
        const markdown = source.content?.text ?? "";
        jpeg = await this.renderMarkdownThumbnail(source.title, markdown);
      } else if (source.type === "html" || source.type === "presentation") {
        const html = extractHtmlForCover(source.content);
        if (!html) return;
        jpeg = await this.renderHtmlThumbnail(html);
      } else {
        return;
      }

      if (!jpeg || jpeg.byteLength === 0) return;
      const saved = await this.api.uploadThumbnail(
        source.id,
        source.currentVersionId,
        jpeg,
        "image/jpeg",
      );
      this.logger.info(
        {
          assetId: source.id,
          type: source.type,
          bytes: jpeg.byteLength,
          ms: Date.now() - startedAt,
          thumbnailRef: saved.thumbnailRef,
        },
        "thumbnail generated",
      );
    } catch (err) {
      this.failedUntil.set(assetId, Date.now() + FAILURE_COOLDOWN_MS);
      this.logger.warn(
        { assetId, err: err instanceof Error ? err.message : String(err) },
        "thumbnail generation failed",
      );
    }
  }
}
