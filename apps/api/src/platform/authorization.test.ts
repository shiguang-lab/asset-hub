import type { ActorContext, Asset } from "@shiguang/contracts";
import type { Store } from "@shiguang/database";
import { describe, expect, it } from "vitest";
import type { AppContext } from "../types.js";
import { requireAssetAccess, requiresWorkspaceWrite } from "./authorization.js";

function makeAsset(ownerSubject: string, visibility: Asset["visibility"] = "private"): Asset {
  return {
    id: "ast_1",
    workspaceId: "ws_1",
    ownerSubject,
    type: "document",
    title: "测试文档",
    path: "",
    description: "",
    visibility,
    status: "normal",
    sourceType: "manual",
    currentVersionId: "ver_1",
    lockVersion: 1,
    deletedAt: null,
    publishedUrl: null,
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
  };
}

function makeCtx(asset: Asset | null, acl: Array<Record<string, unknown>> = []): AppContext {
  return {
    store: {
      getAsset: async () => asset,
      listAcl: async () => acl,
    } as unknown as Store,
  } as AppContext;
}

describe("authorization", () => {
  it("允许通过个人 API Token 的 tokenOwnerSubject 访问私有资产", async () => {
    const actor: ActorContext = {
      subject: "tok_personal_1",
      tokenOwnerSubject: "user_owner",
      workspaceId: "ws_1",
      workspaceType: "team",
      workspaceRole: "editor",
      requestId: "req_1",
      isService: false,
      tokenScopes: ["read", "write"],
    };
    const ctx = makeCtx(makeAsset("user_owner", "private"));
    await expect(requireAssetAccess(ctx, actor, "ast_1", "write")).resolves.toMatchObject({
      id: "ast_1",
    });
  });

  it("拒绝未授权成员读取其他用户的私有资产", async () => {
    const actor: ActorContext = {
      subject: "user_other",
      workspaceId: "ws_1",
      workspaceType: "team",
      workspaceRole: "editor",
      requestId: "req_2",
      isService: false,
      tokenScopes: ["read", "write"],
    };
    const ctx = makeCtx(makeAsset("user_owner", "private"));
    await expect(requireAssetAccess(ctx, actor, "ast_1", "read")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("只读 POST 查询端点不需要写权限 scope", () => {
    expect(
      requiresWorkspaceWrite({ method: "POST", url: "/api/v1/knowledge-bases/kb_1/ask" }),
    ).toBe(false);
    expect(requiresWorkspaceWrite({ method: "POST", url: "/api/v1/datasets/ds_1/query" })).toBe(
      false,
    );
    expect(requiresWorkspaceWrite({ method: "POST", url: "/api/v1/datasets/ds_1/charts" })).toBe(
      true,
    );
  });
});
