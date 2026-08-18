import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { agenticComplete } from "./index.js";
import { connectMcpServer } from "./mcp.js";

let server: Server | null = null;

function startMcpServer(): Promise<string> {
  return new Promise((resolve) => {
    const receivedSessionIds: string[] = [];
    const s = createServer((req, res) => {
      const sessionId = req.headers["mcp-session-id"];
      if (sessionId) receivedSessionIds.push(String(sessionId));
      let body = "";
      req.on("data", (chunk) => {
        body += String(chunk);
      });
      req.on("end", () => {
        const payload = JSON.parse(body || "{}") as {
          id?: number | null;
          method: string;
          params?: { name?: string; arguments?: Record<string, unknown> };
        };
        res.setHeader("content-type", "application/json");
        res.setHeader("mcp-session-id", "test-session");
        if (payload.method === "initialize") {
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "test", version: "1.0.0" },
              },
            }),
          );
          return;
        }
        if (payload.method === "tools/list") {
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id,
              result: {
                tools: [
                  {
                    name: "echo",
                    description: "echo the input",
                    inputSchema: {
                      type: "object",
                      properties: { text: { type: "string" } },
                    },
                  },
                ],
              },
            }),
          );
          return;
        }
        if (payload.method === "tools/call") {
          const text = String(payload.params?.arguments?.text ?? "");
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: payload.id,
              result: { content: [{ type: "text", text: `echo: ${text}` }], isError: false },
            }),
          );
          return;
        }
        res.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result: {} }));
      });
    });
    s.listen(0, "127.0.0.1", () => {
      server = s;
      const address = s.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}/mcp`);
    });
  });
}

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server?.close(resolve));
    server = null;
  }
});

describe("connectMcpServer", () => {
  it("performs initialize, lists tools and calls a tool", async () => {
    const url = await startMcpServer();
    const client = await connectMcpServer("srv", url);

    const tools = await client.listTools();
    expect(tools).toEqual([
      {
        name: "echo",
        description: "echo the input",
        inputSchema: { type: "object", properties: { text: { type: "string" } } },
      },
    ]);

    const result = await client.callTool("echo", { text: "hello" });
    expect(result).toEqual({ content: "echo: hello", isError: false });
  });
});

describe("agenticComplete", () => {
  it("executes tool calls and returns the final text", async () => {
    let turn = 0;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await agenticComplete({
      complete: async () => {
        turn += 1;
        if (turn === 1) {
          return {
            text: "",
            usage: { inputTokens: 0, outputTokens: 0 },
            provider: "test",
            toolCalls: [{ id: "call_1", name: "echo", arguments: '{"text":"hi"}' }],
          };
        }
        return {
          text: "done",
          usage: { inputTokens: 0, outputTokens: 0 },
          provider: "test",
        };
      },
      messages: [{ role: "user", content: "go" }],
      tools: [
        {
          type: "function",
          function: { name: "echo", parameters: { type: "object", properties: {} } },
        },
      ],
      execute: async (name, args) => {
        calls.push({ name, args });
        return { content: `ok:${String(args.text)}`, isError: false };
      },
    });

    expect(result.rounds).toBe(2);
    expect(result.text).toBe("done");
    expect(calls).toEqual([{ name: "echo", args: { text: "hi" } }]);
  });
});
