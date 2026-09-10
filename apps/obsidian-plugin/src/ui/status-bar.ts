import type { SyncProgress } from "../sync/engine.js";

export type SyncBadge =
  | { kind: "signed-out" }
  | { kind: "idle"; lastSyncAt: number | null }
  | { kind: "running"; progress: SyncProgress }
  | { kind: "conflicts"; count: number }
  | { kind: "error"; message: string }
  | { kind: "offline" };

/** Pure so the label logic is testable without an Obsidian instance. */
export function badgeText(badge: SyncBadge): string {
  switch (badge.kind) {
    case "signed-out":
      return "－ 未登录";
    case "conflicts":
      return `⚠ ${badge.count} 个冲突`;
    case "error":
      return "✕ 同步失败";
    case "offline":
      return "○ 离线";
    case "running": {
      const { completed, total } = badge.progress;
      return total > 0 ? `⟳ 同步中 ${completed}/${total}` : "⟳ 同步中";
    }
    case "idle":
      return badge.lastSyncAt ? `✓ 已同步 · ${relativeTime(badge.lastSyncAt)}` : "✓ 已同步";
  }
}

export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "刚刚";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}
