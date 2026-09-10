import { createHash, randomBytes } from "node:crypto";

export interface PkceChallenge {
  verifier: string;
  challenge: string;
  method: "S256";
}

const VERIFIER_BYTES = 48; // 64 base64url characters, inside the RFC 7636 43..128 range

export function createPkceChallenge(): PkceChallenge {
  const verifier = randomBytes(VERIFIER_BYTES).toString("base64url");
  return { verifier, challenge: challengeFor(verifier), method: "S256" };
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** 256 bits of entropy for the CSRF `state`. */
export function randomState(): string {
  return randomBytes(32).toString("base64url");
}
