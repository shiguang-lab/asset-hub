import { describe, expect, it, vi } from "vitest";
import type { OAuthTokenResponse } from "../api/types.js";
import { silentLogger } from "../logger.js";
import {
  AuthRequiredError,
  type AuthState,
  SessionExpiredError,
  TokenStore,
} from "./token-store.js";

const NOW = 1_000_000;

function authState(over: Partial<AuthState> = {}): AuthState {
  return {
    accessToken: "at-1",
    accessExpiresAt: NOW + 600_000,
    refreshToken: "rt-1",
    scope: "documents:read documents:write offline_access",
    subject: "sub_1",
    displayName: "张三",
    issuer: "https://shiguanglab.com",
    ...over,
  };
}

function tokenResponse(over: Partial<OAuthTokenResponse> = {}): OAuthTokenResponse {
  return {
    access_token: "at-2",
    token_type: "Bearer",
    expires_in: 900,
    refresh_token: "rt-2",
    scope: "documents:read documents:write offline_access",
    ...over,
  };
}

function createStore(
  initial: AuthState | null,
  refresh: (token: string) => Promise<OAuthTokenResponse>,
) {
  const persisted: Array<AuthState | null> = [];
  const store = new TokenStore(
    initial,
    async (state) => {
      persisted.push(state);
    },
    refresh,
    silentLogger,
    () => NOW,
  );
  return { store, persisted };
}

describe("TokenStore", () => {
  it("reports whether a session exists", () => {
    expect(createStore(null, async () => tokenResponse()).store.isAuthenticated).toBe(false);
    expect(createStore(authState(), async () => tokenResponse()).store.isAuthenticated).toBe(true);
  });

  it("returns the cached token while it is comfortably valid", async () => {
    const refresh = vi.fn(async () => tokenResponse());
    const { store } = createStore(authState(), refresh);
    await expect(store.getAccessToken()).resolves.toBe("at-1");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes before the token actually expires", async () => {
    const refresh = vi.fn(async () => tokenResponse());
    // Inside the 60s skew window, so the token is treated as unusable.
    const { store } = createStore(authState({ accessExpiresAt: NOW + 30_000 }), refresh);
    await expect(store.getAccessToken()).resolves.toBe("at-2");
    expect(refresh).toHaveBeenCalledWith("rt-1");
  });

  it("refreshes an already expired token", async () => {
    const refresh = vi.fn(async () => tokenResponse());
    const { store } = createStore(authState({ accessExpiresAt: NOW - 1 }), refresh);
    await expect(store.getAccessToken()).resolves.toBe("at-2");
  });

  it("single-flights concurrent refreshes so the family is not revoked", async () => {
    let release: (value: OAuthTokenResponse) => void = () => undefined;
    const refresh = vi.fn(
      () =>
        new Promise<OAuthTokenResponse>((resolve) => {
          release = resolve;
        }),
    );
    const { store } = createStore(authState({ accessExpiresAt: NOW - 1 }), refresh);

    const first = store.getAccessToken();
    const second = store.getAccessToken();
    release(tokenResponse());
    await expect(Promise.all([first, second])).resolves.toEqual(["at-2", "at-2"]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("persists the rotated refresh token and new expiry", async () => {
    const { store, persisted } = createStore(authState({ accessExpiresAt: NOW - 1 }), async () =>
      tokenResponse(),
    );
    await store.getAccessToken();
    expect(persisted.at(-1)).toMatchObject({
      accessToken: "at-2",
      refreshToken: "rt-2",
      accessExpiresAt: NOW + 900_000,
    });
  });

  it("keeps the current refresh token when the server does not rotate it", async () => {
    const response = tokenResponse();
    delete response.refresh_token;
    const { store } = createStore(authState({ accessExpiresAt: NOW - 1 }), async () => response);
    await store.getAccessToken();
    expect(store.state?.refreshToken).toBe("rt-1");
  });

  it("surfaces a rejected refresh as an expired session and clears state", async () => {
    const { store, persisted } = createStore(authState({ accessExpiresAt: NOW - 1 }), async () => {
      throw new Error("invalid_grant");
    });
    await expect(store.getAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(store.state).toBeNull();
    expect(persisted.at(-1)).toBeNull();
  });

  it("clears state when no refresh token was ever granted", async () => {
    const refresh = vi.fn(async () => tokenResponse());
    const { store } = createStore(
      authState({ accessExpiresAt: NOW - 1, refreshToken: "" }),
      refresh,
    );
    await expect(store.getAccessToken()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses to mint a token for a signed-out client", async () => {
    const { store } = createStore(null, async () => tokenResponse());
    await expect(store.getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("forces a refresh after the token is rejected", async () => {
    const refresh = vi.fn(async () => tokenResponse());
    const { store } = createStore(authState(), refresh);
    store.invalidateAccessToken();
    await expect(store.getAccessToken()).resolves.toBe("at-2");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("persists an explicit sign-out", async () => {
    const { store, persisted } = createStore(authState(), async () => tokenResponse());
    await store.setState(null);
    expect(store.isAuthenticated).toBe(false);
    expect(persisted).toEqual([null]);
  });
});
