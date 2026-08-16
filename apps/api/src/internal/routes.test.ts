import { describe, expect, it } from "vitest";
import { normalizeReleasePath } from "./routes.js";

describe("normalizeReleasePath", () => {
  it("accepts release-relative asset paths", () => {
    expect(normalizeReleasePath("index.html")).toBe("index.html");
    expect(normalizeReleasePath("assets/chart/data.json")).toBe("assets/chart/data.json");
  });

  it("rejects traversal and ambiguous paths", () => {
    expect(normalizeReleasePath("../secret")).toBeNull();
    expect(normalizeReleasePath("assets//file.js")).toBeNull();
    expect(normalizeReleasePath("assets/./file.js")).toBeNull();
  });
});
