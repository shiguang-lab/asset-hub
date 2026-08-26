import { describe, expect, it } from "vitest";
import { renderPresentationHtml } from "./presentation.js";
import {
  inspectPresentationHtmlQuality,
  validatePresentationHtmlVisualQuality,
} from "./presentation-qa.js";

describe("presentation HTML visual QA", () => {
  it("accepts a rendered chart page with real data", () => {
    const html = renderPresentationHtml(
      {
        theme: "light",
        slides: [
          {
            id: "cover",
            layout: "title",
            title: "数据故事",
            blocks: [{ id: "cover-copy", type: "text", content: "从异常到行动" }],
          },
          {
            id: "trend",
            layout: "data",
            layoutVariant: "chart-story",
            title: "增长在最近三年持续加速",
            blocks: [
              { id: "summary", type: "text", content: "趋势已经形成" },
              {
                id: "chart",
                type: "chart",
                content: "增长趋势",
                meta: {
                  sourceRef: "source#L4",
                  chart: { type: "line", labels: ["2023", "2024"], data: [10, 20] },
                },
              },
            ],
          },
        ],
      },
      "数据故事",
    );
    const report = inspectPresentationHtmlQuality(html);
    expect(report.pageCount).toBe(2);
    expect(report.visualPageCount).toBe(1);
    expect(report.issues.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("blocks an empty chart and reports missing source refs", () => {
    const html = renderPresentationHtml(
      {
        theme: "light",
        slides: [
          {
            id: "data",
            layout: "data",
            title: "数据还未准备好",
            blocks: [{ id: "chart", type: "chart", content: "趋势图" }],
          },
        ],
      },
      "数据",
    );
    const issues = validatePresentationHtmlVisualQuality(html);
    expect(issues.map((item) => item.code)).toContain("HTML_CHART_DATA_MISSING");
    expect(issues.map((item) => item.code)).toContain("HTML_SOURCE_REF_MISSING");
    expect(issues.some((item) => item.severity === "error")).toBe(true);
  });

  it("flags text-only pages and repeated layouts", () => {
    const pages = Array.from(
      { length: 5 },
      (_, index) => `
      <section data-sg-page="content" data-sg-id="p${index}">
        <h2>第 ${index + 1} 页</h2><ul><li>要点</li></ul>
      </section>
    `,
    ).join("\n");
    const issues = validatePresentationHtmlVisualQuality(pages);
    expect(issues.map((item) => item.code)).toContain("HTML_TEXT_ONLY");
    expect(issues.map((item) => item.code)).toContain("HTML_REPEATED_LAYOUT");
    expect(issues.map((item) => item.code)).toContain("HTML_VISUAL_COVERAGE_LOW");
  });

  it("allows responsive CSS as long as the page remains a valid 16:9 presentation", () => {
    const html = `<!doctype html><style>.hero{font-size:6vw}@media(max-width:900px){.grid{grid-template-columns:1fr}}</style><section data-sg-page="content"><h2>16:9 页面</h2><svg data-sg-kind="code-island"></svg></section>`;
    const codes = validatePresentationHtmlVisualQuality(html).map((item) => item.code);
    expect(codes).not.toContain("HTML_VIEWPORT_UNITS_NOT_ALLOWED");
    expect(codes).not.toContain("HTML_RESPONSIVE_REFLOW_NOT_ALLOWED");
  });
});
