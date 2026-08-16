import { createHash, randomBytes } from "node:crypto";
import { apiTokenCreateSchema, mcpConfigUpdateSchema, nextId, nowIso } from "@shiguang/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";
import { estimateCredits } from "./tasks.js";

export function registerIntegrations(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  /* ---------------- API tokens ---------------- */

  app.post("/api/v1/integrations/tokens", async (req) => {
    const body = apiTokenCreateSchema.parse(req.body);
    const secret = `sg_${randomBytes(24).toString("base64url")}`;
    const secretHash = createHash("sha256").update(secret).digest("hex");
    const token = await ctx.store.createApiToken(
          req.actor.workspaceId,
          {
            name: body.name,
            scopes: body.scopes,
            expiresAt: body.expiresAt ?? null,
          },
          secretHash,
        );
    await ctx.store.audit(req.actor.workspaceId, req.actor.subject, "token.create", token.id, "success", {
            scopes: body.scopes,
          });
    return { token, secret };
  });

  app.get("/api/v1/integrations/tokens", async (req) => {
    const tokens = await ctx.store.listApiTokens(req.actor.workspaceId);
    return tokens.map(({ secretHash: _secretHash, ...rest }) => rest);
  });

  app.delete("/api/v1/integrations/tokens/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const token = await ctx.store.getApiToken(req.actor.workspaceId, id);
    if (!token) throw notFound("Token");
    await ctx.store.revokeApiToken(req.actor.workspaceId, id);
    await ctx.store.audit(req.actor.workspaceId, req.actor.subject, "token.revoke", id, "success", {});
    return reply.code(204).send();
  });

  /* ---------------- MCP ---------------- */

  app.get("/api/v1/integrations/mcp", async (req) => {
    const config = await ctx.store.getMcpConfig(req.actor.workspaceId);
    return { config, serverUrl: config?.serverUrl ?? `${ctx.config.publicApiBase}/mcp` };
  });

  app.patch("/api/v1/integrations/mcp", async (req) => {
    const body = mcpConfigUpdateSchema.parse(req.body);
    const config = await ctx.store.updateMcpConfig(req.actor.workspaceId, body);
    await ctx.store.audit(req.actor.workspaceId, req.actor.subject, "mcp.update", config.id, "success", {
            enabled: body.enabled,
            scope: body.scope,
            writeEnabled: body.writeEnabled,
          });
    return config;
  });

  app.post("/api/v1/integrations/mcp/revoke", async (req) => {
    const config = await ctx.store.updateMcpConfig(req.actor.workspaceId, { enabled: false });
    await ctx.store.audit(
            req.actor.workspaceId,
            req.actor.subject,
            "mcp.revoke",
            config.id,
            "success",
            {},
          );
    return config;
  });

  app.get("/api/v1/integrations/mcp/connection-guide", async (req) => {
    const config = await ctx.store.getMcpConfig(req.actor.workspaceId);
    if (!config?.enabled) {
      throw badRequest("MCP_DISABLED", "请先在设置中启用 MCP", {});
    }
    const url = `${ctx.config.publicApiBase}/mcp`;
    return {
      url,
      scope: config.scope,
      writeEnabled: config.writeEnabled,
      claude: {
        name: "Shiguang Lab",
        command: "npx",
        args: ["-y", "@shiguang/mcp", "--url", url, "--token", "YOUR_API_TOKEN"],
        env: { SHIGUANG_API_URL: url },
      },
      cursor: {
        mcpServers: {
          shiguang: {
            url,
            headers: { Authorization: "Bearer YOUR_API_TOKEN" },
          },
        },
      },
      chatgpt: {
        type: "streamable_http",
        url,
        authorization: { type: "bearer", value: "YOUR_API_TOKEN" },
        scope: config.scope,
      },
      rawUrl: url,
    };
  });

  app.get("/api/v1/integrations/status", async (req) => {
    const tokens = await ctx.store.listApiTokens(req.actor.workspaceId);
    const mcp = await ctx.store.getMcpConfig(req.actor.workspaceId);
    return {
      mcpEnabled: mcp?.enabled ?? false,
      mcpScope: mcp?.scope ?? "all",
      mcpWriteEnabled: mcp?.writeEnabled ?? false,
      tokenCount: tokens.length,
    };
  });

  /* ---------------- Git 集成 ---------------- */

  app.post("/api/v1/integrations/git", async (req) => {
    const body = z
      .object({
        name: z.string().min(1),
        provider: z.enum(["github", "gitlab", "local"]).default("github"),
        repoUrl: z.string().min(1),
        branch: z.string().default("main"),
        syncPath: z.string().default("/"),
        localDir: z.string().optional(),
      })
      .parse(req.body);
    const connection = await ctx.store.createGitConnection(req.actor.workspaceId, body);
    await ctx.store.audit(
            req.actor.workspaceId,
            req.actor.subject,
            "git.connect",
            String(connection.id),
            "success",
            {
              provider: body.provider,
            },
          );
    return connection;
  });

  app.get("/api/v1/integrations/git", async (req) =>
    await ctx.store.listGitConnections(req.actor.workspaceId),
  );

  app.delete("/api/v1/integrations/git/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const connection = await ctx.store.getGitConnection(req.actor.workspaceId, id);
    if (!connection) throw notFound("Git 连接");
    await ctx.store.deleteGitConnection(req.actor.workspaceId, id);
    return reply.code(204).send();
  });

  app.post("/api/v1/integrations/git/:id/sync", async (req) => {
    const { id } = req.params as { id: string };
    const connection = await ctx.store.getGitConnection(req.actor.workspaceId, id);
    if (!connection) throw notFound("Git 连接");
    await ctx.store.updateGitConnection(req.actor.workspaceId, id, {
            status: "syncing",
            lastError: null,
          });
    const task = await ctx.store.createTask(req.actor, {
          type: "git_sync",
          goal: `同步 Git 仓库：${String(connection.name)}`,
          spec: { connectionId: id },
        });
    await ctx.store.reserveCredits(req.actor.workspaceId, task.id, 100, `op_reserve_${task.id}`);
    await ctx.bus.emit({
            eventId: nextId("evt"),
            eventType: "task.created",
            schemaVersion: 1,
            occurredAt: nowIso(),
            producer: "api",
            tenantId: req.actor.workspaceId,
            aggregate: { type: "task", id: task.id, version: 1 },
            trace: {},
            data: { taskId: task.id, taskType: "git_sync", spec: { connectionId: id } },
          });
    await ctx.store.audit(req.actor.workspaceId, req.actor.subject, "git.sync", id, "success", {});
    return { task, estimate: estimateCredits({ depth: "quick", outputs: [] }) };
  });

  /* ---------------- 自定义域名 ---------------- */

  app.post("/api/v1/integrations/domains", async (req) => {
    const body = z
      .object({ domain: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i, "域名格式不正确") })
      .parse(req.body);
    const domain = await ctx.store.createCustomDomain(req.actor.workspaceId, body.domain);
    await ctx.store.audit(
            req.actor.workspaceId,
            req.actor.subject,
            "domain.add",
            String(domain.id),
            "success",
            {},
          );
    return domain;
  });

  app.get("/api/v1/integrations/domains", async (req) =>
    await ctx.store.listCustomDomains(req.actor.workspaceId),
  );

  app.post("/api/v1/integrations/domains/:id/verify", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ token: z.string() }).parse(req.body);
    const domain = await ctx.store.getCustomDomain(req.actor.workspaceId, id);
    if (!domain) throw notFound("域名");
    const ok = await ctx.store.verifyCustomDomain(req.actor.workspaceId, id, body.token);
    if (!ok) throw badRequest("VERIFICATION_FAILED", "验证 Token 不匹配，请检查 DNS TXT 记录", {});
    await ctx.store.audit(req.actor.workspaceId, req.actor.subject, "domain.verify", id, "success", {});
    return { ok: true, domain: await ctx.store.getCustomDomain(req.actor.workspaceId, id) };
  });

  app.post("/api/v1/integrations/domains/:id/bind", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ publishId: z.string().nullable().optional() }).parse(req.body);
    const domain = await ctx.store.getCustomDomain(req.actor.workspaceId, id);
    if (!domain) throw notFound("域名");
    if (String(domain.status) !== "verified")
      throw badRequest("DOMAIN_NOT_VERIFIED", "请先完成 DNS 验证", {});
    await ctx.store.bindDomainPublish(req.actor.workspaceId, id, body.publishId ?? null);
    return await ctx.store.getCustomDomain(req.actor.workspaceId, id);
  });

  app.delete("/api/v1/integrations/domains/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const domain = await ctx.store.getCustomDomain(req.actor.workspaceId, id);
    if (!domain) throw notFound("域名");
    await ctx.store.deleteCustomDomain(req.actor.workspaceId, id);
    return reply.code(204).send();
  });
}
