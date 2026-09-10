import { describe, expect, it } from "vitest";
import { contentHash, normaliseContent } from "./hash.js";

describe("contentHash", () => {
  it("uses the same sha256:<hex> form the server stores", () => {
    // Independently produced by packages/database `hashBuffer`.
    expect(contentHash("hello")).toBe(
      "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("hashes CRLF and LF content identically", () => {
    expect(contentHash("a\r\nb")).toBe(contentHash("a\nb"));
  });

  it("hashes multi-byte characters by their utf8 bytes", () => {
    expect(contentHash("知序")).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("distinguishes an empty document from one with a newline", () => {
    expect(contentHash("")).not.toBe(contentHash("\n"));
  });
});

describe("normaliseContent", () => {
  it("converts every CRLF to LF", () => {
    expect(normaliseContent("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("leaves lone carriage returns untouched", () => {
    expect(normaliseContent("a\rb")).toBe("a\rb");
  });
});
