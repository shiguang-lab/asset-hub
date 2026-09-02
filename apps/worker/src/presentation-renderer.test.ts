import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  fitAndAuditPresentationHtml,
  formatFontTooSmallIssue,
  resolveFontFloor,
  resolveStageFitScale,
  resolveUnderfillSeverity,
} from "./presentation-renderer.js";

describe("resolveStageFitScale", () => {
  it("leaves a page that fits the stage untouched", () => {
    expect(resolveStageFitScale({ requiredWidth: 1920, requiredHeight: 1080 })).toEqual({
      scale: 1,
      overfilled: false,
    });
  });

  it("absorbs sub-percent metric drift with a zoom", () => {
    const result = resolveStageFitScale({ requiredWidth: 1920, requiredHeight: 1086 });
    expect(result.overfilled).toBe(false);
    expect(result.scale).toBeLessThan(1);
    expect(result.scale).toBeGreaterThanOrEqual(0.97);
  });

  it("refuses to zoom a genuinely over-composed page so the overflow stays visible", () => {
    const result = resolveStageFitScale({ requiredWidth: 1920, requiredHeight: 1237 });
    expect(result).toEqual({ scale: 1, overfilled: true });
  });

  it("refuses to zoom when the width is the binding constraint", () => {
    expect(resolveStageFitScale({ requiredWidth: 2400, requiredHeight: 1080 })).toEqual({
      scale: 1,
      overfilled: true,
    });
  });

  it("forces a zoom in degrade mode even when genuinely over-composed", () => {
    const result = resolveStageFitScale({
      requiredWidth: 1920,
      requiredHeight: 1492,
      force: true,
      minimumScale: 0.9,
    });
    expect(result.overfilled).toBe(false);
    expect(result.scale).toBe(0.9);
  });

  it("keeps the honest ratio in degrade mode when it stays above the floor", () => {
    const result = resolveStageFitScale({
      requiredWidth: 1920,
      requiredHeight: 1162,
      force: true,
      minimumScale: 0.9,
    });
    expect(result.overfilled).toBe(false);
    expect(result.scale).toBeCloseTo((1080 / 1162) * 0.985, 4);
  });
});

describe("presentation underfill policy", () => {
  it("flags severe and moderate underfill while allowing full content", () => {
    expect(resolveUnderfillSeverity(0.59)).toBe("error");
    expect(resolveUnderfillSeverity(0.67)).toBe("warning");
    expect(resolveUnderfillSeverity(0.8)).toBeNull();
  });
});

describe("resolveFontFloor", () => {
  it("holds body text to the legibility floor", () => {
    expect(resolveFontFloor({ kind: "text", role: "", tagName: "P" })).toBe(22);
  });

  it("exempts source notes, decoration and captions", () => {
    expect(resolveFontFloor({ kind: "text", role: "source", tagName: "P" })).toBeNull();
    expect(resolveFontFloor({ kind: "text", role: "footer", tagName: "P" })).toBeNull();
    expect(resolveFontFloor({ kind: "text", role: "decoration", tagName: "DIV" })).toBeNull();
    expect(resolveFontFloor({ kind: "text", role: "", tagName: "FIGCAPTION" })).toBeNull();
  });

  it("allows data-dense regions to render smaller than body copy", () => {
    expect(resolveFontFloor({ kind: "table", role: "", tagName: "TABLE" })).toBe(16);
    expect(resolveFontFloor({ kind: "chart", role: "", tagName: "DIV" })).toBe(16);
    expect(resolveFontFloor({ kind: "metric", role: "", tagName: "DIV" })).toBe(16);
  });

  it("keeps the floor case-insensitive against authored roles", () => {
    expect(resolveFontFloor({ kind: "text", role: "Source", tagName: "P" })).toBeNull();
  });

  it("exempts author class vocabulary for source notes and footers", () => {
    expect(
      resolveFontFloor({ kind: "", role: "", tagName: "DIV", className: "data-source" }),
    ).toBeNull();
    expect(
      resolveFontFloor({ kind: "", role: "", tagName: "DIV", className: "source-line" }),
    ).toBeNull();
    expect(
      resolveFontFloor({ kind: "", role: "", tagName: "DIV", className: "footer-meta" }),
    ).toBeNull();
  });

  it("keeps unrelated classes on the body floor", () => {
    expect(
      resolveFontFloor({ kind: "", role: "", tagName: "DIV", className: "resources-grid" }),
    ).toBe(22);
    expect(resolveFontFloor({ kind: "", role: "", tagName: "DIV", className: "" })).toBe(22);
  });

  it("treats div tables as dense targets via class tokens", () => {
    expect(resolveFontFloor({ kind: "", role: "", tagName: "DIV", className: "data-table" })).toBe(
      16,
    );
    expect(
      resolveFontFloor({ kind: "", role: "", tagName: "DIV", className: "chart-canvas" }),
    ).toBe(16);
  });
});

describe("formatFontTooSmallIssue", () => {
  it("reports the effective size together with the design size and zoom", () => {
    const message = formatFontTooSmallIssue({
      elementId: "el-ai-4-55",
      designFontSize: 16,
      pageFitScale: 0.96,
      floor: 22,
    });
    expect(message).toContain("el-ai-4-55 舞台有效字号 15.36px");
    expect(message).toContain("设计 16px × 自动缩放 0.96");
    expect(message).toContain("低于 22px 下限");
  });

  it("raises the required design size to survive the page zoom", () => {
    const message = formatFontTooSmallIssue({
      elementId: "el-ai-4-55",
      designFontSize: 16,
      pageFitScale: 0.96,
      floor: 22,
    });
    expect(message).toContain("≥23px");
  });

  it("omits the zoom clause when the page was not scaled", () => {
    const message = formatFontTooSmallIssue({
      elementId: "el-ai-3-31",
      designFontSize: 16,
      pageFitScale: 1,
      floor: 22,
    });
    expect(message).toContain("舞台有效字号 16px（设计 16px）");
    expect(message).not.toContain("自动缩放");
  });

  it("tells the model to cut content instead of only enlarging the font", () => {
    const message = formatFontTooSmallIssue({
      designFontSize: 16,
      pageFitScale: 1,
      floor: 22,
    });
    expect(message).toContain("删减本页内容");
    expect(message).toContain("只放大字号会加剧越界");
  });

  it("points at dead selectors instead of content cuts when the page is not overflowing", () => {
    const message = formatFontTooSmallIssue({
      elementId: "el-ai-5-49",
      designFontSize: 16,
      pageFitScale: 1,
      floor: 22,
      overflowed: false,
    });
    expect(message).toContain("并未超出演示画布");
    expect(message).toContain("#page-N");
    expect(message).not.toContain("删减本页内容");
    expect(message).not.toContain("只放大字号会加剧越界");
  });
});

const CHROMIUM =
  process.env.PRESENTATION_CHROMIUM_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const describeWithChromium = existsSync(CHROMIUM) ? describe : describe.skip;

function slide(body: string, pageStyle = ""): string {
  return `<html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  [data-sg-page]{${pageStyle || "width:1920px;height:1080px;display:block;position:relative;overflow:hidden"}}
  </style></head><body><section data-sg-page data-sg-id="page-ai-1" id="page-ai-1" aria-label="p1">${body}</section></body></html>`;
}

describeWithChromium("fit and audit in one Chromium session", () => {
  it("does not let a full-height transparent grid hide half-page content", async () => {
    const run = await fitAndAuditPresentationHtml(
      `<html><head><style>
      *{box-sizing:border-box}html,body{margin:0;padding:0}
      [data-sg-page]{width:1920px;height:1080px;display:block;position:relative;overflow:hidden}
      </style></head><body>
      <section data-sg-page data-sg-id="cover"><h1>封面</h1></section>
      <section data-sg-page data-sg-id="content">
        <div data-sg-id="layout" style="display:grid;height:100%;padding:80px;grid-template-columns:1fr 1fr;gap:24px">
          <article data-sg-id="card-1" style="height:500px;padding:32px;background:#222"><h2 data-sg-id="title" style="font-size:44px">结论</h2><p data-sg-id="copy" style="font-size:28px">只占上半页</p></article>
          <article data-sg-id="card-2" style="height:420px;padding:32px;background:#222"><h2 data-sg-id="title-2" style="font-size:44px">样本</h2><p data-sg-id="copy-2" style="font-size:28px">仍有大量留白</p></article>
        </div>
      </section>
      <section data-sg-page data-sg-id="closing"><h1>结束</h1></section>
      </body></html>`,
      { screenshots: false },
    );
    const issue = run.audit.issues.find((item) => item.code === "RENDER_CONTENT_UNDERFILL");
    expect(issue?.page).toBe(2);
    expect(issue?.severity).toBe("error");
  });

  it("ignores the inflated box of a decorative tilt", async () => {
    const run = await fitAndAuditPresentationHtml(
      slide(
        `<div data-sg-id="card" data-sg-kind="text" style="position:absolute;right:0;bottom:0;width:400px;height:200px;font-size:28px;transform:rotate(3deg)">卡片</div>`,
      ),
      { screenshots: false },
    );
    expect(run.applied).toEqual([]);
    expect(run.audit.issues).toEqual([]);
  });

  it("still blocks a genuinely out-of-stage element", async () => {
    const run = await fitAndAuditPresentationHtml(
      slide(
        `<div data-sg-id="card" data-sg-kind="text" style="position:absolute;right:0;bottom:-40px;width:400px;height:200px;font-size:28px">卡片</div>`,
      ),
      { screenshots: false },
    );
    expect(run.applied[0]?.overfilled).toBe(true);
    expect(run.audit.issues.map((issue) => issue.code)).toContain("RENDER_ELEMENT_OUTSIDE_STAGE");
  });

  it("ignores aria-hidden decorative tracks that are intentionally clipped", async () => {
    const run = await fitAndAuditPresentationHtml(
      slide(
        `<div style="position:absolute;left:0;bottom:0;width:1920px;height:60px;overflow:hidden">
          <div aria-hidden="true" style="position:absolute;left:1800px;width:500px;white-space:nowrap;font-size:22px">装饰滚动信息</div>
        </div>`,
      ),
      { screenshots: false },
    );
    expect(run.audit.issues.map((issue) => issue.code)).not.toContain("RENDER_ELEMENT_OUTSIDE_STAGE");
  });

  it("detects visible id-less source nodes instead of treating them as invisible", async () => {
    const run = await fitAndAuditPresentationHtml(
      slide(
        `<div data-sg-id="body" data-sg-kind="text" style="position:absolute;left:96px;top:96px;width:1500px;height:700px;font-size:28px">正文</div>
         <div class="data-source" style="position:absolute;left:96px;top:1092px;font-size:20px">来源：样本清单</div>`,
      ),
      { screenshots: false },
    );
    const issue = run.audit.issues.find((item) => item.code === "RENDER_ELEMENT_OUTSIDE_STAGE");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("下方");
  });

  it("reports overlap across separate layout containers", async () => {
    const run = await fitAndAuditPresentationHtml(
      slide(
        `<div style="position:absolute;left:120px;top:160px;width:760px;height:260px"><div data-sg-id="left" data-sg-kind="text" style="position:absolute;inset:0;font-size:28px">左侧结论</div></div>
         <div style="position:absolute;left:500px;top:220px;width:760px;height:260px"><div data-sg-id="right" data-sg-kind="text" style="position:absolute;inset:0;font-size:28px">右侧结论</div></div>`,
      ),
      { screenshots: false },
    );
    expect(run.audit.issues.map((item) => item.code)).toContain("RENDER_UNEXPECTED_OVERLAP");
  });

  it("does not attribute a child font to a layout wrapper", async () => {
    const run = await fitAndAuditPresentationHtml(
      slide(
        `<div data-sg-id="card-grid" data-sg-kind="card" style="display:grid;grid-template-columns:1fr 1fr">
          <div data-sg-id="card-copy" data-sg-kind="text" style="font-size:24px">关系结论</div>
          <div class="relation-note" style="font-size:19.8px">来源说明</div>
        </div>`,
      ),
      { screenshots: false },
    );
    const fontIssues = run.audit.issues.filter((issue) => issue.code === "RENDER_FONT_TOO_SMALL");
    expect(fontIssues.map((issue) => issue.elementId)).not.toContain("card-grid");
  });

  it("reports an over-composed page instead of zooming it below the legibility floor", async () => {
    const run = await fitAndAuditPresentationHtml(
      slide(
        `<h1 data-sg-id="h" data-sg-kind="text" style="font-size:56px;margin:0 0 32px">标题</h1>
         <div data-sg-id="body" data-sg-kind="text" style="height:1200px;flex-shrink:0;font-size:16px">正文</div>`,
        "width:1920px;height:1080px;padding:80px 96px;display:flex;flex-direction:column;position:relative;overflow:hidden",
      ),
      { screenshots: false },
    );
    expect(run.applied[0]?.overfilled).toBe(true);
    expect(run.applied[0]?.scale).toBe(1);
    const overflow = run.audit.issues.find((issue) => issue.code === "RENDER_SLIDE_OVERFLOW");
    expect(overflow?.message).toContain("需压缩约");
    expect(overflow?.message).toContain("不会缩放掩盖超载");
  });

  it("degrade-fits a parked page and downgrades its issues to warnings", async () => {
    const run = await fitAndAuditPresentationHtml(
      slide(
        `<h1 data-sg-id="h" data-sg-kind="text" style="font-size:56px;margin:0 0 32px">标题</h1>
         <div data-sg-id="body" data-sg-kind="text" style="height:900px;flex-shrink:0;font-size:23px">正文</div>`,
        "width:1920px;height:1080px;padding:80px 96px;display:flex;flex-direction:column;position:relative;overflow:hidden",
      ),
      { screenshots: false, degradePages: [1] },
    );
    expect(run.applied[0]?.degraded).toBe(true);
    expect(run.applied[0]?.scale).toBeLessThan(0.98);
    expect(run.audit.issues.length).toBeGreaterThan(0);
    expect(run.audit.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
