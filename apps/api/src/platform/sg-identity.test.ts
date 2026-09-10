import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SgIdentityVerifier } from "./sg-identity.js";

const ISSUER = "https://shiguanglab.com";
const AUDIENCE = "asset-hub-api";
const ENTITLEMENT = "asset-hub:access";
const KID = "test-key";

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

type Signer = (claims: Record<string, unknown>, tokenType: string) => string;

async function createHarness(): Promise<{ jwksFile: string; sign: Signer }> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  const directory = await mkdtemp(join(tmpdir(), "sg-identity-"));
  const jwksFile = join(directory, "jwks.json");
  await writeFile(
    jwksFile,
    JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] }),
  );

  return {
    jwksFile,
    sign: (claims, tokenType) => {
      const header = base64urlJson({ alg: "RS256", kid: KID, typ: tokenType });
      const payload = base64urlJson(claims);
      const signature = createSign("RSA-SHA256")
        .update(`${header}.${payload}`)
        .sign(privateKey as KeyObject, "base64url");
      return `${header}.${payload}.${signature}`;
    },
  };
}

function validClaims(): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: "user-1",
    entitlements: [ENTITLEMENT],
    iat: now,
    nbf: now - 5,
    exp: now + 900,
  };
}

describe("SgIdentityVerifier token type isolation", () => {
  it("accepts the gateway assertion type by default", async () => {
    const { jwksFile, sign } = await createHarness();
    const verifier = new SgIdentityVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      entitlement: ENTITLEMENT,
      jwksUrl: "unused",
      jwksFile,
    });

    const identity = await verifier.verify(sign(validClaims(), "sg-identity+jwt"));
    expect(identity).toMatchObject({ sub: "user-1" });
  });

  it("rejects an OAuth access token on the gateway assertion path", async () => {
    const { jwksFile, sign } = await createHarness();
    const verifier = new SgIdentityVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      entitlement: ENTITLEMENT,
      jwksUrl: "unused",
      jwksFile,
    });

    expect(await verifier.verify(sign(validClaims(), "at+jwt"))).toBeNull();
  });

  it("rejects a gateway assertion on the OAuth access token path", async () => {
    const { jwksFile, sign } = await createHarness();
    const verifier = new SgIdentityVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      entitlement: ENTITLEMENT,
      jwksUrl: "unused",
      jwksFile,
      tokenType: "at+jwt",
    });

    expect(await verifier.verify(sign(validClaims(), "sg-identity+jwt"))).toBeNull();
    expect(await verifier.verify(sign(validClaims(), "at+jwt"))).toMatchObject({ sub: "user-1" });
  });

  it("surfaces the granted scope on an access token", async () => {
    const { jwksFile, sign } = await createHarness();
    const verifier = new SgIdentityVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      entitlement: ENTITLEMENT,
      jwksUrl: "unused",
      jwksFile,
      tokenType: "at+jwt",
    });

    const identity = await verifier.verify(
      sign({ ...validClaims(), scope: "documents:read documents:write" }, "at+jwt"),
    );
    expect(identity?.scope).toBe("documents:read documents:write");
  });

  it("still enforces issuer, audience and entitlement on access tokens", async () => {
    const { jwksFile, sign } = await createHarness();
    const verifier = new SgIdentityVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      entitlement: ENTITLEMENT,
      jwksUrl: "unused",
      jwksFile,
      tokenType: "at+jwt",
    });

    expect(
      await verifier.verify(sign({ ...validClaims(), aud: "other-api" }, "at+jwt")),
    ).toBeNull();
    expect(
      await verifier.verify(sign({ ...validClaims(), iss: "https://evil.com" }, "at+jwt")),
    ).toBeNull();
    expect(
      await verifier.verify(
        sign({ ...validClaims(), entitlements: ["superagents:access"] }, "at+jwt"),
      ),
    ).toBeNull();
  });

  it("rejects an expired access token", async () => {
    const { jwksFile, sign } = await createHarness();
    const verifier = new SgIdentityVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      entitlement: ENTITLEMENT,
      jwksUrl: "unused",
      jwksFile,
      tokenType: "at+jwt",
    });

    const now = Math.floor(Date.now() / 1000);
    expect(
      await verifier.verify(sign({ ...validClaims(), exp: now - 120, nbf: now - 300 }, "at+jwt")),
    ).toBeNull();
  });
});
