import { requestUrl } from "obsidian";
import type { OAuthTokenResponse } from "../api/types.js";
import type { Logger } from "../logger.js";
import type { AuthState } from "./token-store.js";

export const CLIENT_ID = "obsidian-asset-hub";
export const DEFAULT_SCOPE = "documents:read documents:write web:session offline_access";

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  device_authorization_endpoint: string;
  revocation_endpoint?: string;
}
interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}
interface WebSessionResponse {
  url: string;
  expires_in: number;
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    description: string,
  ) {
    super(description || code);
    this.name = "OAuthError";
  }
}

export interface OAuthClientOptions {
  serverUrl: () => string;
  openExternal: (url: string) => void;
  logger: Logger;
  accessToken?: () => Promise<string>;
  now?: () => number;
}

export class OAuthClient {
  #metadata: AuthorizationServerMetadata | null = null;
  constructor(private readonly options: OAuthClientOptions) {}

  async discover(): Promise<AuthorizationServerMetadata> {
    if (this.#metadata) return this.#metadata;
    const url = `${this.baseUrl()}/.well-known/oauth-authorization-server`;
    const response = await requestUrl({
      url,
      headers: { Accept: "application/json" },
      throw: false,
    });
    if (response.status !== 200)
      throw new OAuthError("discovery_failed", `无法读取授权服务器元数据（${response.status}）。`);
    const body = response.json as Partial<AuthorizationServerMetadata>;
    if (!body.authorization_endpoint || !body.token_endpoint || !body.device_authorization_endpoint)
      throw new OAuthError("discovery_invalid", "授权服务器尚未启用设备登录。");
    this.#metadata = {
      issuer: body.issuer ?? this.baseUrl(),
      authorization_endpoint: body.authorization_endpoint,
      token_endpoint: body.token_endpoint,
      device_authorization_endpoint: body.device_authorization_endpoint,
      ...(body.revocation_endpoint ? { revocation_endpoint: body.revocation_endpoint } : {}),
    };
    return this.#metadata;
  }

  async authorize(scope: string = DEFAULT_SCOPE): Promise<AuthState> {
    const metadata = await this.discover();
    const request = await this.postForm<DeviceAuthorizationResponse>(
      metadata.device_authorization_endpoint,
      { client_id: CLIENT_ID, scope },
    );
    if (!request.device_code || !request.verification_uri || typeof request.expires_in !== "number")
      throw new OAuthError("invalid_response", "设备授权响应不完整。");
    this.options.openExternal(request.verification_uri_complete || request.verification_uri);
    const deadline = this.now() + request.expires_in * 1000;
    let interval = Math.max(1, request.interval ?? 5) * 1000;
    while (this.now() < deadline) {
      await wait(interval);
      try {
        const tokens = await this.postForm<OAuthTokenResponse>(metadata.token_endpoint, {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: request.device_code,
          client_id: CLIENT_ID,
        });
        validateTokens(tokens);
        return toAuthState(tokens, metadata.issuer, this.now());
      } catch (error) {
        if (error instanceof OAuthError && error.code === "authorization_pending") continue;
        if (error instanceof OAuthError && error.code === "slow_down") {
          interval += 5_000;
          continue;
        }
        throw error;
      }
    }
    throw new OAuthError("expired_token", "登录请求已过期，请重新发起。");
  }

  async refresh(refreshToken: string): Promise<OAuthTokenResponse> {
    const metadata = await this.discover();
    const tokens = await this.postForm<OAuthTokenResponse>(metadata.token_endpoint, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
    validateTokens(tokens);
    return tokens;
  }

  async revoke(refreshToken: string): Promise<void> {
    const metadata = await this.discover();
    if (metadata.revocation_endpoint)
      await this.postForm<object>(metadata.revocation_endpoint, {
        token: refreshToken,
        token_type_hint: "refresh_token",
        client_id: CLIENT_ID,
      });
  }

  async createWebSession(returnTo: string): Promise<string> {
    const token = await this.options.accessToken?.();
    if (!token) throw new OAuthError("invalid_token", "尚未登录知序账号。");
    const result = await this.postForm<WebSessionResponse>(
      `${this.baseUrl()}/oauth/web-session-ticket`,
      { return_to: returnTo },
      { Authorization: `Bearer ${token}` },
    );
    if (!result.url) throw new OAuthError("invalid_response", "未获得页面登录地址。");
    return result.url;
  }

  private async postForm<T extends object>(
    endpoint: string,
    form: Record<string, string>,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const response = await requestUrl({
      url: endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...extraHeaders,
      },
      body: new URLSearchParams(form).toString(),
      throw: false,
    });
    const body = readJson(response.status, response.text) as {
      error?: string;
      error_description?: string;
    } & T;
    if (response.status < 200 || response.status >= 300 || body.error)
      throw new OAuthError(body.error ?? `http_${response.status}`, body.error_description ?? "");
    return body;
  }

  private baseUrl(): string {
    return this.options.serverUrl().replace(/\/+$/, "");
  }
  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function validateTokens(tokens: Partial<OAuthTokenResponse>): asserts tokens is OAuthTokenResponse {
  if (!tokens.access_token || typeof tokens.expires_in !== "number")
    throw new OAuthError("invalid_response", "授权服务器返回的令牌响应不完整。");
}
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function readJson(status: number, text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OAuthError(`http_${status}`, "授权服务器返回了非 JSON 响应。");
  }
}

export function toAuthState(tokens: OAuthTokenResponse, issuer: string, now: number): AuthState {
  const claims = decodeJwtPayload(tokens.access_token);
  return {
    accessToken: tokens.access_token,
    accessExpiresAt: now + tokens.expires_in * 1000,
    refreshToken: tokens.refresh_token ?? "",
    scope: tokens.scope,
    subject: typeof claims?.sub === "string" ? claims.sub : "",
    displayName: typeof claims?.name === "string" ? claims.name : "",
    issuer,
  };
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}
