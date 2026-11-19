import type { WorkerConfig } from "@shiguang/config";
import type { Logger } from "@shiguang/observability";
import type { ApiClient } from "./api-client.js";

const BACKFILL_INTERVAL_MS = 20_000;
const BACKFILL_INITIAL_DELAY_MS = 5_000;
const FAILURE_COOLDOWN_MS = 10 * 60_000;

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
  private readonly queue: string[] = [];
  private readonly queuedSet = new Set<string>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly failedUntil = new Map<string, number>();

  private draining = false;
  private stopped = false;
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
    if (this.backfillTimer) clearInterval(this.backfillTimer);
    if (this.backfillInitialTimer) clearTimeout(this.backfillInitialTimer);
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
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
    try {
      while (!this.stopped && this.queue.length > 0) {
        const assetId = this.queue.shift();
        if (!assetId) continue;
        this.queuedSet.delete(assetId);
        await this.processAsset(assetId);
      }
    } finally {
      this.draining = false;
    }
  }

  private async requestThumbnail(
    mode: "markdown" | "html",
    title: string,
    content: string,
  ): Promise<Buffer> {
    const res = await fetch(`${this.config.renderUrl}/internal/render/thumbnail`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": this.config.renderToken,
      },
      body: JSON.stringify({ mode, title, content }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`render-worker ${res.status}: ${body.slice(0, 300)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async processAsset(assetId: string): Promise<void> {
    const startedAt = Date.now();
    try {
      const source = await this.api.getThumbnailSource(assetId);
      if (!source || source.hasCurrentThumbnail) return;

      let jpeg: Buffer | null = null;
      if (source.type === "document" || source.type === "report") {
        jpeg = await this.requestThumbnail("markdown", source.title, source.content?.text ?? "");
      } else if (source.type === "html" || source.type === "presentation") {
        const html = extractHtmlForCover(source.content);
        if (!html) return;
        jpeg = await this.requestThumbnail("html", source.title, html);
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
