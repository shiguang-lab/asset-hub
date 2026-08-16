import type { ActorContext, Asset, Task } from "@shiguang/contracts";
import type { Store } from "@shiguang/database";
import type { AppContext } from "../types.js";
import { forbidden, notFound } from "./errors.js";

export type AssetAction = "read" | "write" | "delete" | "manage";

export function requireAdmin(actor: ActorContext): void {
  if (actor.isService) return;
  if (actor.workspaceRole !== "owner" && actor.workspaceRole !== "admin") {
    throw forbidden("只有个人空间所有者或组织管理员可以执行此操作");
  }
}

export function requireWorkspaceWrite(actor: ActorContext): void {
  if (actor.isService || actor.tokenScopes.includes("write")) return;
  throw forbidden("当前身份没有工作区写权限");
}

/**
 * A small number of read operations use POST because their query payload is
 * structured or potentially long. They remain available to a viewer and must
 * not be treated as workspace mutations solely from the HTTP verb.
 */
export function requiresWorkspaceWrite(request: { method: string; url: string }): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return false;
  const path = request.url.split("?", 1)[0] ?? request.url;
  return ![
    /^\/api\/v1\/knowledge-bases\/[^/]+\/(search|ask)$/,
    /^\/api\/v1\/datasets\/[^/]+\/query$/,
    /^\/api\/v1\/datasets\/analyze$/,
  ].some((pattern) => pattern.test(path));
}

export async function requireAssetAccess(
  ctx: AppContext,
  actor: ActorContext,
  assetId: string,
  action: AssetAction,
): Promise<Asset> {
  const asset = await ctx.store.getAsset(actor.workspaceId, assetId);
  if (!asset) throw notFound("资产");
  if (actor.isService || actor.workspaceRole === "owner" || actor.workspaceRole === "admin") {
    return asset;
  }

  const acl = await ctx.store.listAcl(asset.id);
  const grant = acl.find(
    (entry) =>
      String(entry.principal_type) === "user" && String(entry.principal_id) === actor.subject,
  );
  const aclRole = grant ? String(grant.role) : null;
  if (action === "read") {
    const memberVisible =
      actor.workspaceType === "team" &&
      ["member_only", "link", "public", "unlisted"].includes(asset.visibility);
    if (
      asset.ownerSubject === actor.subject ||
      memberVisible ||
      aclRole === "editor" ||
      aclRole === "viewer"
    ) {
      return asset;
    }
    throw forbidden("当前用户没有读取该资产的权限");
  }
  if (action === "write") {
    if (asset.ownerSubject === actor.subject || aclRole === "editor") return asset;
    throw forbidden("当前用户没有编辑该资产的权限");
  }
  if (action === "delete") {
    if (asset.ownerSubject === actor.subject) return asset;
    throw forbidden("只有资产所有者或组织管理员可以删除该资产");
  }
  if (asset.ownerSubject === actor.subject) return asset;
  throw forbidden("只有资产所有者或组织管理员可以管理该资产");
}

export async function requireTaskAccess(
  store: Store,
  actor: ActorContext,
  taskId: string,
  action: "read" | "write",
): Promise<Task> {
  const task = await store.getTask(actor.workspaceId, taskId);
  if (!task) throw notFound("任务");
  if (actor.isService || actor.workspaceRole === "owner" || actor.workspaceRole === "admin") {
    return task;
  }
  if (action === "read") return task;
  if (task.ownerSubject === actor.subject) return task;
  throw forbidden("只有任务创建者或组织管理员可以操作该任务");
}

/**
 * Covers resource routes whose identifier is part of the URL. Body-only
 * resources (create publish, batch asset actions) still call the same helpers
 * in their route handlers after parsing the body.
 */
export async function enforceRequestAuthorization(
  ctx: AppContext,
  request: { method: string; url: string; actor: ActorContext },
): Promise<void> {
  if (!request.url.startsWith("/api/v1/")) return;
  const method = request.method.toUpperCase();
  const path = request.url.split("?", 1)[0] ?? request.url;
  if (
    path.startsWith("/api/v1/integrations/") ||
    path.startsWith("/api/v1/task-schedules") ||
    path === "/api/v1/audit"
  ) {
    requireAdmin(request.actor);
  }

  const assetMatch = path.match(/^\/api\/v1\/assets\/([a-z0-9]+_[a-z0-9]+)/i);
  if (assetMatch) {
    const assetId = assetMatch[1];
    if (!assetId) return;
    const action: AssetAction =
      path.includes("/acl") || path.includes("/share")
        ? "manage"
        : method === "GET"
          ? "read"
          : method === "DELETE" || path.includes("/permanent") || path.includes("/restore")
            ? "delete"
            : "write";
    await requireAssetAccess(ctx, request.actor, assetId, action);
    return;
  }

  const presentationMatch = path.match(/^\/api\/v1\/presentations\/([a-z0-9]+_[a-z0-9]+)/i);
  if (presentationMatch) {
    const assetId = presentationMatch[1];
    if (!assetId) return;
    await requireAssetAccess(ctx, request.actor, assetId, method === "GET" ? "read" : "write");
    return;
  }

  const taskMatch = path.match(/^\/api\/v1\/tasks\/([a-z0-9]+_[a-z0-9]+)/i);
  if (taskMatch) {
    const taskId = taskMatch[1];
    if (!taskId) return;
    await requireTaskAccess(ctx.store, request.actor, taskId, method === "GET" ? "read" : "write");
    return;
  }

  const publishMatch = path.match(/^\/api\/v1\/publishes\/([a-z0-9]+_[a-z0-9]+)/i);
  if (publishMatch) {
    const publishId = publishMatch[1];
    if (!publishId) return;
    const publish = await ctx.store.getPublish(request.actor.workspaceId, publishId);
    if (!publish) throw notFound("发布");
    await requireAssetAccess(
      ctx,
      request.actor,
      publish.assetId,
      method === "GET" ? "read" : "manage",
    );
  }
}
