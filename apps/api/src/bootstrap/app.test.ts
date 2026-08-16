import { describe, expect, it } from "vitest";
import { bypassesBrowserIdentity } from "./app.js";

describe("bypassesBrowserIdentity", () => {
  it("keeps health and token-protected internal routes available in production", () => {
    expect(bypassesBrowserIdentity("/healthz")).toBe(true);
    expect(bypassesBrowserIdentity("/internal/v1/outbox/claim?limit=1")).toBe(true);
  });

  it("still requires browser identity for product APIs", () => {
    expect(bypassesBrowserIdentity("/api/v1/assets")).toBe(false);
    expect(bypassesBrowserIdentity("/mcp")).toBe(false);
  });
});
