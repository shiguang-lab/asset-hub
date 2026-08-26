import { describe, expect, it } from "vitest";
import {
  applyPresentationRepairsPreservingPageCount,
  assemblePresentationFoundation,
  issuePageNumbers,
  matchRepairSections,
  pageTitlesForStreamPhase,
  preservePageIdentity,
  repairPresentationHtmlContract,
  replacePresentationPages,
  sanitizePresentationStyles,
  selectRepairSection,
} from "./presentation.js";

describe("presentation page-local repair", () => {
  it("keeps the full deck page count while streaming a repair batch", () => {
    const existingPages = Array.from({ length: 12 }, (_, index) => `页面 ${index + 1}`);
    const repairBatch = `
      <section data-sg-page="p7"><h1>第七页修复</h1></section>
      <section data-sg-page="p8"><h1>第八页修复</h1></section>
      <section data-sg-page="p9"><h1>第九页修复</h1></section>`;

    expect(pageTitlesForStreamPhase("repairing", existingPages, repairBatch)).toEqual(
      existingPages,
    );
    expect(pageTitlesForStreamPhase("rendering", existingPages, repairBatch)).toEqual([
      "第七页修复",
      "第八页修复",
      "第九页修复",
    ]);
  });

  it("removes accidental foundation preview pages before inserting planned pages", () => {
    const foundation = `<!doctype html><html><body><section data-sg-page="preview"><h1>预览</h1></section><!-- SG_GENERATED_SLIDES --></body></html>`;
    const pages = [
      `<section data-sg-page="1" data-sg-id="page-1"><h1>一</h1></section>`,
      `<section data-sg-page="2" data-sg-id="page-2"><h1>二</h1></section>`,
    ];

    const html = assemblePresentationFoundation(foundation, pages, []);

    expect(html.match(/data-sg-page=/g)).toHaveLength(2);
    expect(html).not.toContain("预览");
  });

  it("fills missing page headings from the matching plan title", () => {
    const html = `<section data-sg-page="1"><h1>已有标题</h1></section><section data-sg-page="2"><div>正文</div></section>`;

    const repaired = repairPresentationHtmlContract(html, "全局标题", ["第一页", "第二页"]);

    expect(repaired).toContain(">第一页</h1>");
    expect(repaired).toContain(">第二页</h1>");
    expect(repaired).not.toContain(">全局标题</h1>");
  });

  it("normalizes a rewritten heading back to its planned page title", () => {
    const html = `<section data-sg-page="1"><h1>被模型改写的短标题</h1><p>正文</p></section>`;

    const repaired = repairPresentationHtmlContract(html, "全局标题", ["计划中的完整标题"]);

    expect(repaired).toContain(">计划中的完整标题</h1>");
    expect(repaired).toContain("<p>正文</p>");
  });

  it("finds every page implicated by deterministic, render and review issues", () => {
    expect(
      issuePageNumbers({
        deterministicIssues: [{ code: "TITLE", message: "页面 page-07 缺少可见标题" }],
        renderAudit: {
          available: true,
          pageCount: 8,
          issues: [
            {
              code: "CLIP",
              severity: "error",
              page: 2,
              pageId: "page-02",
              message: "文本被裁切",
            },
          ],
          slides: [],
          consoleErrors: [],
          summary: "",
        },
        review: {
          summary: "",
          needsRepair: true,
          issues: [
            {
              severity: "error",
              page: 4,
              problem: "重心偏移",
              recommendation: "重新平衡",
            },
            {
              severity: "warning",
              page: 6,
              problem: "字号略小",
              recommendation: "后续可优化",
            },
          ],
        },
        pageCount: 8,
      }),
    ).toEqual([2, 4, 7]);
  });

  it("replaces only the requested page and preserves every other page", () => {
    const html = `<!doctype html><html><head></head><body>
<section data-sg-page="p1" data-sg-id="page-1"><h1>一</h1></section>
<section data-sg-page="p2" data-sg-id="page-2"><h1>二</h1></section>
<section data-sg-page="p3" data-sg-id="page-3"><h1>三</h1></section>
</body></html>`;
    const replacement = preservePageIdentity(
      `<section data-sg-page="p2" data-sg-id="page-2"><h1>二</h1></section>`,
      `<section data-sg-page="changed" data-sg-id="changed"><h1>二（已修复）</h1></section>`,
    );
    const repaired = replacePresentationPages(html, new Map([[2, replacement]]), ["#page-2{}"]);

    expect(repaired.match(/data-sg-page=/g)).toHaveLength(3);
    expect(repaired).toContain(`<section data-sg-page="p1" data-sg-id="page-1"><h1>一</h1>`);
    expect(repaired).toContain(
      `<section data-sg-page="p2" data-sg-id="page-2"><h1>二（已修复）</h1>`,
    );
    expect(repaired).toContain(`<section data-sg-page="p3" data-sg-id="page-3"><h1>三</h1>`);
    expect(repaired).toContain("data-sg-repair-page-styles");
  });

  it("drops a malformed repair page instead of swallowing an adjacent page", () => {
    const html = `<!doctype html><html><body>
<section data-sg-page="p1" data-sg-id="page-1"><h1>一</h1></section>
<section data-sg-page="p2" data-sg-id="page-2"><h1>二</h1></section>
<section data-sg-page="p3" data-sg-id="page-3"><h1>三</h1></section>
</body></html>`;
    const result = applyPresentationRepairsPreservingPageCount(
      html,
      new Map([[2, `<section data-sg-page="p2" data-sg-id="page-2"><h1>二（缺闭合标签）</h1>`]]),
      [],
      3,
      "测试演示",
    );
    expect(result.skippedPages).toEqual([2]);
    expect(result.html.match(/data-sg-page=/g)).toHaveLength(3);
    expect(result.html).toContain(">二</h1>");
    expect(result.html).toContain(">三</h1>");
  });

  it("selects the matching page when a repair response contains extra sections", () => {
    const original = `<section data-sg-page="p5" data-sg-id="page-5"><h2>原页</h2></section>`;
    const candidates = [
      `<section data-sg-page="p4" data-sg-id="page-4"><h2>错误页</h2></section>`,
      `<section data-sg-page="p5" data-sg-id="page-5"><h2>修复页</h2></section>`,
    ];

    expect(selectRepairSection(original, candidates)).toBe(candidates[1]);
    expect(selectRepairSection(original, [])).toBeNull();
  });

  it("accepts one repaired section and lets identity preservation correct its attributes", () => {
    const original = `<section data-sg-page="p6" data-sg-id="page-6"><h2>原页</h2></section>`;
    const candidate = `<section data-sg-page="wrong" data-sg-id="wrong"><h2>修复页</h2></section>`;
    const selected = selectRepairSection(original, [candidate]);

    expect(selected).toBe(candidate);
    expect(preservePageIdentity(original, selected ?? "")).toContain(
      `data-sg-page="p6" data-sg-id="page-6"`,
    );
  });

  it("salvages matching pages from an incomplete repair batch without duplicating one page", () => {
    const originals = [
      `<section data-sg-page="p4" data-sg-id="page-4"><h2>四</h2></section>`,
      `<section data-sg-page="p5" data-sg-id="page-5"><h2>五</h2></section>`,
      `<section data-sg-page="p6" data-sg-id="page-6"><h2>六</h2></section>`,
    ];
    const candidates = [
      `<section data-sg-page="p4" data-sg-id="page-4"><h2>四（已修复）</h2></section>`,
      `<section data-sg-page="p6" data-sg-id="page-6"><h2>六（已修复）</h2></section>`,
    ];

    const matched = matchRepairSections(originals, candidates);
    expect([...matched.keys()]).toEqual([0, 2]);
    expect(matched.get(0)).toContain("四（已修复）");
    expect(matched.get(2)).toContain("六（已修复）");
    expect(matched.has(1)).toBe(false);
  });

  it("normalizes authored viewport units to the 16:9 reference stage", () => {
    const html = `<style>.hero { width: 50vw; min-height: 25vh; } @media (max-width: 900px) { .grid { display: block; } }</style>`;
    const sanitized = sanitizePresentationStyles(html);

    expect(sanitized).toContain("width: 960px");
    expect(sanitized).toContain("min-height: 270px");
    expect(sanitized).toContain("@media (max-width: 900px)");
    expect(sanitized).not.toMatch(/\b(?:vw|vh|vmin|vmax)\b/);
  });
});
