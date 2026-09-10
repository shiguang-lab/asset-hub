import { describe, expect, it } from "vitest";
import {
  isMarkdownPath,
  normalisePath,
  titleForPath,
  toRemotePath,
  toVaultPath,
} from "./path-mapper.js";

describe("normalisePath", () => {
  it("strips surrounding and repeated separators", () => {
    expect(normalisePath("/产品//周报/")).toBe("产品/周报");
  });

  it("converts Windows separators", () => {
    expect(normalisePath("产品\\周报\\W37")).toBe("产品/周报/W37");
  });

  it("composes NFD input so macOS and Linux agree on one path", () => {
    const decomposed = "cafe\u0301/me\u0301mo";
    expect(normalisePath(decomposed)).toBe("café/mémo");
  });
});

describe("toRemotePath", () => {
  const root = "资产中心";

  it("strips the sync root prefix", () => {
    expect(toRemotePath("资产中心/产品/周报.md", root)).toBe("产品/周报.md");
  });

  it("ignores files outside the sync root", () => {
    expect(toRemotePath("日记/2026-09-10.md", root)).toBeNull();
  });

  it("rejects the sync root itself", () => {
    expect(toRemotePath("资产中心", root)).toBeNull();
  });

  it("treats every file as remote when no root is configured", () => {
    expect(toRemotePath("任意/文件.md", "")).toBe("任意/文件.md");
  });
});

describe("toVaultPath", () => {
  it("places the document under the sync root", () => {
    expect(toVaultPath("产品/周报.md", "资产中心")).toBe("资产中心/产品/周报.md");
  });

  it("returns the root itself for a document with no path", () => {
    expect(toVaultPath("", "资产中心")).toBe("资产中心");
  });
});

describe("titleForPath", () => {
  it("drops the markdown extension", () => {
    expect(titleForPath("产品/周报/W37.md")).toBe("W37");
  });

  it("keeps interior dots", () => {
    expect(titleForPath("v1.2 发布说明.md")).toBe("v1.2 发布说明");
  });
});

describe("isMarkdownPath", () => {
  it("matches case-insensitively", () => {
    expect(isMarkdownPath("A.MD")).toBe(true);
    expect(isMarkdownPath("a.txt")).toBe(false);
  });
});
