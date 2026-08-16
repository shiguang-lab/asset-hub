import { createHash, timingSafeEqual } from "node:crypto";
import { type ActorContext, nextId } from "@shiguang/contracts";
import type { Store } from "@shiguang/database";
import { z } from "zod";
import { forbidden, unauthorized } from "./errors.js";

const assertionSchema = z.object({
  sub: z.string().min(1),
  workspace_id: z.string().optional(),
  org_id: z.string().optional(),
  roles: z.array(z.string()).optional(),
  exp: z.number().optional(),
});

type VerifiedIdentity = {
  sub: string;
  displayName?: string;
  organizationId?: string;
  roles: string[];
};

export interface IdentityOptions {
  devAuth: boolean;
  demoSubject: string;
  verifyAssertion?: (token: string) => Promise<VerifiedIdentity | null>;
}

export class IdentityService {
  constructor(
    private readonly store: Store,
    private readonly options: IdentityOptions,
  ) {}

  async resolve(headers: Record<string, string | string[] | undefined>): Promise<ActorContext> {
    const requestId = takeHeader(headers, "x-request-id") ?? nextId("req").replace("req_", "req_");
    const bearer = takeHeader(headers, "authorization");
    if (bearer?.startsWith("Bearer ")) {
      const token = bearer.slice("Bearer ".length).trim();
      if (!token) throw unauthorized();
      return await this.resolveToken(token, requestId);
    }
    const identity = takeHeader(headers, "x-sg-identity");
    if (identity) {
      return this.resolveAssertion(identity, requestId);
    }
    if (this.options.devAuth) {
      const workspace = await this.store.ensurePersonalWorkspace(this.options.demoSubject);
      await this.store.ensureUser({ subject: this.options.demoSubject, workspaceId: workspace.id });
      return {
        subject: this.options.demoSubject,
        workspaceId: workspace.id,
        workspaceType: "personal",
        workspaceRole: "owner",
        requestId,
        isService: false,
        tokenScopes: ["read", "write"],
      };
    }
    throw unauthorized();
  }

  private async resolveAssertion(identity: string, requestId: string): Promise<ActorContext> {
    if (this.options.verifyAssertion) {
      const verified = await this.options.verifyAssertion(identity);
      if (verified) {
        return await this.resolveVerifiedIdentity(verified, requestId);
      }
      if (!this.options.devAuth) throw unauthorized("身份断言签名无效");
    }

    try {
      const parsed = assertionSchema.parse(JSON.parse(identity));
      const exp = parsed.exp ?? Number.MAX_SAFE_INTEGER;
      if (Date.now() / 1000 > exp) throw unauthorized("身份断言已过期");
      if (parsed.org_id) {
        return await this.resolveVerifiedIdentity(
          { sub: parsed.sub, organizationId: parsed.org_id, roles: parsed.roles ?? [] },
          requestId,
        );
      }
      const personal = await this.store.ensurePersonalWorkspace(parsed.sub);
      await this.store.ensureUser({ subject: parsed.sub, workspaceId: personal.id });
      if (parsed.workspace_id && parsed.workspace_id !== personal.id) {
        const role = await this.store.getWorkspaceRole(parsed.workspace_id, parsed.sub);
        if (!role) throw forbidden("当前用户不属于该空间");
        const workspace = await this.store.getWorkspace(parsed.workspace_id);
        if (!workspace) throw forbidden("空间不存在");
        return this.actor(parsed.sub, workspace.id, workspace.type, role, requestId);
      }
      return {
        subject: parsed.sub,
        workspaceId: personal.id,
        workspaceType: "personal",
        workspaceRole: "owner",
        requestId,
        isService: false,
        tokenScopes: ["read", "write"],
      };
    } catch (err) {
      if (err instanceof Error && err.name === "ZodError") {
        throw unauthorized("身份断言格式错误");
      }
      throw err;
    }
  }

  private async resolveToken(token: string, requestId: string): Promise<ActorContext> {
    const hash = createHash("sha256").update(token).digest("hex");
    const apiToken = await this.store.findApiTokenByHash(hash);
    if (!apiToken) throw unauthorized("API Token 无效或已撤销");
    if (apiToken.expiresAt && new Date(apiToken.expiresAt).getTime() < Date.now()) {
      throw unauthorized("API Token 已过期");
    }
    await this.store.touchApiToken(apiToken.id);
    const workspace = await this.store.getWorkspace(apiToken.workspaceId);
    if (!workspace) throw unauthorized("API Token 所属空间不存在");
    return {
      // A token is a distinct service principal. Sharing one synthetic subject
      // would make assets and tasks created by different tokens appear to have
      // the same owner.
      subject: `api-token:${apiToken.id}`,
      workspaceId: apiToken.workspaceId,
      workspaceType: workspace.type,
      workspaceRole: apiToken.scopes.includes("write") ? "editor" : "viewer",
      requestId,
      isService: false,
      tokenScopes: apiToken.scopes,
    };
  }

  requireWrite(actor: ActorContext): void {
    if (!actor.tokenScopes.includes("write")) {
      throw forbidden("当前 Token 为只读权限，无法执行写操作");
    }
  }

  requireAdmin(actor: ActorContext): void {
    if (actor.workspaceRole !== "owner" && actor.workspaceRole !== "admin") {
      throw forbidden("只有空间管理员可以执行此操作");
    }
  }

  private async resolveVerifiedIdentity(
    identity: VerifiedIdentity,
    requestId: string,
  ): Promise<ActorContext> {
    const personal = await this.store.ensurePersonalWorkspace(identity.sub);
    await this.store.ensureUser({
      subject: identity.sub,
      workspaceId: personal.id,
      ...(identity.displayName ? { displayName: identity.displayName } : {}),
    });
    if (!identity.organizationId) {
      return this.actor(identity.sub, personal.id, "personal", "owner", requestId);
    }
    const role = roleFromOrganizationRoles(identity.roles);
    if (!role) throw forbidden("当前用户没有有效的 Group 成员角色");
    const workspace = await this.store.ensureTeamWorkspace({
      externalId: identity.organizationId,
      subject: identity.sub,
      role,
    });
    return this.actor(identity.sub, workspace.id, "team", role, requestId);
  }

  private actor(
    subject: string,
    workspaceId: string,
    workspaceType: "personal" | "team",
    workspaceRole: "owner" | "admin" | "editor" | "viewer",
    requestId: string,
  ): ActorContext {
    return {
      subject,
      workspaceId,
      workspaceType,
      workspaceRole,
      requestId,
      isService: false,
      tokenScopes: workspaceRole === "viewer" ? ["read"] : ["read", "write"],
    };
  }
}

export function roleFromOrganizationRoles(roles: string[]): "admin" | "editor" | "viewer" | null {
  if (roles.includes("org:admin")) return "admin";
  if (roles.includes("org:member")) return "editor";
  if (roles.includes("org:viewer")) return "viewer";
  return null;
}

export function verifyHmac(payload: string, signature: string, secret: string): boolean {
  const expected = createHash("sha256").update(`${payload}.${secret}`).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signHmac(payload: string, secret: string): string {
  return createHash("sha256").update(`${payload}.${secret}`).digest("base64url");
}

function takeHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}
