import type { ActorContext, Asset, Task } from "@shiguang/contracts";
import type { Store } from "@shiguang/database";
import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "../types.js";
import {
  enforceRequestAuthorization,
  requireAssetAccess,
  requiresWorkspaceWrite,
  requireTaskAccess,
} from "./authorization.js";

const editor: ActorContext = {
  subject: "editor-1",
  workspaceId: "ws_team",
  workspaceType: "team",
  workspaceRole: "editor",
  requestId: "req_test",
  isService: false,
  tokenScopes: ["read", "write"],
};

const viewer: ActorContext = {
  ...editor,
  subject: "viewer-1",
  workspaceRole: "viewer",
  tokenScopes: ["read"],
};

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "ast_private",
    workspaceId: "ws_team",
    ownerSubject: "owner-1",
    type: "document",
    title: "Private document",
    path: "",
    description: "",
    visibility: "private",
    status: "normal",
    sourceType: "manual",
    currentVersionId: null,
    lockVersion: 1,
    deletedAt: null,
    publishedUrl: null,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

function appContext(target: Asset, acl: Array<Record<string, string>> = []): AppContext {
  return {
    store: {
      getAsset: vi.fn(async () => target),
      listAcl: vi.fn(async () => acl),
    } as unknown as Store,
  } as AppContext;
}

describe("asset authorization", () => {
  it("does not disclose private Group assets to other members", async () => {
    await expect(
      requireAssetAccess(appContext(asset()), editor, "ast_private", "read"),
    ).rejects.toThrow("没有读取");
  });

  it("allows Group members to read a member-visible asset without edit rights", async () => {
    const ctx = appContext(asset({ visibility: "member_only" }));
    await expect(requireAssetAccess(ctx, viewer, "ast_private", "read")).resolves.toMatchObject({
      id: "ast_private",
    });
    await expect(requireAssetAccess(ctx, editor, "ast_private", "write")).rejects.toThrow(
      "没有编辑",
    );
  });

  it("honors ACL roles without allowing an editor to delete or manage sharing", async () => {
    const ctx = appContext(asset(), [
      { principal_type: "user", principal_id: "viewer-1", role: "viewer" },
      { principal_type: "user", principal_id: "editor-1", role: "editor" },
    ]);
    await expect(requireAssetAccess(ctx, viewer, "ast_private", "read")).resolves.toBeDefined();
    await expect(requireAssetAccess(ctx, viewer, "ast_private", "write")).rejects.toThrow(
      "没有编辑",
    );
    await expect(requireAssetAccess(ctx, editor, "ast_private", "write")).resolves.toBeDefined();
    await expect(requireAssetAccess(ctx, editor, "ast_private", "delete")).rejects.toThrow(
      "只有资产所有者",
    );
    await expect(requireAssetAccess(ctx, editor, "ast_private", "manage")).rejects.toThrow(
      "只有资产所有者",
    );
  });
});

describe("task and route authorization", () => {
  it("allows Group members to read tasks but restricts controls to the task owner", async () => {
    const task = { ownerSubject: "owner-1" } as Task;
    const store = { getTask: vi.fn(async () => task) } as unknown as Store;
    await expect(requireTaskAccess(store, editor, "tsk_task", "read")).resolves.toBe(task);
    await expect(requireTaskAccess(store, editor, "tsk_task", "write")).rejects.toThrow(
      "任务创建者",
    );
  });

  it("requires asset-management access for ACL routes and administrator access for settings", async () => {
    const ctx = appContext(asset(), [
      { principal_type: "user", principal_id: "editor-1", role: "editor" },
    ]);
    await expect(
      enforceRequestAuthorization(ctx, {
        method: "GET",
        url: "/api/v1/assets/ast_private/acl",
        actor: editor,
      }),
    ).rejects.toThrow("管理该资产");
    await expect(
      enforceRequestAuthorization(ctx, {
        method: "GET",
        url: "/api/v1/integrations/tokens",
        actor: editor,
      }),
    ).rejects.toThrow("组织管理员");
  });

  it("keeps POST-only read queries available to viewers", () => {
    expect(
      requiresWorkspaceWrite({ method: "POST", url: "/api/v1/knowledge-bases/kb_1/search" }),
    ).toBe(false);
    expect(requiresWorkspaceWrite({ method: "POST", url: "/api/v1/datasets/ds_1/query" })).toBe(
      false,
    );
    expect(requiresWorkspaceWrite({ method: "POST", url: "/api/v1/tasks" })).toBe(true);
  });
});
