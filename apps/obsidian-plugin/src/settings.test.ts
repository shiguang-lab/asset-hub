import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "./settings.js";

describe("mergeSettings", () => {
  it("falls back to the defaults for a fresh install", () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("overlays stored values onto the defaults", () => {
    const merged = mergeSettings({ syncRoot: "我的文档", autoSyncInterval: 15 });
    expect(merged.syncRoot).toBe("我的文档");
    expect(merged.autoSyncInterval).toBe(15);
    expect(merged.realtimeEnabled).toBe(DEFAULT_SETTINGS.realtimeEnabled);
  });

  it("keeps the dangerous delete option off unless it was stored on", () => {
    expect(mergeSettings({}).deleteRemoteOnLocalDelete).toBe(false);
    expect(mergeSettings({ deleteRemoteOnLocalDelete: true }).deleteRemoteOnLocalDelete).toBe(true);
  });

  it("restores the default root when it is blanked out", () => {
    expect(mergeSettings({ syncRoot: "   " }).syncRoot).toBe(DEFAULT_SETTINGS.syncRoot);
  });

  it("strips trailing slashes from the endpoints", () => {
    const merged = mergeSettings({
      serverUrl: "https://shiguanglab.com/",
      apiUrl: "https://shiguanglab.com/api/v1///",
    });
    expect(merged.serverUrl).toBe("https://shiguanglab.com");
    expect(merged.apiUrl).toBe("https://shiguanglab.com/api/v1");
  });

  it("restores an endpoint default when it is blanked out", () => {
    expect(mergeSettings({ serverUrl: "" }).serverUrl).toBe(DEFAULT_SETTINGS.serverUrl);
  });

  it("survives a corrupt stored value without losing the rest", () => {
    const merged = mergeSettings({ syncRoot: null as unknown as string });
    expect(merged.syncRoot).toBe(DEFAULT_SETTINGS.syncRoot);
  });
});
