import { type RequestUrlResponse, requestUrl } from "obsidian";
import type { Logger } from "../logger.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
  ) {
    super(`${status} ${code}: ${detail}`);
    this.name = "ApiError";
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** 5xx and network failures are worth retrying without bothering the user. */
  get isTransient(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Sent as If-Match to trigger the server's optimistic lock. */
  ifMatch?: number;
  signal?: AbortSignal;
}

/** Supplies a valid access token, refreshing it when necessary. */
export interface TokenProvider {
  getAccessToken(): Promise<string>;
  /** Called when the server rejects the token, to force a refresh. */
  invalidateAccessToken(): void;
  onAuthFailure(error: unknown): void;
}

export class ApiClient {
  constructor(
    private readonly baseUrl: () => string,
    private readonly tokens: TokenProvider,
    private readonly logger: Logger,
  ) {}

  async request<T>(options: RequestOptions, retrying = false): Promise<T> {
    const url = this.buildUrl(options);
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.ifMatch !== undefined) headers["If-Match"] = String(options.ifMatch);
    try {
      headers.Authorization = `Bearer ${await this.tokens.getAccessToken()}`;
    } catch (error) {
      this.tokens.onAuthFailure(error);
      throw error;
    }

    let response: RequestUrlResponse;
    try {
      response = await requestUrl({
        url,
        method: options.method ?? "GET",
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        throw: false,
      });
    } catch (error) {
      // requestUrl rejects on transport failures; treat them as retryable.
      this.logger.debug(`${options.method ?? "GET"} ${url} failed in transit`, describe(error));
      throw new ApiError(0, "NETWORK_ERROR", describe(error));
    }

    if (response.status === 401 && !retrying) {
      // Exactly one retry. A second 401 means the session is really gone.
      this.logger.debug(`token rejected by ${url}, refreshing once`);
      this.tokens.invalidateAccessToken();
      return await this.request<T>(options, true);
    }
    if (response.status >= 400) {
      throw toApiError(response);
    }
    if (response.status === 204 || response.text === "") {
      return undefined as T;
    }
    return parseJson(response, url) as T;
  }

  private buildUrl(options: RequestOptions): string {
    const base = this.baseUrl().replace(/\/+$/, "");
    const url = new URL(`${base}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

/** `response.json` is a getter that throws on non-JSON bodies. */
function parseJson(response: RequestUrlResponse, url: string): unknown {
  try {
    return response.json;
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE", `响应不是合法 JSON：${url}`);
  }
}

function toApiError(response: RequestUrlResponse): ApiError {
  const problem = asProblem(tryReadJson(response));
  const code = problem?.code ?? problem?.error ?? `HTTP_${response.status}`;
  const detail = problem?.detail ?? problem?.title ?? response.text.slice(0, 400);
  return new ApiError(response.status, code, detail || "请求失败");
}

interface ProblemBody {
  code?: string;
  error?: string;
  detail?: string;
  title?: string;
}

function tryReadJson(response: RequestUrlResponse): unknown {
  try {
    return response.json;
  } catch {
    return null;
  }
}

function asProblem(body: unknown): ProblemBody | null {
  return body && typeof body === "object" ? (body as ProblemBody) : null;
}

export function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
