import { describe, expect, it } from "vitest";
import { parseEvent } from "./events.js";

describe("parseEvent", () => {
  it("reads the id, event name and data", () => {
    expect(parseEvent('id: 42\nevent: asset.updated\ndata: {"assetId":"ast_1"}')).toEqual({
      id: "42",
      event: "asset.updated",
      data: '{"assetId":"ast_1"}',
    });
  });

  it("joins multi-line data with newlines", () => {
    expect(parseEvent("data: line one\ndata: line two")?.data).toBe("line one\nline two");
  });

  it("defaults the event name to message", () => {
    expect(parseEvent("data: {}")?.event).toBe("message");
  });

  it("ignores comment lines and blank fields", () => {
    expect(parseEvent(": keep-alive\ndata: {}")).toEqual({
      id: "",
      event: "message",
      data: "{}",
    });
  });

  it("returns null for a frame carrying no data", () => {
    expect(parseEvent("event: ping")).toBeNull();
  });

  it("accepts a field with no space after the colon", () => {
    expect(parseEvent("data:{}")?.data).toBe("{}");
  });
});
