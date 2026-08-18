import { describe, expect, it } from "vitest";
import { renderPresentationHtml, validatePresentationHtml } from "./presentation.js";

const doc = {
  theme: "light",
  slides: [
    {
      id: "s1",
      layout: "title",
      title: "封面",
      blocks: [{ id: "b1", type: "heading", content: "新能源汽车市场" }],
    },
    {
      id: "s2",
      layout: "content",
      title: "要点",
      blocks: [
        { id: "b2", type: "heading", content: "核心要点" },
        { id: "b3", type: "chart", content: "1 2 3" },
      ],
    },
  ],
};

describe("renderPresentationHtml", () => {
  it("renders a single HTML artifact with data-sg-* protocol and SG runtime", () => {
    const html = renderPresentationHtml(doc as never, "演示标题");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('data-sg-page="title"');
    expect(html).toContain('data-sg-id="b1"');
    expect(html).toContain('data-sg-kind="chart"');
    expect(html).toContain("SG.presentation");
    expect(html).toContain("SG.chart");
  });

  it("escapes user content", () => {
    const html = renderPresentationHtml(
      {
        theme: "light",
        slides: [
          {
            id: "s1",
            layout: "content",
            title: "x",
            blocks: [{ id: "b1", type: "heading", content: "<script>" }],
          },
        ],
      },
      "t",
    );
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("validatePresentationHtml", () => {
  it("accepts clean presentation HTML", () => {
    const html = renderPresentationHtml(doc as never, "t");
    expect(validatePresentationHtml(html)).toEqual([]);
  });

  it("rejects external scripts, eval and network APIs", () => {
    const issues = validatePresentationHtml(
      `<section data-sg-page="a"></section><script src="https://x/a.js"></script><script>eval("1"); fetch("/x");</script>`,
    );
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("EXTERNAL_SCRIPT_NOT_ALLOWED");
    expect(codes).toContain("EVAL_NOT_ALLOWED");
    expect(codes).toContain("NETWORK_NOT_ALLOWED");
  });

  it("requires at least one data-sg-page", () => {
    expect(validatePresentationHtml("<p>no page</p>").map((i) => i.code)).toContain("NO_PAGE");
  });
});
