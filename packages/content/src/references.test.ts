import { describe, expect, it } from "vitest";
import {
  extractMarkdownReferences,
  isLocalReference,
  parseAssetReferences,
  parseHtmlAssetReferences,
  rewriteAssetLinks,
  rewriteMarkdownReferences,
} from "./references.js";

const AID = "ast_0123456789abcdef01234567";

describe("parseAssetReferences", () => {
  it("parses inline links", () => {
    expect(parseAssetReferences(`见 [示例文档](asset:${AID})`)).toEqual([
      { assetId: AID, kind: "link", label: "示例文档" },
    ]);
  });

  it("parses images", () => {
    expect(parseAssetReferences(`![封面](asset:${AID})`)).toEqual([
      { assetId: AID, kind: "image", label: "封面" },
    ]);
  });

  it("parses multiple mixed references and ignores external links", () => {
    const source = [
      `[内部](asset:${AID})`,
      `[外部](https://example.com/x)`,
      `![图](asset:${AID})`,
      `[[wiki-link]]`,
    ].join("\n");
    expect(parseAssetReferences(source)).toEqual([
      { assetId: AID, kind: "link", label: "内部" },
      { assetId: AID, kind: "image", label: "图" },
    ]);
  });

  it("returns an empty array when there are no asset references", () => {
    expect(parseAssetReferences("普通文本 [链接](https://a.b) ![图](/x.png)")).toEqual([]);
  });
});

describe("parseHtmlAssetReferences", () => {
  it("parses href and src references with single or double quotes", () => {
    const html = `<a href="asset:${AID}">x</a><img src='asset:${AID}'>`;
    expect(parseHtmlAssetReferences(html)).toEqual([
      { assetId: AID, kind: "link", label: "" },
      { assetId: AID, kind: "image", label: "" },
    ]);
  });
});

describe("rewriteAssetLinks", () => {
  it("rewrites href and src via the resolver", () => {
    const html = `<a href="asset:${AID}">x</a><img src="asset:${AID}">`;
    const out = rewriteAssetLinks(html, ({ kind }) => (kind === "image" ? "img.png" : "doc.html"));
    expect(out).toBe(`<a href="doc.html">x</a><img src="img.png">`);
  });

  it("keeps unresolved references untouched", () => {
    const html = `<a href="asset:${AID}">x</a>`;
    expect(rewriteAssetLinks(html, () => null)).toBe(html);
  });

  it("escapes special characters in resolved urls", () => {
    const html = `<a href="asset:${AID}">x</a>`;
    expect(rewriteAssetLinks(html, () => 'a&b"c')).toBe(`<a href="a&amp;b&quot;c">x</a>`);
  });

  it("rewrites single-quoted references and preserves the quote style", () => {
    const html = `<a href='asset:${AID}'>x</a><img src='asset:${AID}'>`;
    const out = rewriteAssetLinks(html, ({ kind }) => (kind === "image" ? "i.png" : "d.html"));
    expect(out).toBe(`<a href='d.html'>x</a><img src='i.png'>`);
  });
});

describe("extractMarkdownReferences", () => {
  it("extracts images and links with their src and label", () => {
    const source = `![封面](./assets/img.png)\n\n[数据](docs/data.csv "说明")`;
    expect(extractMarkdownReferences(source)).toEqual([
      { kind: "image", src: "./assets/img.png", label: "封面" },
      { kind: "link", src: "docs/data.csv", label: "数据" },
    ]);
  });

  it("handles angle-bracketed src and ignores raw html", () => {
    const source = `![图](<my image.png>) ![外](https://x/y.png) <img src="a.png">`;
    expect(extractMarkdownReferences(source)).toEqual([
      { kind: "image", src: "my image.png", label: "图" },
      { kind: "image", src: "https://x/y.png", label: "外" },
    ]);
  });
});

describe("rewriteMarkdownReferences", () => {
  it("rewrites only resolved references and preserves label and title", () => {
    const source = `![封面](./a.png "图")\n\n[文档](docs/b.pdf)\n\n[外](https://x/y)`;
    const out = rewriteMarkdownReferences(source, (ref) =>
      ref.src === "docs/b.pdf" ? "asset:ast_000000000000000000000000" : null,
    );
    expect(out).toBe(
      `![封面](./a.png "图")\n\n[文档](asset:ast_000000000000000000000000)\n\n[外](https://x/y)`,
    );
  });
});

describe("isLocalReference", () => {
  it("recognizes relative and root-relative paths as local", () => {
    expect(isLocalReference("./a.png")).toBe(true);
    expect(isLocalReference("../a.png")).toBe(true);
    expect(isLocalReference("assets/img.png")).toBe(true);
    expect(isLocalReference("/abs/x.png")).toBe(true);
  });

  it("rejects schemes, fragments and protocol-relative urls", () => {
    expect(isLocalReference("https://x/y.png")).toBe(false);
    expect(isLocalReference("data:image/png;base64,AAA")).toBe(false);
    expect(isLocalReference("asset:ast_000000000000000000000000")).toBe(false);
    expect(isLocalReference("mailto:a@b.c")).toBe(false);
    expect(isLocalReference("#fragment")).toBe(false);
    expect(isLocalReference("//cdn/x.png")).toBe(false);
  });
});
