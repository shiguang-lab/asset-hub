import { describe, expect, it } from "vitest";
import type { SyncProgress } from "../sync/engine.js";
import { badgeText, relativeTime } from "./status-bar.js";

function progress(over: Partial<SyncProgress> = {}): SyncProgress {
  return {
    running: false,
    phase: "idle",
    completed: 0,
    total: 0,
    lastSyncAt: null,
    lastError: null,
    conflicts: 0,
    ...over,
  };
}

describe("badgeText", () => {
  it("labels the signed-out state", () => {
    expect(badgeText({ kind: "signed-out" })).toBe("－ 未登录");
  });

  it("shows a bare tick before the first sync", () => {
    expect(badgeText({ kind: "idle", lastSyncAt: null })).toBe("✓ 已同步");
  });

  it("counts documents while a round is in flight", () => {
    expect(
      badgeText({
        kind: "running",
        progress: progress({ running: true, completed: 12, total: 48 }),
      }),
    ).toBe("⟳ 同步中 12/48");
  });

  it("omits the counter before the action list is known", () => {
    expect(badgeText({ kind: "running", progress: progress({ running: true }) })).toBe("⟳ 同步中");
  });

  it("surfaces the conflict count", () => {
    expect(badgeText({ kind: "conflicts", count: 2 })).toBe("⚠ 2 个冲突");
  });

  it("marks a failed round and an offline state", () => {
    expect(badgeText({ kind: "error", message: "boom" })).toBe("✕ 同步失败");
    expect(badgeText({ kind: "offline" })).toBe("○ 离线");
  });
});

describe("relativeTime", () => {
  const now = Date.UTC(2026, 8, 10, 12, 0, 0);

  it("summarises recent timestamps as 刚刚", () => {
    expect(relativeTime(now - 5_000, now)).toBe("刚刚");
  });

  it("counts minutes, hours and days", () => {
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 小时前");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2 天前");
  });

  it("never reports a negative age for a clock skewed into the future", () => {
    expect(relativeTime(now + 60_000, now)).toBe("刚刚");
  });
});
