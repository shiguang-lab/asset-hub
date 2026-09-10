import {
  createPublicKey,
  type JsonWebKey,
  type KeyObject,
  verify as verifySignature,
} from "node:crypto";
import { readFile } from "node:fs/promises";

interface IdentityHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

interface IdentityClaims {
  aud?: unknown;
  entitlements?: unknown;
  exp?: unknown;
  iat?: unknown;
  iss?: unknown;
  nbf?: unknown;
  name?: unknown;
  org_id?: unknown;
  roles?: unknown;
  scope?: unknown;
  sub?: unknown;
}

interface JsonWebKeySet {
  keys?: Array<JsonWebKey & { alg?: string; kid?: string; use?: string }>;
}

export interface SgIdentityOptions {
  issuer: string;
  audience: string;
  entitlement: string;
  jwksUrl: string;
  jwksFile?: string;
  /**
   * Expected JWS `typ` header. Defaults to the gateway assertion type. OAuth
   * access tokens carry `at+jwt` so the two token classes can never be
   * interchanged.
   */
  tokenType?: string;
}

export interface ResolvedSgIdentity {
  sub: string;
  displayName?: string;
  organizationId?: string;
  roles: string[];
  /** Space-delimited OAuth scopes. Absent on gateway identity assertions. */
  scope?: string;
}

const CLOCK_TOLERANCE_SECONDS = 10;
const DEFAULT_TOKEN_TYPE = "sg-identity+jwt";

/**
 * Verifies an RS256 JWT against the shared JWKS, mirroring OPC's
 * `UnifiedIdentityService`. Used both for the access-gateway-issued
 * `X-SG-Identity` assertion and, with `tokenType: "at+jwt"`, for OAuth access
 * tokens issued by the authorization server.
 */
export class SgIdentityVerifier {
  private readonly keys = new Map<string, KeyObject>();
  private keysExpireAt = 0;

  constructor(private readonly options: SgIdentityOptions) {}

  async verify(token: string): Promise<ResolvedSgIdentity | null> {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerPart, claimsPart, signaturePart] = parts;
    if (!headerPart || !claimsPart || !signaturePart) return null;

    const header = decodeJson<IdentityHeader>(headerPart);
    const claims = decodeJson<IdentityClaims>(claimsPart);
    if (
      !header ||
      !claims ||
      header.alg !== "RS256" ||
      header.typ !== (this.options.tokenType ?? DEFAULT_TOKEN_TYPE) ||
      typeof header.kid !== "string"
    ) {
      return null;
    }

    const key = await this.keyFor(header.kid);
    if (!key) return null;

    const valid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${claimsPart}`),
      key,
      Buffer.from(signaturePart, "base64url"),
    );
    if (!valid || !this.validClaims(claims)) return null;

    const subject = String(claims.sub);
    const orgId = typeof claims.org_id === "string" ? claims.org_id : undefined;
    const scope = typeof claims.scope === "string" ? claims.scope : undefined;
    return {
      sub: subject,
      displayName: typeof claims.name === "string" ? claims.name : undefined,
      organizationId: orgId && orgId !== "" ? orgId : undefined,
      roles: stringArray(claims.roles),
      ...(scope ? { scope } : {}),
    };
  }

  private validClaims(claims: IdentityClaims): boolean {
    const now = Math.floor(Date.now() / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const entitlements = stringArray(claims.entitlements);
    return (
      claims.iss === this.options.issuer &&
      audience.includes(this.options.audience) &&
      typeof claims.sub === "string" &&
      claims.sub.length > 0 &&
      typeof claims.exp === "number" &&
      claims.exp >= now - CLOCK_TOLERANCE_SECONDS &&
      typeof claims.nbf === "number" &&
      claims.nbf <= now + CLOCK_TOLERANCE_SECONDS &&
      typeof claims.iat === "number" &&
      claims.iat <= now + CLOCK_TOLERANCE_SECONDS &&
      entitlements.includes(this.options.entitlement)
    );
  }

  private async keyFor(kid: string): Promise<KeyObject | null> {
    if (Date.now() >= this.keysExpireAt || !this.keys.has(kid)) {
      await this.refreshKeys();
    }
    return this.keys.get(kid) ?? null;
  }

  private async refreshKeys(): Promise<void> {
    const body = await this.readJwks();
    const next = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || jwk.kty !== "RSA" || (jwk.alg && jwk.alg !== "RS256")) continue;
      next.set(jwk.kid, createPublicKey({ format: "jwk", key: jwk }));
    }
    if (next.size === 0) throw new Error("JWKS contains no RS256 keys");
    this.keys.clear();
    for (const [kid, key] of next) this.keys.set(kid, key);
    this.keysExpireAt = Date.now() + 5 * 60_000;
  }

  private async readJwks(): Promise<JsonWebKeySet> {
    if (this.options.jwksFile) {
      return JSON.parse(await readFile(this.options.jwksFile, "utf8")) as JsonWebKeySet;
    }
    const response = await fetch(this.options.jwksUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`JWKS returned ${response.status}`);
    return (await response.json()) as JsonWebKeySet;
  }
}

function decodeJson<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}
