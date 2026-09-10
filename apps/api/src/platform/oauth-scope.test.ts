import { describe, expect, it } from "vitest";
import { mapOAuthScopes } from "./oauth-scope.js";

describe("mapOAuthScopes", () => {
  it("maps documents:write to read plus write", () => {
    expect(mapOAuthScopes("documents:write")).toEqual(["read", "write"]);
  });

  it("maps documents:read to read only", () => {
    expect(mapOAuthScopes("documents:read")).toEqual(["read"]);
  });

  it("ignores offline_access, which only governs refresh tokens", () => {
    expect(mapOAuthScopes("offline_access")).toEqual([]);
  });

  it("handles the full granted scope set", () => {
    expect(mapOAuthScopes("documents:read documents:write offline_access")).toEqual([
      "read",
      "write",
    ]);
  });

  it("treats an absent or malformed scope as no access", () => {
    expect(mapOAuthScopes(undefined)).toEqual([]);
    expect(mapOAuthScopes("")).toEqual([]);
    expect(mapOAuthScopes("   ")).toEqual([]);
    expect(mapOAuthScopes("documents:admin")).toEqual([]);
  });
});
