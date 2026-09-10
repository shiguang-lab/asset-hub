import { requestUrl } from "obsidian";
import type { OAuthTokenResponse } from "../api/types.js";
import type { Logger } from "../logger.js";
import { CALLBACK_PATH, LoopbackServer, OAuthCallbackError } from "./loopback-server.js";
import { createPkceChallenge, randomState } from "./pkce.js";
import type { AuthState } from "./token-store.js";

export const CLIENT_ID = "obsidian-asset-hub";
export const DEFAULT_SCOPE = "documents:read documents:write offline_access";
const CALLBACK_TIMEOUT_MS = 120_000;

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
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
  /** Public origin of the authorization server, e.g. https://shiguanglab.com */
  serverUrl: () => string;
  /** Opens a URL in the user's system browser. */
  openExternal: (url: string) => void;
  logger: Logger;
  now?: () => number;
}

export class OAuthClient {
  #metadata: AuthorizationServerMetadata | null = null;

  constructor(private readonly options: OAuthClientOptions) {}

  /** RFC 8414 discovery, cached for the lifetime of the session. */
  async discover(): Promise<AuthorizationServerMetadata> {
    if (this.#metadata) return this.#metadata;
    const url = `${this.baseUrl()}/.well-known/oauth-authorization-server`;
    const response = await requestUrl({
      url,
      headers: { Accept: "application/json" },
      throw: false,
    });
    if (response.status !== 200) {
      throw new OAuthError(
        "discovery_failed",
        `无法读取授权服务器元数据（${url} 返回 ${response.status}）。请检查服务地址设置。`,
      );
    }
    const body = response.json as Partial<AuthorizationServerMetadata>;
    if (!body.authorization_endpoint || !body.token_endpoint) {
      throw new OAuthError("discovery_invalid", `授权服务器元数据缺少必要端点：${url}`);
    }
    this.#metadata = {
      issuer: body.issuer ?? this.baseUrl(),
      authorization_endpoint: body.authorization_endpoint,
      token_endpoint: body.token_endpoint,
      ...(body.revocation_endpoint ? { revocation_endpoint: body.revocation_endpoint } : {}),
    };
    return this.#metadata;
  }

  /**
   * Runs the authorization code + PKCE flow against the system browser and
   * returns the freshly issued credentials.
   */
  async authorize(scope: string = DEFAULT_SCOPE): Promise<AuthState> {
    const metadata = await this.discover();
    const pkce = createPkceChallenge();
    const state = randomState();
    const loopback = new LoopbackServer();
    try {
      const port = await loopback.start();
      const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
      this.options.logger.debug("oauth redirect", redirectUri);

      const authorizeUrl = new URL(metadata.authorization_endpoint);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("client_id", CLIENT_ID);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("scope", scope);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("code_challenge", pkce.challenge);
      authorizeUrl.searchParams.set("code_challenge_method", pkce.method);

      this.options.openExternal(authorizeUrl.toString());
      const callback = await loopback.waitForCallback(state, CALLBACK_TIMEOUT_MS);
      const tokens = await this.exchangeCode({
        code: callback.code,
        verifier: pkce.verifier,
        redirectUri,
        tokenEndpoint: metadata.token_endpoint,
      });
      return toAuthState(tokens, metadata.issuer, this.now());
    } finally {
      // Always released: a lingering listener on a loopback port is a needless
      // local attack surface.
      await loopback.close();
    }
  }

  async exchangeCode(input: {
    code: string;
    verifier: string;
    redirectUri: string;
    tokenEndpoint: string;
  }): Promise<OAuthTokenResponse> {
    return await this.postForm(input.tokenEndpoint, {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: CLIENT_ID,
      code_verifier: input.verifier,
    });
  }

  /** Refresh callback for `TokenStore`. */
  async refresh(refreshToken: string): Promise<OAuthTokenResponse> {
    const metadata = await this.discover();
    return await this.postForm(metadata.token_endpoint, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
  }

  /**
   * RFC 7009 revocation. Failures are swallowed by the caller: the user asked
   * to sign out, and the local credentials are cleared either way.
   */
  async revoke(refreshToken: string): Promise<void> {
    const metadata = await this.discover();
    if (!metadata.revocation_endpoint) return;
    await this.postForm(metadata.revocation_endpoint, {
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: CLIENT_ID,
    });
  }

  private async postForm(
    endpoint: string,
    form: Record<string, string>,
  ): Promise<OAuthTokenResponse> {
    const response = await requestUrl({
      url: endpoint,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      throw: false,
    });
    const body = readJson(response.status, response.text) as {
      error?: string;
      error_description?: string;
    } & Partial<OAuthTokenResponse>;
    if (response.status !== 200 || body.error) {
      throw new OAuthError(body.error ?? `http_${response.status}`, body.error_description ?? "");
    }
    if (!body.access_token || typeof body.expires_in !== "number") {
      throw new OAuthError("invalid_response", "授权服务器返回的令牌响应不完整。");
    }
    return body as OAuthTokenResponse;
  }

  private baseUrl(): string {
    return this.options.serverUrl().replace(/\/+$/, "");
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
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

/**
 * Reads the access token payload for display only. The signature is verified by
 * the resource server; the plugin never trusts this value for access decisions.
 */
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

export { OAuthCallbackError };
