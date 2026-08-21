import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadServiceConfig } from "../src/index";

const ENV_KEYS = ["NODE_ENV", "DEV_AUTH"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

describe("devAuth resolution (regression for the z.coerce.boolean footgun)", () => {
  const saved: Record<EnvKey, string | undefined> = {
    NODE_ENV: undefined,
    DEV_AUTH: undefined,
  };

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function setEnv(env: Partial<Record<EnvKey, string | undefined>>): void {
    for (const k of ENV_KEYS) {
      const v = env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  function devAuth(): boolean {
    return loadServiceConfig(3001, "api").devAuth;
  }

  it("DEV_AUTH=false in production yields devAuth=false (the original bug)", () => {
    setEnv({ NODE_ENV: "production", DEV_AUTH: "false" });
    expect(devAuth()).toBe(false);
  });

  it("DEV_AUTH unset in production defaults to false", () => {
    setEnv({ NODE_ENV: "production" });
    expect(devAuth()).toBe(false);
  });

  it("DEV_AUTH empty string in production defaults to false", () => {
    setEnv({ NODE_ENV: "production", DEV_AUTH: "" });
    expect(devAuth()).toBe(false);
  });

  it("truthy tokens enable dev auth in production (case-insensitive)", () => {
    for (const v of ["true", "1", "yes", "y", "on", "TRUE", "Yes"]) {
      setEnv({ NODE_ENV: "production", DEV_AUTH: v });
      expect(devAuth()).toBe(true);
    }
  });

  it("non-truthy tokens stay false in production", () => {
    for (const v of ["no", "off", "0", "false", "random", " "]) {
      setEnv({ NODE_ENV: "production", DEV_AUTH: v });
      expect(devAuth()).toBe(false);
    }
  });

  it("development defaults dev auth ON when DEV_AUTH is unset", () => {
    setEnv({ NODE_ENV: "development" });
    expect(devAuth()).toBe(true);
  });

  it("explicit DEV_AUTH=false wins even in development", () => {
    setEnv({ NODE_ENV: "development", DEV_AUTH: "false" });
    expect(devAuth()).toBe(false);
  });

  it("NODE_ENV unset defaults to development and enables dev auth", () => {
    setEnv({});
    expect(devAuth()).toBe(true);
  });
});
