import { describe, expect, it } from "vitest";
import { assetPathSchema, listAssetsQuerySchema, updateAssetInputSchema } from "./index.js";

describe("listAssetsQuerySchema", () => {
  it.each([
    ["false", false],
    ["0", false],
    ["true", true],
    ["1", true],
    [false, false],
    [true, true],
  ])("parses includeDeleted=%s as %s", (input, expected) => {
    expect(listAssetsQuerySchema.parse({ includeDeleted: input }).includeDeleted).toBe(expected);
  });

  it("keeps includeDeleted optional", () => {
    expect(listAssetsQuerySchema.parse({}).includeDeleted).toBeUndefined();
  });

  it("rejects ambiguous boolean query values", () => {
    expect(() => listAssetsQuerySchema.parse({ includeDeleted: "yes" })).toThrow();
  });

  it("accepts the incremental sync and folder filters", () => {
    const parsed = listAssetsQuerySchema.parse({
      since: "2026-09-10T08:00:00.000Z",
      pathPrefix: "产品/周报",
    });
    expect(parsed.since).toBe("2026-09-10T08:00:00.000Z");
    expect(parsed.pathPrefix).toBe("产品/周报");
  });
});

describe("assetPathSchema", () => {
  it.each([
    ["README", "根目录文档"],
    ["产品/周报/W37", "多级中文路径"],
    ["a/b/c/d/e", "深层嵌套"],
    ["", "空串表示未分配"],
    ["file.name.with.dots", "文件名中的点不是路径段"],
  ])("accepts %s (%s)", (input) => {
    expect(assetPathSchema.parse(input)).toBe(input.normalize("NFC"));
  });

  it.each([
    ["/leading", "前置斜杠"],
    ["trailing/", "尾随斜杠"],
    ["a//b", "空段"],
    ["a/./b", "当前目录段"],
    ["a/../b", "父目录段，路径穿越风险"],
    ["..", "纯父目录"],
    [".", "纯当前目录"],
  ])("rejects %s (%s)", (input) => {
    expect(() => assetPathSchema.parse(input)).toThrow();
  });

  it("rejects paths longer than 512 characters", () => {
    expect(() => assetPathSchema.parse("a".repeat(513))).toThrow();
    expect(assetPathSchema.parse("a".repeat(512))).toHaveLength(512);
  });

  it("normalises macOS NFD input to NFC so folders do not fork", () => {
    // 汉字本身无分解形式，能体现 NFD/NFC 差异的是带变音符的字母与韩文 ——
    // macOS 的 HFS+/APFS 以分解形式返回文件名，若不归一，同一个目录会在
    // 服务端变成两条不同的 path。
    const nfc = "café/Ⅱ부서";
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(assetPathSchema.parse(nfd)).toBe(nfc.normalize("NFC"));
  });
});

describe("updateAssetInputSchema", () => {
  it("treats every field as optional", () => {
    expect(updateAssetInputSchema.parse({})).toEqual({});
  });

  it("validates path through assetPathSchema", () => {
    expect(() => updateAssetInputSchema.parse({ path: "a/../b" })).toThrow();
    expect(updateAssetInputSchema.parse({ path: "产品/周报" }).path).toBe("产品/周报");
  });

  it("still requires a non-empty title when provided", () => {
    expect(() => updateAssetInputSchema.parse({ title: "" })).toThrow();
  });
});
