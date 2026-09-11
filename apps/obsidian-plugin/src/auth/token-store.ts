import type { OAuthTokenResponse } from "../api/types.js";
import type { Logger } from "../logger.js";

/**
 * Persisted credential state.
 *
 * The plugin persists this through Electron safeStorage. When system-backed
 * encryption is unavailable, the state remains usable for the current process
 * but is not written to `data.json`.
 */
export interface AuthState {
  accessToken: string;
  /** Epoch milliseconds. */
  accessExpiresAt: number;
  refreshToken: string;
  scope: string;
  subject: string;
  displayName: string;
  issuer: string;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("尚未登录知序账号");
    this.name = "AuthRequiredError";
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super("登录已过期，请重新登录");
    this.name = "SessionExpiredError";
  }
}

/** Refresh this long before expiry so a request never races the boundary. */
const EXPIRY_SKEW_MS = 60_000;

export class TokenStore {
  #state: AuthState | null;
  #inFlight: Promise<string> | null = null;

  constructor(
    initial: AuthState | null,
    private readonly persist: (state: AuthState | null) => Promise<void>,
    private readonly refreshToken: (refreshToken: string) => Promise<OAuthTokenResponse>,
    private readonly logger: Logger,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.#state = initial;
  }

  get state(): AuthState | null {
    return this.#state;
  }

  get isAuthenticated(): boolean {
    return this.#state !== null;
  }

  async setState(state: AuthState | null): Promise<void> {
    this.#state = state;
    await this.persist(state);
  }

  /**
   * Returns a usable access token, refreshing first when close to expiry.
   *
   * The single-flight guard is essential rather than an optimisation: two
   * concurrent refreshes would rotate the refresh token twice, and the second
   * presentation of an already-used token is indistinguishable from theft — the
   * server would revoke the whole family and sign the user out.
   */
  async getAccessToken(): Promise<string> {
    const state = this.#state;
    if (!state) throw new AuthRequiredError();
    if (this.now() < state.accessExpiresAt - EXPIRY_SKEW_MS) {
      return state.accessToken;
    }
    this.#inFlight ??= this.#refresh().finally(() => {
      this.#inFlight = null;
    });
    return await this.#inFlight;
  }

  /** Marks the current access token unusable so the next call refreshes it. */
  invalidateAccessToken(): void {
    if (this.#state) this.#state = { ...this.#state, accessExpiresAt: 0 };
  }

  async #refresh(): Promise<string> {
    const state = this.#state;
    if (!state) throw new AuthRequiredError();
    if (!state.refreshToken) {
      await this.setState(null);
      throw new SessionExpiredError();
    }
    let response: OAuthTokenResponse;
    try {
      response = await this.refreshToken(state.refreshToken);
    } catch (error) {
      this.logger.warn("refresh token rejected", error);
      await this.setState(null);
      throw new SessionExpiredError();
    }
    const next: AuthState = {
      accessToken: response.access_token,
      accessExpiresAt: this.now() + response.expires_in * 1000,
      // The server rotates refresh tokens; a response without one keeps the
      // current value, which happens when offline_access was not granted.
      refreshToken: response.refresh_token ?? state.refreshToken,
      scope: response.scope,
      subject: state.subject,
      displayName: state.displayName,
      issuer: state.issuer,
    };
    await this.setState(next);
    return next.accessToken;
  }
}
