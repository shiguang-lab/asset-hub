import { describe, expect, it } from "vitest";
import {
  diffMarkdown,
  diffPresentationHtml,
  isPresentationHtml,
  splitMarkdownBlocks,
  structuredDiff,
} from "./diff.js";

describe("splitMarkdownBlocks", () => {
  it("keeps headings and code fences as single blocks and groups paragraphs", () => {
    const markdown = [
      "# 标题",
      "",
      "第一段",
      "继续同一段",
      "",
      "## 子标题",
      "",
      "```js",
      "const a = 1;",
      "const b = 2;",
      "```",
    ].join("\n");
    expect(splitMarkdownBlocks(markdown)).toEqual([
      "# 标题",
      "第一段\n继续同一段",
      "## 子标题",
      "```js\nconst a = 1;\nconst b = 2;\n```",
    ]);
  });
});

describe("diffMarkdown", () => {
  it("reports added, removed, modified and unchanged blocks", () => {
    const base = ["# 标题", "", "保持不变", "", "旧段落"].join("\n");
    const next = ["# 标题", "", "保持不变", "", "新段落", "", "新增块"].join("\n");
    const diff = diffMarkdown(base, next);
    expect(diff).toMatchObject({ added: 1, removed: 0, modified: 1 });
    expect(diff.blocks.map((b) => b.kind)).toEqual(["unchanged", "unchanged", "modify", "add"]);
    const modified = diff.blocks.find((b) => b.kind === "modify");
    expect(modified).toMatchObject({ text: "新段落", oldText: "旧段落" });
  });

  it("returns unchanged only for identical content", () => {
    const diff = diffMarkdown("# A\n\nbody", "# A\n\nbody");
    expect(diff).toMatchObject({ added: 0, removed: 0, modified: 0, unchanged: 2 });
  });
});

describe("diffPresentationHtml", () => {
  const page = (id: string, title: string, body: string): string =>
    `<section data-sg-page="cover" data-sg-id="${id}" aria-label="${title}"><h2 data-sg-id="b-${id}" data-sg-kind="text">${body}</h2></section>`;

  it("detects modified element text by data-sg-id", () => {
    const base = `<html><head></head><body>${page("p1", "封面", "旧标题")}</body></html>`;
    const next = `<html><head></head><body>${page("p1", "封面", "新标题")}</body></html>`;
    const diff = diffPresentationHtml(base, next);
    expect(diff).toMatchObject({ modified: 1, added: 0, removed: 0 });
    expect(diff.blocks.find((b) => b.kind === "modify")).toMatchObject({
      id: "b-p1",
      text: "新标题",
      oldText: "旧标题",
    });
  });

  it("detects added and removed pages", () => {
    const base = `<html><head></head><body>${page("p1", "一", "x")}</body></html>`;
    const next = `<html><head></head><body>${page("p1", "一", "x")}${page("p2", "二", "y")}</body></html>`;
    const diff = diffPresentationHtml(base, next);
    expect(diff).toMatchObject({ added: 1 });
    expect(diff.blocks.filter((b) => b.kind === "add")).toHaveLength(1);
  });
});

describe("structuredDiff / isPresentationHtml", () => {
  it("dispatches html with data-sg-page to presentation diff", () => {
    const html = `<section data-sg-page="x" data-sg-id="p"></section>`;
    expect(isPresentationHtml(html)).toBe(true);
    const diff = structuredDiff("html", html, html.replace("p", "q"));
    expect(diff).toMatchObject({ modified: 1 });
  });

  it("falls back to markdown diff for plain text", () => {
    expect(structuredDiff("markdown", "a\n\nb", "a\n\nc").modified).toBe(1);
  });
});
