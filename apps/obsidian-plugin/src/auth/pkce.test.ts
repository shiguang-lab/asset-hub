import { describe, expect, it } from "vitest";
import { challengeFor, createPkceChallenge, randomState } from "./pkce.js";

describe("challengeFor", () => {
  it("matches the RFC 7636 appendix B vector", () => {
    expect(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("is deterministic", () => {
    expect(challengeFor("verifier")).toBe(challengeFor("verifier"));
  });
});

describe("createPkceChallenge", () => {
  it("emits a verifier inside the RFC 7636 length range", () => {
    const { verifier } = createPkceChallenge();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("uses only unreserved base64url characters", () => {
    expect(createPkceChallenge().verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("pairs the challenge with its verifier and names S256", () => {
    const pkce = createPkceChallenge();
    expect(pkce.challenge).toBe(challengeFor(pkce.verifier));
    expect(pkce.method).toBe("S256");
  });

  it("never repeats a verifier", () => {
    expect(createPkceChallenge().verifier).not.toBe(createPkceChallenge().verifier);
  });
});

describe("randomState", () => {
  it("is unique per call", () => {
    expect(randomState()).not.toBe(randomState());
  });
});
