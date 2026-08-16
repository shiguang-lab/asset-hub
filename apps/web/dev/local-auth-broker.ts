import type { IncomingMessage, ServerResponse } from "node:http";

const REFRESH_SKEW_MS = 15_000;
const PRODUCT_ID = "asset-hub";

export interface LocalBrokerSession {
  authenticated: true;
  subject: string;
  displayName?: string;
  email?: string;
  preferredUsername?: string;
  organization?: { id: string; name: string } | null;
  roles?: string[];
  platformRoles?: string[];
  entitlements?: string[];
  localBroker: true;
}

interface BrokerResponse {
  brokerToken: string;
  brokerExpiresAt: string;
  identityToken: string;
  identityExpiresAt: string;
  session: Omit<LocalBrokerSession, "localBroker">;
}

export interface LocalAuthBrokerOptions {
  authTarget: string;
  loginName: string;
  password: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class LocalAuthBroker {
  private brokerToken: string | null = null;
  private brokerExpiresAt = 0;
  private identityToken: string | null = null;
  private identityExpiresAt = 0;
  private sessionValue: LocalBrokerSession | null = null;
  private pending: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly authTarget: string;

  constructor(private readonly options: LocalAuthBrokerOptions) {
    this.authTarget = options.authTarget.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async identity(): Promise<string> {
    if (this.identityToken && this.identityExpiresAt - this.now() > REFRESH_SKEW_MS) {
      return this.identityToken;
    }
    if (!this.pending) {
      this.pending = this.refreshOrLogin().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  async session(): Promise<LocalBrokerSession> {
    await this.identity();
    if (!this.sessionValue) throw new Error("Local auth broker did not return a session");
    return this.sessionValue;
  }

  invalidateIdentity(): void {
    this.identityToken = null;
    this.identityExpiresAt = 0;
  }

  private async refreshOrLogin(): Promise<string> {
    if (this.brokerToken && this.brokerExpiresAt > this.now()) {
      const response = await this.fetchBroker("/api/auth/local-broker/refresh", {
        headers: { Authorization: `Bearer ${this.brokerToken}` },
      });
      if (response.status !== 401) return this.consume(response);
      this.clear();
    }
    return this.consume(
      await this.fetchBroker("/api/auth/local-broker", {
        body: JSON.stringify({
          loginName: this.options.loginName,
          password: this.options.password,
          productId: PRODUCT_ID,
        }),
      }),
    );
  }

  private async fetchBroker(
    path: string,
    init: { body?: string; headers?: Record<string, string> },
  ) {
    return this.fetchImpl(`${this.authTarget}${path}`, {
      method: "POST",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: this.authTarget,
        ...(init.headers ?? {}),
      },
      body: init.body,
    });
  }

  private async consume(response: Response): Promise<string> {
    if (!response.ok) {
      let code = "broker_unavailable";
      try {
        const body = (await response.json()) as { error?: string };
        code = body.error ?? code;
      } catch {
        // The status and stable error code are enough; never include upstream bodies.
      }
      throw new Error(`Local auth broker failed (${response.status}: ${code})`);
    }
    const body = (await response.json()) as BrokerResponse;
    if (
      !body.brokerToken ||
      !body.identityToken ||
      !body.session?.subject ||
      !Number.isFinite(Date.parse(body.brokerExpiresAt)) ||
      !Number.isFinite(Date.parse(body.identityExpiresAt))
    ) {
      throw new Error("Local auth broker returned an invalid response");
    }
    this.brokerToken = body.brokerToken;
    this.brokerExpiresAt = Date.parse(body.brokerExpiresAt);
    this.identityToken = body.identityToken;
    this.identityExpiresAt = Date.parse(body.identityExpiresAt);
    this.sessionValue = { ...body.session, authenticated: true, localBroker: true };
    return body.identityToken;
  }

  private clear(): void {
    this.brokerToken = null;
    this.brokerExpiresAt = 0;
    this.identityToken = null;
    this.identityExpiresAt = 0;
    this.sessionValue = null;
  }
}

export type Next = (error?: unknown) => void;

export function createLocalAuthMiddleware(broker: LocalAuthBroker) {
  return async (request: IncomingMessage, response: ServerResponse, next: Next): Promise<void> => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/login" || pathname === "/register" || pathname.startsWith("/auth/")) {
      response.statusCode = 302;
      response.setHeader("Location", "/");
      response.end();
      return;
    }
    if (pathname === "/api/auth/session") {
      if (request.method !== "GET") {
        writeJSON(response, 405, { error: "method_not_allowed" });
        return;
      }
      try {
        writeJSON(response, 200, await broker.session());
      } catch {
        writeJSON(response, 503, { authenticated: false, error: "local_broker_unavailable" });
      }
      return;
    }
    if (pathname === "/api/auth/logout") {
      writeJSON(response, 409, { error: "local_broker_managed_by_environment" });
      return;
    }
    if (
      !pathname.startsWith("/api/v1/") &&
      pathname !== "/api/v1" &&
      !pathname.startsWith("/mcp")
    ) {
      next();
      return;
    }
    try {
      delete request.headers.authorization;
      delete request.headers.cookie;
      delete request.headers["x-sg-identity"];
      request.headers["x-sg-identity"] = await broker.identity();
      next();
    } catch (error) {
      next(error);
    }
  };
}

function writeJSON(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}
