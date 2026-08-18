import { describe, expect, it } from "vitest";
import { DomainError } from "../platform/errors.js";
import {
  downloadableAssetContent,
  extractAndUploadResources,
  parseImportedDocumentFile,
} from "./assets.js";

describe("parseImportedDocumentFile", () => {
  it("imports Markdown as normalized editable content", () => {
    expect(parseImportedDocumentFile("产品方案.md", Buffer.from("\uFEFF# 标题\r\n正文"))).toEqual({
      title: "产品方案",
      markdown: "# 标题\n正文",
    });
  });

  it("imports plain text as a Markdown document", () => {
    expect(parseImportedDocumentFile("会议记录.txt", Buffer.from("第一项\n第二项"))).toEqual({
      title: "会议记录",
      markdown: "第一项\n第二项",
    });
  });

  it("keeps Office and PDF files outside the editable document type", () => {
    expect(() => parseImportedDocumentFile("报告.docx", Buffer.from("content"))).toThrowError(
      DomainError,
    );
    try {
      parseImportedDocumentFile("报告.pdf", Buffer.from("content"));
    } catch (error) {
      expect(error).toMatchObject({ code: "DOCUMENT_FORMAT_UNSUPPORTED", status: 400 });
    }
  });
});

describe("downloadableAssetContent", () => {
  it("exports documents as named Markdown files", () => {
    const result = downloadableAssetContent(
      { type: "document", title: "产品方案" },
      { kind: "markdown", text: "# 标题", manifest: null, refs: [] },
    );
    expect(result).toMatchObject({
      fileName: "产品方案.md",
      mediaType: "text/markdown; charset=utf-8",
    });
    expect(result?.data.toString("utf8")).toBe("# 标题");
  });

  it("exports presentation manifests as JSON", () => {
    const result = downloadableAssetContent(
      { type: "presentation", title: "季度演示" },
      { kind: "manifest", text: null, manifest: { slides: [] }, refs: [] },
    );
    expect(result).toMatchObject({
      fileName: "季度演示.json",
      mediaType: "application/json; charset=utf-8",
    });
    expect(JSON.parse(result?.data.toString("utf8") ?? "{}")).toEqual({ slides: [] });
  });
});

describe("extractAndUploadResources", () => {
  it("uploads local images and rewrites them to asset: references", async () => {
    const markdown = `# 方案\n\n![封面](./assets/img.png)\n\n![外部](https://cdn.example/x.png)\n`;
    const resources = new Map([["assets/img.png", Buffer.from("png-bytes")]]);
    const uploaded: Array<{ name: string; data: string }> = [];
    const { markdown: out, uploaded: count } = await extractAndUploadResources(
      markdown,
      resources,
      async (name, data) => {
        uploaded.push({ name, data: data.toString("utf8") });
        return { id: "ast_000000000000000000000001" };
      },
    );
    expect(count).toBe(1);
    expect(uploaded).toEqual([{ name: "./assets/img.png", data: "png-bytes" }]);
    expect(out).toBe(
      `# 方案\n\n![封面](asset:ast_000000000000000000000001)\n\n![外部](https://cdn.example/x.png)\n`,
    );
  });

  it("skips references to text documents and missing files", async () => {
    const markdown = `[子文档](docs/child.md) ![图](missing.png) ![ok](a.pdf)`;
    const resources = new Map([
      ["docs/child.md", Buffer.from("# child")],
      ["a.pdf", Buffer.from("pdf")],
    ]);
    const uploaded: string[] = [];
    const { markdown: out, uploaded: count } = await extractAndUploadResources(
      markdown,
      resources,
      async (name) => {
        uploaded.push(name);
        return { id: "ast_000000000000000000000002" };
      },
    );
    expect(count).toBe(1);
    expect(uploaded).toEqual(["a.pdf"]);
    expect(out).toBe(
      `[子文档](docs/child.md) ![图](missing.png) ![ok](asset:ast_000000000000000000000002)`,
    );
  });

  it("returns the markdown unchanged when no resources are provided", async () => {
    const markdown = "![图](./x.png)";
    const { markdown: out, uploaded } = await extractAndUploadResources(
      markdown,
      undefined,
      async () => ({ id: "ast_000000000000000000000003" }),
    );
    expect(uploaded).toBe(0);
    expect(out).toBe(markdown);
  });
});
