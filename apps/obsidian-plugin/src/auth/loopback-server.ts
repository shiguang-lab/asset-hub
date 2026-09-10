import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const CALLBACK_PATH = "/callback";

export interface LoopbackCallback {
  code: string;
  state: string;
}

export class OAuthCallbackError extends Error {
  constructor(readonly code: string) {
    super(`authorization failed: ${code}`);
    this.name = "OAuthCallbackError";
  }
}

/**
 * A single-use HTTP server bound to the loopback interface.
 *
 * Two properties matter for safety:
 * - it binds `127.0.0.1`, never `0.0.0.0`, so the callback is not exposed to the
 *   local network;
 * - it serves exactly one request and then shuts down, so a stray request
 *   cannot be replayed into a second code exchange.
 */
export class LoopbackServer {
  private server: Server | null = null;
  private port = 0;

  async start(): Promise<number> {
    const server = createServer();
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      // Port 0 asks the OS for a free ephemeral port. A native client cannot
      // know in advance which port will be free, which is precisely why the
      // authorization server accepts any loopback port.
      server.listen(0, "127.0.0.1", () => resolve());
    });
    this.port = (server.address() as AddressInfo).port;
    return this.port;
  }

  get redirectUri(): string {
    if (!this.port) throw new Error("loopback server has not started");
    return `http://127.0.0.1:${this.port}${CALLBACK_PATH}`;
  }

  /**
   * Resolves with the authorization response. Rejects on an error response, on
   * timeout, or when the server is closed before a callback arrives.
   */
  waitForCallback(expectedState: string, timeoutMs: number): Promise<LoopbackCallback> {
    const server = this.server;
    if (!server) return Promise.reject(new Error("loopback server has not started"));

    return new Promise<LoopbackCallback>((resolve, reject) => {
      const timer = setTimeout(() => {
        finish();
        reject(new Error("授权超时，请在浏览器中完成授权后重试。"));
      }, timeoutMs);

      const finish = () => {
        clearTimeout(timer);
        server.removeListener("request", onRequest);
      };

      const onRequest = (request: IncomingMessage, response: ServerResponse) => {
        const address = `http://127.0.0.1:${this.port}`;
        const url = new URL(request.url ?? "/", address);
        if (url.pathname !== CALLBACK_PATH) {
          respond(response, 404, "未找到该路径。");
          return;
        }
        const params = url.searchParams;
        const error = params.get("error");
        if (error) {
          finish();
          respond(response, 200, failurePage());
          reject(new OAuthCallbackError(error));
          return;
        }
        const code = params.get("code");
        const state = params.get("state");
        // A mismatched state means this callback did not originate from the
        // request we started; drop it without touching the code.
        if (!code || !state || state !== expectedState) {
          finish();
          respond(response, 200, failurePage());
          reject(new Error("回调校验失败（state 不匹配）。"));
          return;
        }
        finish();
        respond(response, 200, successPage());
        resolve({ code, state });
      };

      server.on("request", onRequest);
    });
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.port = 0;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function respond(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

/**
 * The completion page echoes nothing from the request, so a malicious callback
 * cannot inject markup into a page served on a loopback origin.
 */
function successPage(): string {
  return PAGE.replace("{{TITLE}}", "授权成功").replace(
    "{{BODY}}",
    "已获得知序资产中心的访问授权，可以关闭此页面并返回 Obsidian。",
  );
}

function failurePage(): string {
  return PAGE.replace("{{TITLE}}", "授权未完成").replace(
    "{{BODY}}",
    "授权未能完成，请返回 Obsidian 重新发起登录。",
  );
}

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>{{TITLE}}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:#f5f6f8;color:#1f2329">
<main style="background:#fff;border-radius:12px;padding:28px 24px;max-width:420px;box-shadow:0 6px 24px rgba(15,23,42,.08)">
<h1 style="font-size:18px;margin:0 0 8px">{{TITLE}}</h1>
<p style="margin:0;color:#646a73;font-size:14px;line-height:1.6">{{BODY}}</p>
</main>
</body>
</html>`;
