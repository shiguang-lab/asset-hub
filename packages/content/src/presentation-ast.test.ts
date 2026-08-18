import { describe, expect, it } from "vitest";
import { renderPresentationHtml } from "./presentation.js";
import {
  addPage,
  duplicatePage,
  listEditableElements,
  listPages,
  movePage,
  parsePresentationHtml,
  removePage,
  serializePresentationHtml,
  setDataAttribute,
  setTheme,
  updateImageSrc,
  updateTextContent,
} from "./presentation-ast.js";

const doc = {
  theme: "light",
  slides: [
    {
      id: "s1",
      layout: "title",
      title: "封面",
      blocks: [
        { id: "b1", type: "heading", content: "标题" },
        { id: "b2", type: "image", content: "https://x/a.png" },
      ],
    },
    {
      id: "s2",
      layout: "content",
      title: "要点",
      blocks: [{ id: "b3", type: "heading", content: "核心要点" }],
    },
  ],
};

function sampleTree() {
  return parsePresentationHtml(renderPresentationHtml(doc as never, "演示"));
}

describe("presentation AST", () => {
  it("round-trips parse -> serialize", () => {
    const html = renderPresentationHtml(doc as never, "演示");
    const tree = parsePresentationHtml(html);
    const out = serializePresentationHtml(tree);
    expect(out).toContain('data-sg-id="b1"');
    expect(out).toContain("SG.presentation");
  });

  it("lists pages", () => {
    expect(listPages(sampleTree())).toEqual([
      { id: "page-s1", layout: "title", title: "封面" },
      { id: "page-s2", layout: "content", title: "要点" },
    ]);
  });

  it("updates text content by data-sg-id", () => {
    const tree = sampleTree();
    expect(updateTextContent(tree, "b1", "新标题")).toBe(true);
    expect(serializePresentationHtml(tree)).toContain("新标题");
    expect(updateTextContent(tree, "missing", "x")).toBe(false);
  });

  it("updates image src and data attributes", () => {
    const tree = sampleTree();
    expect(updateImageSrc(tree, "b2", "https://x/b.png")).toBe(true);
    expect(serializePresentationHtml(tree)).toContain('src="https://x/b.png"');
    expect(setDataAttribute(tree, "b1", "data-sg-hover", "lift")).toBe(true);
    expect(serializePresentationHtml(tree)).toContain('data-sg-hover="lift"');
  });

  it("adds, moves, duplicates and removes pages", () => {
    const tree = sampleTree();
    expect(addPage(tree, { id: "s3", layout: "content", title: "新页" })).toBe(true);
    expect(listPages(tree).map((p) => p.id)).toEqual(["page-s1", "page-s2", "page-s3"]);

    expect(movePage(tree, "page-s3", -1)).toBe(true);
    expect(listPages(tree).map((p) => p.id)).toEqual(["page-s1", "page-s3", "page-s2"]);

    expect(duplicatePage(tree, "page-s1", "page-s1-copy")).toBe(true);
    expect(listPages(tree).length).toBe(4);

    expect(removePage(tree, "page-s3")).toBe(true);
    expect(listPages(tree).map((p) => p.id)).toEqual(["page-s1", "page-s1-copy", "page-s2"]);
  });

  it("lists editable elements and switches theme", () => {
    const tree = sampleTree();
    const elements = listEditableElements(tree, "page-s1");
    // 封面页额外带 eyebrow/title 两个可编辑锚点（富视觉布局），正文块 b1/b2 依旧在列。
    expect(elements.map((e) => e.id).filter((id) => id === "b1" || id === "b2")).toEqual([
      "b1",
      "b2",
    ]);
    expect(elements.find((e) => e.id === "b1")?.text).toBe("标题");

    expect(setTheme(tree, "dark")).toBe(true);
    expect(serializePresentationHtml(tree)).toContain("--sg-background: #0f1420");
  });
});
