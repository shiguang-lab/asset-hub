import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createLocalAuthMiddleware, LocalAuthBroker } from "./local-auth-broker.js";

const loginResponse = {
  brokerToken: "opaque-broker",
  brokerExpiresAt: "2026-08-17T00:00:00.000Z",
  identityToken: "signed-identity",
  identityExpiresAt: "2026-08-16T00:01:00.000Z",
  session: {
    authenticated: true as const,
    subject: "user-1",
    displayName: "Local User",
  },
};

describe("LocalAuthBroker", () => {
  it("keeps credentials in the server-side login request and single-flights callers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(loginResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const broker = new LocalAuthBroker({
      authTarget: "https://shiguanglab.com",
      loginName: "local@example.test",
      password: "server-only-password",
      fetchImpl,
      now: () => Date.parse("2026-08-16T00:00:00.000Z"),
    });

    await expect(Promise.all([broker.identity(), broker.identity()])).resolves.toEqual([
      "signed-identity",
      "signed-identity",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toContain("server-only-password");
    expect(JSON.parse(String(init.body))).toMatchObject({ productId: "asset-hub" });
    expect(await broker.session()).toMatchObject({ subject: "user-1", localBroker: true });
  });

  it("removes browser credentials and injects only the signed identity", async () => {
    const broker = new LocalAuthBroker({
      authTarget: "https://shiguanglab.com",
      loginName: "local@example.test",
      password: "password",
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(loginResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
      now: () => Date.parse("2026-08-16T00:00:00.000Z"),
    });
    const middleware = createLocalAuthMiddleware(broker);
    const request = {
      method: "GET",
      url: "/api/v1/assets",
      headers: {
        authorization: "Bearer browser-token",
        cookie: "secret=browser-cookie",
        "x-sg-identity": "forged",
      },
    } as unknown as IncomingMessage;
    const next = vi.fn();

    await middleware(request, {} as ServerResponse, next);

    expect(request.headers.authorization).toBeUndefined();
    expect(request.headers.cookie).toBeUndefined();
    expect(request.headers["x-sg-identity"]).toBe("signed-identity");
    expect(next).toHaveBeenCalledWith();
  });

  it("re-authenticates once when an expired broker is rejected", async () => {
    let now = Date.parse("2026-08-16T00:00:00.000Z");
    const renewed = {
      ...loginResponse,
      brokerToken: "renewed-broker",
      identityToken: "renewed-identity",
      identityExpiresAt: "2026-08-16T00:02:00.000Z",
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(loginResponse), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "broker_invalid" }), { status: 401 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(renewed), { status: 200 }));
    const broker = new LocalAuthBroker({
      authTarget: "https://shiguanglab.com",
      loginName: "local@example.test",
      password: "password",
      fetchImpl,
      now: () => now,
    });

    await expect(broker.identity()).resolves.toBe("signed-identity");
    now = Date.parse("2026-08-16T00:00:50.000Z");
    await expect(Promise.all([broker.identity(), broker.identity()])).resolves.toEqual([
      "renewed-identity",
      "renewed-identity",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not expose browser login routes while the account is env-managed", async () => {
    const broker = new LocalAuthBroker({
      authTarget: "https://shiguanglab.com",
      loginName: "local@example.test",
      password: "password",
    });
    const middleware = createLocalAuthMiddleware(broker);
    const request = { method: "GET", url: "/login", headers: {} } as IncomingMessage;
    const response = {
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    const next = vi.fn();

    await middleware(request, response, next);

    expect(response.statusCode).toBe(302);
    expect(response.setHeader).toHaveBeenCalledWith("Location", "/");
    expect(next).not.toHaveBeenCalled();
  });
});
