import { Notice, Plugin, type TAbstractFile, TFile } from "obsidian";
import { ApiClient, describe, type TokenProvider } from "./api/client.js";
import { DocumentsApi } from "./api/documents.js";
import { consumeEventStream, type ServerEvent } from "./api/events.js";
import { OAuthClient } from "./auth/oauth-client.js";
import {
  AuthRequiredError,
  type AuthState,
  SessionExpiredError,
  TokenStore,
} from "./auth/token-store.js";
import { createLogger, type Logger } from "./logger.js";
import { ObsidianVaultAdapter } from "./obsidian/vault-adapter.js";
import { mergeSettings, type PersistedData, type PluginSettings } from "./settings.js";
import { type NoticeLevel, SyncEngine, type SyncProgress } from "./sync/engine.js";
import { type IndexStorage, SyncIndexStore } from "./sync/index-store.js";
import { toRemotePath } from "./sync/path-mapper.js";
import { VaultWatcher } from "./sync/watcher.js";
import { SettingsTab } from "./ui/settings-tab.js";
import { badgeText, type SyncBadge } from "./ui/status-bar.js";
import { SyncStatusView, VIEW_TYPE_SYNC_STATUS } from "./ui/status-view.js";

const INDEX_FILE = "sync-index.json";
const INDEX_BACKUP_FILE = "sync-index.corrupt.json";
/** Vault bursts arrive as several events; collapse them into one round. */
const EVENT_DEBOUNCE_MS = 2_000;

export default class AssetHubPlugin extends Plugin {
  /**
   * `Plugin` has shipped `settings?: unknown` since 1.13 so plugins can type
   * their own; narrow the type here instead of redeclaring the property, which
   * would reset it to `undefined` on construction.
   */
  declare settings: PluginSettings;
  private auth: AuthState | null = null;
  private logger!: Logger;

  private vault!: ObsidianVaultAdapter;
  private oauth!: OAuthClient;
  private tokens!: TokenStore;
  private api!: ApiClient;
  private documents!: DocumentsApi;
  private index!: SyncIndexStore;
  private engine!: SyncEngine;
  private watcher!: VaultWatcher;

  private statusBarEl: HTMLElement | null = null;
  private syncTimer: number | null = null;
  private eventAbort: AbortController | null = null;
  private eventSyncTimer: number | null = null;
  /** Serialises writes to `data.json`; settings and tokens share the file. */
  private saving: Promise<void> = Promise.resolve();

  override async onload(): Promise<void> {
    await this.#loadData();
    this.logger = createLogger(() => this.settings.debugLogging);

    this.vault = new ObsidianVaultAdapter(this.app);
    this.oauth = new OAuthClient({
      serverUrl: () => this.settings.serverUrl,
      openExternal: (url) => this.#openExternal(url),
      logger: this.logger,
    });
    this.tokens = new TokenStore(
      this.auth,
      (state) => this.#persistAuth(state),
      (refreshToken) => this.oauth.refresh(refreshToken),
      this.logger,
    );
    this.api = new ApiClient(() => this.settings.apiUrl, this.#tokenProvider(), this.logger);
    this.documents = new DocumentsApi(this.api);

    this.index = new SyncIndexStore(this.#indexStorage(), this.logger);
    await this.index.load();

    this.engine = new SyncEngine({
      vault: this.vault,
      documents: this.documents,
      index: this.index,
      settings: () => this.settings,
      logger: this.logger,
      onProgress: (progress) => this.#onProgress(progress),
      onNotice: (message, level) => this.#notify(message, level),
    });
    this.watcher = new VaultWatcher({
      vault: this.vault,
      syncRoot: () => this.settings.syncRoot,
      onTrigger: (reason) => {
        this.logger.debug(`vault change: ${reason}`);
        void this.#sync("vault");
      },
    });

    this.registerView(
      VIEW_TYPE_SYNC_STATUS,
      (leaf) =>
        new SyncStatusView(leaf, {
          index: this.index,
          isAuthenticated: () => this.tokens.isAuthenticated,
          getProgress: () => this.engine.progress,
          sync: async () => {
            await this.#sync("panel");
          },
          resolve: async (vaultPath, choice) => {
            await this.#resolveConflict(vaultPath, choice);
          },
          openSettings: () => this.#openSettings(),
        }),
    );

    this.addSettingTab(
      new SettingsTab(this.app, this, {
        getSettings: () => this.settings,
        saveSettings: (changes) => this.#saveSettings(changes),
        getAccount: () => {
          const state = this.tokens.state;
          if (!state) return null;
          return { displayName: state.displayName, subject: state.subject, scope: state.scope };
        },
        login: () => this.#login(),
        logout: () => this.#logout(),
        syncNow: () => this.#sync("settings"),
        rebuildIndex: () => this.#rebuildIndex(),
      }),
    );

    this.#statusBar();
    this.#commands();

    this.registerDomEvent(window, "online", () => this.#refreshStatusBar());
    this.registerDomEvent(window, "offline", () => this.#refreshStatusBar());

    this.applyRuntimeSettings();

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.syncOnStartup && this.settings.syncEnabled && this.tokens.isAuthenticated) {
        void this.#sync("startup");
      }
    });
  }

  override onunload(): void {
    this.#stopTimer();
    this.#stopEventStream();
    this.watcher.stop();
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SYNC_STATUS);
  }

  /** Re-applies everything that depends on settings that just changed. */
  applyRuntimeSettings(): void {
    const { syncEnabled, autoSyncInterval, showStatusBar, realtimeEnabled } = this.settings;

    if (!syncEnabled) {
      this.watcher.stop();
    } else {
      this.watcher.start();
    }

    this.#stopTimer();
    if (syncEnabled && autoSyncInterval > 0) {
      this.syncTimer = window.setInterval(
        () => void this.#sync("timer"),
        autoSyncInterval * 60_000,
      );
    }

    if (this.statusBarEl) {
      this.statusBarEl.classList.toggle("asset-hub-statusbar--hidden", !showStatusBar);
    }

    if (syncEnabled && realtimeEnabled && this.tokens.isAuthenticated) {
      this.#startEventStream();
    } else {
      this.#stopEventStream();
    }

    this.#refreshStatusBar();
  }

  // --- data.json ----------------------------------------------------------

  async #loadData(): Promise<void> {
    const stored = (await this.loadData()) as PersistedData | null;
    this.settings = mergeSettings(stored?.settings);
    this.auth = stored?.auth ?? null;
  }

  /** Settings and credentials share `data.json`, so all writes go through here. */
  #queueSave(): Promise<void> {
    const payload: PersistedData = { settings: this.settings, auth: this.auth };
    this.saving = this.saving
      .then(() => this.saveData(payload))
      .catch((error: unknown) => this.logger.error("写入插件数据失败", error));
    return this.saving;
  }

  async #saveSettings(changes: Partial<PluginSettings>): Promise<void> {
    this.settings = mergeSettings({ ...this.settings, ...changes });
    await this.#queueSave();
    this.applyRuntimeSettings();
  }

  async #persistAuth(state: AuthState | null): Promise<void> {
    this.auth = state;
    await this.#queueSave();
    this.applyRuntimeSettings();
  }

  #indexStorage(): IndexStorage {
    const dir = this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`;
    const file = `${dir}/${INDEX_FILE}`;
    const backup = `${dir}/${INDEX_BACKUP_FILE}`;
    const adapter = this.app.vault.adapter;
    return {
      read: async () => ((await adapter.exists(file)) ? await adapter.read(file) : null),
      write: async (content) => await adapter.write(file, content),
      backup: async (content) => await adapter.write(backup, content),
    };
  }

  // --- auth ---------------------------------------------------------------

  #tokenProvider(): TokenProvider {
    return {
      getAccessToken: () => this.tokens.getAccessToken(),
      invalidateAccessToken: () => this.tokens.invalidateAccessToken(),
      onAuthFailure: (error) => {
        if (error instanceof SessionExpiredError || error instanceof AuthRequiredError) {
          this.#refreshStatusBar();
        }
      },
    };
  }

  async #login(): Promise<void> {
    try {
      new Notice("正在打开浏览器，请完成授权…");
      const state = await this.oauth.authorize();
      await this.tokens.setState(state);
      new Notice(`已登录：${state.displayName || state.subject}`);
      if (this.settings.syncEnabled) await this.#sync("login");
    } catch (error) {
      this.logger.error("登录失败", error);
      new Notice(`登录失败：${describe(error)}`);
    } finally {
      this.#refreshStatusBar();
    }
  }

  async #logout(): Promise<void> {
    const refreshToken = this.tokens.state?.refreshToken;
    this.#stopEventStream();
    // Cleared locally first: signing out must not depend on the network.
    await this.tokens
      .setState(null)
      .catch((error: unknown) => this.logger.warn("清除令牌失败", error));
    if (refreshToken) {
      await this.oauth.revoke(refreshToken).catch((error: unknown) => {
        this.logger.warn("吊销远端令牌失败", error);
      });
    }
    new Notice("已退出登录。");
    this.applyRuntimeSettings();
  }

  // --- sync ---------------------------------------------------------------

  async #sync(reason: string): Promise<void> {
    if (!this.settings.syncEnabled) return;
    if (!this.tokens.isAuthenticated) return;
    this.logger.debug(`sync round requested (${reason})`);
    await this.engine.sync();
    this.#refreshStatusBar();
  }

  /** Manual entry points report completion, because the user is waiting. */
  async #syncNow(): Promise<void> {
    if (!this.tokens.isAuthenticated) {
      new Notice("请先登录知序账号。");
      this.#openSettings();
      return;
    }
    if (!this.settings.syncEnabled) {
      new Notice("同步已关闭，请在设置中启用。");
      this.#openSettings();
      return;
    }
    await this.engine.sync();
    const progress = this.engine.progress;
    // A failed round already raised its own notice; don't stack a second one.
    if (progress.phase === "error") return;
    new Notice(
      progress.conflicts > 0 ? `同步完成，有 ${progress.conflicts} 个冲突待处理。` : "同步完成。",
    );
  }

  async #resolveConflict(vaultPath: string, choice: "keep-local" | "keep-remote"): Promise<void> {
    try {
      await this.engine.resolveConflict(vaultPath, choice);
      new Notice(choice === "keep-local" ? "已用本地版本覆盖云端。" : "已用云端版本覆盖本地。");
    } catch (error) {
      this.logger.error("解决冲突失败", error);
      new Notice(`解决冲突失败：${describe(error)}`);
    }
    this.#refreshStatusBar();
    this.#renderStatusViews();
  }

  async #rebuildIndex(): Promise<void> {
    await this.index.reset();
    this.engine.invalidateHashes();
    new Notice("同步索引已重建，正在重新比对…");
    await this.#sync("rebuild");
  }

  #onProgress(progress: SyncProgress): void {
    this.#refreshStatusBar();
    this.#renderStatusViews();
    if (this.settings.debugLogging && progress.phase !== "idle") {
      this.logger.debug(`sync ${progress.phase} ${progress.completed}/${progress.total}`);
    }
  }

  // --- server events ------------------------------------------------------

  #startEventStream(): void {
    if (this.eventAbort) return;
    const controller = new AbortController();
    this.eventAbort = controller;
    const url = `${this.settings.apiUrl}/events`;
    void this.#pumpEvents(url, controller);
  }

  #stopEventStream(): void {
    this.eventAbort?.abort();
    this.eventAbort = null;
    if (this.eventSyncTimer !== null) {
      window.clearTimeout(this.eventSyncTimer);
      this.eventSyncTimer = null;
    }
  }

  async #pumpEvents(url: string, controller: AbortController): Promise<void> {
    let attempt = 0;
    try {
      while (!controller.signal.aborted) {
        try {
          await consumeEventStream({
            url,
            headers: async () => ({
              Authorization: `Bearer ${await this.tokens.getAccessToken()}`,
            }),
            signal: controller.signal,
            onEvent: (event) => this.#onServerEvent(event),
          });
          attempt = 0;
        } catch (error) {
          if (controller.signal.aborted) return;
          // Being signed out is a terminal condition for the stream; the next
          // successful login restarts it.
          if (error instanceof AuthRequiredError || error instanceof SessionExpiredError) return;
          attempt += 1;
          const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
          this.logger.debug(`事件流将在 ${delay}ms 后重连`, describe(error));
          await sleep(delay, controller.signal);
        }
      }
    } finally {
      if (this.eventAbort === controller) this.eventAbort = null;
    }
  }

  #onServerEvent(event: ServerEvent): void {
    if (event.event === "ping") return;
    let payload: { eventType?: unknown } = {};
    try {
      payload = JSON.parse(event.data) as { eventType?: unknown };
    } catch {
      return;
    }
    const eventType = typeof payload.eventType === "string" ? payload.eventType : event.event;
    // Only document traffic is relevant; the workspace shares one stream.
    if (!eventType.startsWith("asset.")) return;
    if (this.eventSyncTimer !== null) window.clearTimeout(this.eventSyncTimer);
    this.eventSyncTimer = window.setTimeout(() => {
      this.eventSyncTimer = null;
      void this.#sync("event");
    }, EVENT_DEBOUNCE_MS);
  }

  // --- UI -----------------------------------------------------------------

  #statusBar(): void {
    const el = this.addStatusBarItem();
    el.addClass("asset-hub-statusbar");
    el.classList.toggle("asset-hub-statusbar--hidden", !this.settings.showStatusBar);
    this.registerDomEvent(el, "click", () => void this.#revealStatusView());
    this.statusBarEl = el;
    this.#refreshStatusBar();
  }

  #currentBadge(): SyncBadge {
    if (!this.tokens.isAuthenticated) return { kind: "signed-out" };
    const progress = this.engine.progress;
    if (!navigator.onLine) return { kind: "offline" };
    if (progress.running) return { kind: "running", progress };
    if (progress.conflicts > 0) return { kind: "conflicts", count: progress.conflicts };
    if (progress.phase === "error") {
      return { kind: "error", message: progress.lastError ?? "同步失败" };
    }
    return { kind: "idle", lastSyncAt: progress.lastSyncAt };
  }

  #refreshStatusBar(): void {
    const el = this.statusBarEl;
    if (!el) return;
    const badge = this.#currentBadge();
    el.setText(badgeText(badge));
    el.toggleClass("is-error", badge.kind === "error");
    el.toggleClass("is-conflict", badge.kind === "conflicts");
    el.toggleClass("is-signed-out", badge.kind === "signed-out");
  }

  #renderStatusViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SYNC_STATUS)) {
      if (leaf.view instanceof SyncStatusView) leaf.view.render();
    }
  }

  async #revealStatusView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SYNC_STATUS)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_SYNC_STATUS, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.#renderStatusViews();
  }

  #openSettings(): void {
    const setting = this.app as unknown as {
      setting: { open: () => void; openTabById: (id: string) => void };
    };
    setting.setting.open();
    setting.setting.openTabById(this.manifest.id);
  }

  #commands(): void {
    this.addRibbonIcon("folder-sync", "知序资产中心：同步状态面板", () =>
      void this.#revealStatusView(),
    );
    this.addCommand({
      id: "sync-now",
      name: "立即同步",
      callback: () => void this.#syncNow(),
    });
    this.addCommand({
      id: "open-status",
      name: "打开同步状态面板",
      callback: () => void this.#revealStatusView(),
    });
    this.addCommand({
      id: "login",
      name: "登录知序账号",
      checkCallback: (checking) => {
        if (this.tokens.isAuthenticated) return false;
        if (!checking) void this.#login();
        return true;
      },
    });
    this.addCommand({
      id: "logout",
      name: "退出登录",
      checkCallback: (checking) => {
        if (!this.tokens.isAuthenticated) return false;
        if (!checking) void this.#logout();
        return true;
      },
    });
    this.addCommand({
      id: "open-in-asset-hub",
      name: "在资产中心打开当前文档",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !this.#remoteIdFor(file)) return false;
        if (!checking) this.#openInAssetHub(file);
        return true;
      },
    });
    this.addCommand({
      id: "rebuild-index",
      name: "重建同步索引",
      callback: () => void this.#rebuildIndex(),
    });
  }

  #remoteIdFor(file: TAbstractFile): string | null {
    if (!(file instanceof TFile)) return null;
    const remotePath = toRemotePath(file.path, this.settings.syncRoot);
    if (!remotePath) return null;
    const binding = this.index.bindings.find(
      (entry) => entry.remotePath === remotePath && entry.vaultPath === file.path,
    );
    return binding?.remoteId ?? null;
  }

  #openInAssetHub(file: TFile): void {
    const remoteId = this.#remoteIdFor(file);
    if (!remoteId) return;
    this.#openExternal(`${this.settings.serverUrl}/assets/${encodeURIComponent(remoteId)}`);
  }

  // --- misc ---------------------------------------------------------------

  #notify(message: string, level: NoticeLevel): void {
    new Notice(message, level === "error" ? 10_000 : level === "warn" ? 8_000 : 5_000);
  }

  #stopTimer(): void {
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Opens a URL in the system browser. `window.open` is unreliable inside
   * Electron, so the shell module is preferred, with a manual fallback.
   */
  #openExternal(url: string): void {
    const electron = (window as unknown as { require?: (module: string) => unknown }).require;
    try {
      const shell = (electron?.("electron") as { shell?: { openExternal?: (u: string) => void } })
        ?.shell;
      if (shell?.openExternal) {
        shell.openExternal(url);
        return;
      }
    } catch (error) {
      this.logger.warn("调用系统浏览器失败", error);
    }
    new Notice(`无法自动打开浏览器，请手动访问：${url}`, 15_000);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}
