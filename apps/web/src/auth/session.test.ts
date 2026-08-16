import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canWriteWorkspace,
  currentReturnTo,
  fetchAuthSession,
  fetchMyOrganizations,
  isWorkspaceAdmin,
  switchContext,
  unifiedLoginUrl,
} from "./session.js";

const localLocation = {
  hostname: "localhost",
  origin: "http://localhost:3000",
  pathname: "/documents",
  search: "?view=mine",
  hash: "#recent",
  href: "http://localhost:3000/documents?view=mine#recent",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unified login", () => {
  it("maps personal, Group admin, editor, and viewer sessions to UI capabilities", () => {
    const base = {
      id: "user-1",
      displayName: "User",
      email: null,
      tenantId: "user-1",
      organizationName: null,
    };
    expect(canWriteWorkspace({ ...base, tenantType: "user", roles: [] })).toBe(true);
    expect(isWorkspaceAdmin({ ...base, tenantType: "user", roles: [] })).toBe(true);
    expect(canWriteWorkspace({ ...base, tenantType: "org", roles: ["org:member"] })).toBe(true);
    expect(isWorkspaceAdmin({ ...base, tenantType: "org", roles: ["org:member"] })).toBe(false);
    expect(canWriteWorkspace({ ...base, tenantType: "org", roles: ["org:viewer"] })).toBe(false);
  });

  it("preserves the complete local return path", () => {
    expect(currentReturnTo(localLocation)).toBe("/documents?view=mine#recent");
    expect(unifiedLoginUrl(localLocation)).toBe(
      "http://localhost:3000/login?return_to=%2Fdocuments%3Fview%3Dmine%23recent",
    );
  });

  it("normalizes the shared auth-service session response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            authenticated: true,
            subject: "user-1",
            displayName: "测试用户",
            email: "user@example.test",
            organization: { id: "org-1", name: "测试团队" },
            roles: ["org:member"],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchAuthSession()).resolves.toEqual({
      id: "user-1",
      displayName: "测试用户",
      email: "user@example.test",
      tenantType: "org",
      tenantId: "org-1",
      organizationName: "测试团队",
      roles: ["org:member"],
    });
  });

  it("accepts the OPC BFF session envelope during gateway migration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: {
              id: "user-2",
              username: "OPC User",
              tenantType: "user",
              tenantId: "user-2",
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchAuthSession()).resolves.toMatchObject({
      id: "user-2",
      displayName: "OPC User",
      tenantType: "user",
      tenantId: "user-2",
    });
  });

  it("loads the current user's Group spaces", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          organizations: [{ id: "org-1", name: "产品团队", roles: ["org:admin"] }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchMyOrganizations()).resolves.toEqual([
      { id: "org-1", name: "产品团队", roles: ["org:admin"] },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/orgs",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("switches back to the personal context through auth-service", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await switchContext("");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/context",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ organizationId: "" }) }),
    );
  });
});
