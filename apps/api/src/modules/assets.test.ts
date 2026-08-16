import { describe, expect, it } from "vitest";
import { DomainError } from "../platform/errors.js";
import { parseImportedDocumentFile } from "./assets.js";

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
