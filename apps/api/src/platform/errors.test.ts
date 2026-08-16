import { describe, expect, it } from "vitest";
import { toProblem } from "./errors.js";

describe("toProblem", () => {
  it("maps an asset version conflict code to HTTP 409", () => {
    const error = Object.assign(new Error("版本冲突：文档已被其他会话修改"), {
      code: "ASSET_VERSION_CONFLICT",
    });

    expect(toProblem(error, "req_test")).toMatchObject({
      status: 409,
      code: "ASSET_VERSION_CONFLICT",
      requestId: "req_test",
      recoveries: ["reload", "save_as_copy", "compare"],
    });
  });
});
