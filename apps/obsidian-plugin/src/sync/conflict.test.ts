import { describe, expect, it } from "vitest";
import { conflictCopyPath } from "./conflict.js";

const at = new Date(2026, 8, 10, 15, 30, 45);

describe("conflictCopyPath", () => {
  it("inserts the timestamp before the extension", () => {
    expect(conflictCopyPath("资产中心/产品/周报.md", at)).toBe(
      "资产中心/产品/周报 (冲突 2026-09-10 153045).md",
    );
  });

  it("appends the timestamp when there is no extension", () => {
    expect(conflictCopyPath("资产中心/说明", at)).toBe("资产中心/说明 (冲突 2026-09-10 153045)");
  });

  it("keeps the copy a sibling of the original", () => {
    const copy = conflictCopyPath("资产中心/a/b/c.md", at);
    expect(copy.startsWith("资产中心/a/b/")).toBe(true);
  });

  it("produces distinct names one second apart", () => {
    const later = new Date(2026, 8, 10, 15, 30, 46);
    expect(conflictCopyPath("a.md", at)).not.toBe(conflictCopyPath("a.md", later));
  });
});
