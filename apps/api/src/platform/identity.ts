import { createHash, timingSafeEqual } from "node:crypto";
import { type ActorContext, nextId } from "@shiguang/contracts";
import type { Store } from "@shiguang/database";
import { z } from "zod";
import { forbidden, unauthorized } from "./errors.js";

const assertionSchema = z.object({
  sub: z.string().min(1),
  workspace_id: z.string().optional(),
  exp: z.number().optional(),
});

export interface IdentityOptions {
  devAuth: boolean;
  demoSubject: string;
  verifyAssertion?: (token: string) => Promise<{ sub: string; workspaceId?: string }>;
}

export class IdentityService {
  constructor(
    private readonly store: Store,
    private readonly options: IdentityOptions,
  ) {}

  private demoWorkspaceId(subject: string): string {
    const workspace = this.store.getWorkspaceBySubject(subject);
    if (workspace) return workspace.id;
    const now = new Date().toISOString();
    const id = `wsp_${createHash("sha256").update(subject).digest("hex").slice(0, 24)}`;
    this.store
      .getDb()
      .prepare(
        "INSERT OR IGNORE INTO workspaces (id, type, owner_subject, name, created_at) VALUES (?, 'personal', ?, ?, ?)",
      )
      .run(id, subject, "个人空间", now);
    return id;
  }

  async resolve(headers: Record<string, string | string[] | undefined>): Promise<ActorContext> {
    const requestId = takeHeader(headers, "x-request-id") ?? nextId("req").replace("req_", "req_");
    const bearer = takeHeader(headers, "authorization");
    if (bearer?.startsWith("Bearer ")) {
      const token = bearer.slice("Bearer ".length).trim();
      if (!token) throw unauthorized();
      return this.resolveToken(token, requestId);
    }
    const identity = takeHeader(headers, "x-sg-identity");
    if (identity) {
      return this.resolveAssertion(identity, requestId);
    }
    if (this.options.devAuth) {
      return {
        subject: this.options.demoSubject,
        workspaceId: this.demoWorkspaceId(this.options.demoSubject),
        requestId,
        isService: false,
        tokenScopes: ["read", "write"],
      };
    }
    throw unauthorized();
  }

  private async resolveAssertion(identity: string, requestId: string): Promise<ActorContext> {
    try {
      const parsed = assertionSchema.parse(JSON.parse(identity));
      const exp = parsed.exp ?? Number.MAX_SAFE_INTEGER;
      if (Date.now() / 1000 > exp) throw unauthorized("身份断言已过期");
      let workspaceId = parsed.workspace_id;
      if (!workspaceId) {
        workspaceId = this.demoWorkspaceId(parsed.sub);
      }
      this.store.ensureUser({ subject: parsed.sub, workspaceId });
      return {
        subject: parsed.sub,
        workspaceId,
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

  private resolveToken(token: string, requestId: string): ActorContext {
    const hash = createHash("sha256").update(token).digest("hex");
    const apiToken = this.store.findApiTokenByHash(hash);
    if (!apiToken) throw unauthorized("API Token 无效或已撤销");
    if (apiToken.expiresAt && new Date(apiToken.expiresAt).getTime() < Date.now()) {
      throw unauthorized("API Token 已过期");
    }
    this.store.touchApiToken(apiToken.id);
    return {
      subject: "api-token",
      workspaceId: apiToken.workspaceId,
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
