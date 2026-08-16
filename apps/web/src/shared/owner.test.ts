import { describe, expect, it } from "vitest";
import type { AuthSession } from "../auth/session.js";
import { isOwnedBySession, ownerDisplayName } from "./owner.js";

const session: AuthSession = {
  id: "38291406",
  displayName: "yanxianliang",
  email: null,
  tenantType: "user",
  tenantId: "38291406",
  organizationName: null,
  roles: [],
};

describe("owner display", () => {
  it("uses the signed-in username for the current owner", () => {
    const asset = { ownerSubject: "38291406", ownerDisplayName: "新用户" };
    expect(isOwnedBySession(asset, session)).toBe(true);
    expect(ownerDisplayName(asset, session)).toBe("yanxianliang");
  });

  it("uses the resolved directory name for another owner", () => {
    expect(ownerDisplayName({ ownerSubject: "user:1002", ownerDisplayName: "李然" }, session)).toBe(
      "李然",
    );
  });
});
