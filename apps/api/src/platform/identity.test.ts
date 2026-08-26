import type { Store, WorkspaceRole } from "@shiguang/database";
import { describe, expect, it, vi } from "vitest";
import { IdentityService, roleFromOrganizationRoles } from "./identity.js";

function createStore() {
  const workspaces = new Map<string, { id: string; type: "personal" | "team" }>();
  return {
    ensurePersonalWorkspace: vi.fn(async (subject: string) => {
      const workspace = { id: `personal:${subject}`, type: "personal" as const };
      workspaces.set(workspace.id, workspace);
      return workspace;
    }),
    ensureTeamWorkspace: vi.fn(
      async (input: { externalId: string; subject: string; role: WorkspaceRole }) => {
        const workspace = { id: `team:${input.externalId}`, type: "team" as const };
        workspaces.set(workspace.id, workspace);
        return workspace;
      },
    ),
    ensureUser: vi.fn(async () => ({})),
    getWorkspace: vi.fn(async (id: string) => workspaces.get(id) ?? null),
    getWorkspaceRole: vi.fn(async () => null),
    findApiTokenByHash: vi.fn(async () => null),
    touchApiToken: vi.fn(async () => undefined),
  } as unknown as Store;
}

describe("IdentityService workspace authorization", () => {
  it("maps organization roles to Asset Hub roles", () => {
    expect(roleFromOrganizationRoles(["org:admin"])).toBe("admin");
    expect(roleFromOrganizationRoles(["org:member"])).toBe("editor");
    expect(roleFromOrganizationRoles(["org:viewer"])).toBe("viewer");
    expect(roleFromOrganizationRoles(["system-admin"])).toBeNull();
  });

  it("prevents a Group viewer from writing", async () => {
    const identity = new IdentityService(createStore(), {
      devAuth: false,
      demoSubject: "demo",
      verifyAssertion: async () => ({
        sub: "user-1",
        organizationId: "org-1",
        roles: ["org:viewer"],
      }),
    });
    const actor = await identity.resolve({ "x-sg-identity": "signed" });

    expect(actor).toMatchObject({ workspaceType: "team", workspaceRole: "viewer" });
    expect(actor.tokenScopes).toEqual(["read"]);
    expect(() => identity.requireWrite(actor)).toThrow("只读权限");
  });

  it("rejects an unsigned JSON assertion outside DEV_AUTH", async () => {
    const identity = new IdentityService(createStore(), {
      devAuth: false,
      demoSubject: "demo",
      verifyAssertion: async () => null,
    });

    await expect(
      identity.resolve({
        "x-sg-identity": JSON.stringify({ sub: "attacker", org_id: "org-1" }),
      }),
    ).rejects.toThrow("签名无效");
  });

  it("resolves personal and Group contexts to different local workspaces", async () => {
    const store = createStore();
    let organizationId: string | undefined;
    const identity = new IdentityService(store, {
      devAuth: false,
      demoSubject: "demo",
      verifyAssertion: async () => ({
        sub: "user-1",
        organizationId,
        roles: organizationId ? ["org:member"] : [],
      }),
    });

    const personal = await identity.resolve({ "x-sg-identity": "personal" });
    organizationId = "org-1";
    const group = await identity.resolve({ "x-sg-identity": "group" });

    expect(personal.workspaceId).toBe("personal:user-1");
    expect(group.workspaceId).toBe("team:org-1");
    expect(group.workspaceId).not.toBe(personal.workspaceId);
  });

  it("syncs the verified display name into the local user directory", async () => {
    const store = createStore();
    const identity = new IdentityService(store, {
      devAuth: false,
      demoSubject: "demo",
      verifyAssertion: async () => ({
        sub: "38291406",
        displayName: "yanxianliang",
        roles: [],
      }),
    });

    await identity.resolve({ "x-sg-identity": "signed" });

    expect(store.ensureUser).toHaveBeenCalledWith({
      subject: "38291406",
      workspaceId: "personal:38291406",
      displayName: "yanxianliang",
    });
  });
});
