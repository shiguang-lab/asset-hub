import { describe, expect, it } from "vitest";
import { listAssetsQuerySchema } from "./index.js";

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
});
