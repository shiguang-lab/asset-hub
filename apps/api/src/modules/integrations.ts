import { createHash, randomBytes } from "node:crypto";
import { apiTokenCreateSchema, mcpConfigUpdateSchema } from "@shiguang/contracts";
import type { FastifyInstance } from "fastify";
import { badRequest, notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";

export function registerIntegrations(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  /* ---------------- API tokens ---------------- */

  app.post("/api/v1/integrations/tokens", async (req) => {
    const body = apiTokenCreateSchema.parse(req.body);
    const secret = `sg_${randomBytes(24).toString("base64url")}`;
    const secretHash = createHash("sha256").update(secret).digest("hex");
    const token = ctx.store.createApiToken(
      req.actor.workspaceId,
      {
        name: body.name,
        scopes: body.scopes,
        expiresAt: body.expiresAt ?? null,
      },
      secretHash,
    );
    ctx.store.audit(req.actor.workspaceId, req.actor.subject, "token.create", token.id, "success", {
      scopes: body.scopes,
    });
    return { token, secret };
  });

  app.get("/api/v1/integrations/tokens", async (req) => {
    const tokens = ctx.store.listApiTokens(req.actor.workspaceId);
    return tokens.map(({ secretHash: _secretHash, ...rest }) => rest);
  });

  app.delete("/api/v1/integrations/tokens/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const token = ctx.store.getApiToken(req.actor.workspaceId, id);
    if (!token) throw notFound("Token");
    ctx.store.revokeApiToken(req.actor.workspaceId, id);
    ctx.store.audit(req.actor.workspaceId, req.actor.subject, "token.revoke", id, "success", {});
    return reply.code(204).send();
  });

  /* ---------------- MCP ---------------- */

  app.get("/api/v1/integrations/mcp", async (req) => {
    const config = ctx.store.getMcpConfig(req.actor.workspaceId);
    return { config, serverUrl: config?.serverUrl ?? `${ctx.config.publicApiBase}/mcp` };
  });

  app.patch("/api/v1/integrations/mcp", async (req) => {
    const body = mcpConfigUpdateSchema.parse(req.body);
    const config = ctx.store.updateMcpConfig(req.actor.workspaceId, body);
    ctx.store.audit(req.actor.workspaceId, req.actor.subject, "mcp.update", config.id, "success", {
      enabled: body.enabled,
      scope: body.scope,
      writeEnabled: body.writeEnabled,
    });
    return config;
  });

  app.post("/api/v1/integrations/mcp/revoke", async (req) => {
    const config = ctx.store.updateMcpConfig(req.actor.workspaceId, { enabled: false });
    ctx.store.audit(
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
    const config = ctx.store.getMcpConfig(req.actor.workspaceId);
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
    const tokens = ctx.store.listApiTokens(req.actor.workspaceId);
    const mcp = ctx.store.getMcpConfig(req.actor.workspaceId);
    return {
      mcpEnabled: mcp?.enabled ?? false,
      mcpScope: mcp?.scope ?? "all",
      mcpWriteEnabled: mcp?.writeEnabled ?? false,
      tokenCount: tokens.length,
    };
  });
}
