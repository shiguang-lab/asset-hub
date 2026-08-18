/**
 * 极简 MCP streamable-HTTP 客户端：让 Agent 真正连接配置的 MCP server，
 * 完成 initialize 握手后 listTools / callTool。无第三方依赖，仅 JSON-RPC 2.0 + fetch。
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: string;
  isError: boolean;
}

export interface McpClient {
  serverId: string;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
}

interface McpServerEntry {
  id: string;
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function connectMcpServer(
  serverId: string,
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<McpClient> {
  const base = url.trim();
  const timeoutMs = options.timeoutMs ?? 12_000;
  const staticHeaders = options.headers ?? {};
  let sessionId: string | undefined;
  let nextId = 1;

  async function rpc<T>(
    method: string,
    params?: unknown,
    includeId = true,
  ): Promise<{ result?: T; error?: { code: number; message: string } }> {
    const payload: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (includeId) payload.id = nextId++;
    if (params !== undefined) payload.params = params;

    const res = await fetch(base, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...staticHeaders,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const sessionHeader = res.headers.get("mcp-session-id");
    if (sessionHeader) sessionId = sessionHeader;

    const body = parseMcpPayload(await res.text());
    if (!res.ok) {
      const message = body.error?.message ?? `MCP ${method} HTTP ${res.status}`;
      throw new Error(message);
    }
    return body as { result?: T; error?: { code: number; message: string } };
  }

  const init = await rpc<{ protocolVersion?: string }>("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "asset-hub", version: "1.0.0" },
  });
  if (init.error) throw new Error(`MCP initialize: ${init.error.message}`);
  // 通知服务器握手完成（notification，无 id、无响应）。
  await rpc("notifications/initialized", undefined, false).catch(() => undefined);

  return {
    serverId,
    async listTools(): Promise<McpTool[]> {
      const res = await rpc<{ tools?: McpTool[] }>("tools/list");
      if (res.error) throw new Error(`MCP tools/list: ${res.error.message}`);
      return res.result?.tools ?? [];
    },
    async callTool(name, args): Promise<McpToolResult> {
      const res = await rpc<{
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      }>("tools/call", { name, arguments: args });
      if (res.error) {
        return { content: `MCP tools/call: ${res.error.message}`, isError: true };
      }
      const text = (res.result?.content ?? [])
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text ?? "")
        .join("\n");
      return { content: text, isError: res.result?.isError === true };
    },
  };
}

/** 连接一组 MCP server，扁平化所有工具名（`<serverId>__<toolName>` 避免冲突）。 */
export async function connectMcpServers(
  servers: McpServerEntry[],
): Promise<Array<McpClient & { tools: McpTool[] }>> {
  const clients: Array<McpClient & { tools: McpTool[] }> = [];
  for (const server of servers) {
    try {
      const client = await connectMcpServer(server.id, server.url, {
        headers: server.headers,
        timeoutMs: server.timeoutMs,
      });
      const tools = await client.listTools();
      clients.push({ ...client, tools });
    } catch {
      // 单个 server 不可用不阻断整体任务。
    }
  }
  return clients;
}

function parseMcpPayload(text: string): {
  result?: unknown;
  error?: { code: number; message: string };
} {
  const trimmed = text.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as { result?: unknown; error?: { code: number; message: string } };
  } catch {
    // 兼容 SSE：逐行取 `data: {...}`。
    for (const line of trimmed.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        return JSON.parse(payload) as {
          result?: unknown;
          error?: { code: number; message: string };
        };
      } catch {
        // ignore malformed data line
      }
    }
    return {};
  }
}
