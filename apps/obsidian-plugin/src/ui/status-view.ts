import { ItemView, type WorkspaceLeaf } from "obsidian";
import type { SyncProgress } from "../sync/engine.js";
import type { SyncIndexStore } from "../sync/index-store.js";

export const VIEW_TYPE_SYNC_STATUS = "asset-hub-sync-status";

export interface StatusViewDeps {
  index: SyncIndexStore;
  isAuthenticated: () => boolean;
  getProgress: () => SyncProgress;
  sync: () => Promise<void>;
  resolve: (vaultPath: string, choice: "keep-local" | "keep-remote") => Promise<void>;
  openSettings: () => void;
}

export class SyncStatusView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly deps: StatusViewDeps,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return VIEW_TYPE_SYNC_STATUS;
  }

  override getDisplayText(): string {
    return "资产中心同步状态";
  }

  override getIcon(): string {
    return "refresh-cw";
  }

  override async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("asset-hub-status");

    if (!this.deps.isAuthenticated()) {
      container.createEl("p", { text: "尚未登录知序账号。" });
      const button = container.createEl("button", { text: "打开设置并登录" });
      button.addEventListener("click", () => this.deps.openSettings());
      return;
    }

    const progress = this.deps.getProgress();
    const summary = container.createDiv({ cls: "asset-hub-status__summary" });
    summary.createEl("p", {
      text: progress.running
        ? `正在同步 ${progress.completed}/${progress.total}`
        : progress.lastSyncAt
          ? `上次同步：${new Date(progress.lastSyncAt).toLocaleString()}`
          : "尚未同步",
    });
    if (progress.lastError) {
      summary.createEl("p", { cls: "asset-hub-status__error", text: progress.lastError });
    }

    const actions = container.createDiv({ cls: "asset-hub-status__actions" });
    const syncButton = actions.createEl("button", { text: "立即同步" });
    syncButton.disabled = progress.running;
    syncButton.addEventListener("click", () => {
      void this.deps.sync().then(() => this.render());
    });

    const conflicts = this.deps.index.conflicted();
    const section = container.createDiv({ cls: "asset-hub-status__conflicts" });
    section.createEl("h4", { text: `待解决的冲突（${conflicts.length}）` });
    if (conflicts.length === 0) {
      section.createEl("p", { text: "没有需要处理的冲突。" });
      return;
    }

    for (const binding of conflicts) {
      const row = section.createDiv({ cls: "asset-hub-status__conflict" });
      row.createEl("p", { text: binding.vaultPath });
      if (binding.conflictCopy) {
        row.createEl("p", { cls: "asset-hub-status__hint", text: `副本：${binding.conflictCopy}` });
      }
      const buttons = row.createDiv({ cls: "asset-hub-status__actions" });
      const keepLocal = buttons.createEl("button", { text: "保留本地并覆盖云端" });
      keepLocal.addEventListener("click", () => {
        void this.deps.resolve(binding.vaultPath, "keep-local").then(() => this.render());
      });
      const keepRemote = buttons.createEl("button", { text: "保留云端并覆盖本地" });
      keepRemote.addEventListener("click", () => {
        void this.deps.resolve(binding.vaultPath, "keep-remote").then(() => this.render());
      });
    }
  }
}
