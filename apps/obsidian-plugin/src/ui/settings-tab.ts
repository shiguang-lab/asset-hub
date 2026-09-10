import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import type { PluginSettings } from "../settings.js";

export interface SettingsTabDeps {
  getSettings: () => PluginSettings;
  saveSettings: (changes: Partial<PluginSettings>) => Promise<void>;
  getAccount: () => { displayName: string; subject: string; scope: string } | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  syncNow: () => Promise<void>;
  rebuildIndex: () => Promise<void>;
}

export class SettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly deps: SettingsTabDeps,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.deps.getSettings();

    containerEl.createEl("h3", { text: "账号" });
    const account = this.deps.getAccount();
    if (account) {
      new Setting(containerEl)
        .setName(account.displayName || account.subject)
        .setDesc(`已授权：${account.scope}`)
        .addButton((button) =>
          button.setButtonText("退出登录").onClick(async () => {
            await this.deps.logout();
            this.display();
          }),
        );
      containerEl.createEl("p", {
        cls: "setting-item-description",
        text: "访问令牌以明文保存在本插件的 data.json 中（Obsidian 未提供系统钥匙串）。请勿将插件目录提交到公开仓库。",
      });
    } else {
      new Setting(containerEl)
        .setName("使用知序账号登录")
        .setDesc("将打开系统浏览器完成授权，插件本身不会接触你的密码。")
        .addButton((button) =>
          button
            .setButtonText("登录")
            .setCta()
            .onClick(async () => {
              await this.deps.login();
              this.display();
            }),
        );
    }

    containerEl.createEl("h3", { text: "同步" });
    new Setting(containerEl)
      .setName("同步根目录")
      .setDesc("云端文档将同步到这个文件夹下，其目录结构保持一致。")
      .addText((text) =>
        text.setValue(settings.syncRoot).onChange(async (value) => {
          await this.deps.saveSettings({ syncRoot: value.trim() || settings.syncRoot });
        }),
      );

    new Setting(containerEl).setName("启用同步").addToggle((toggle) =>
      toggle.setValue(settings.syncEnabled).onChange(async (value) => {
        await this.deps.saveSettings({ syncEnabled: value });
      }),
    );

    new Setting(containerEl).setName("启动时同步").addToggle((toggle) =>
      toggle.setValue(settings.syncOnStartup).onChange(async (value) => {
        await this.deps.saveSettings({ syncOnStartup: value });
      }),
    );

    new Setting(containerEl)
      .setName("自动同步间隔")
      .setDesc("单位：分钟。设为 0 关闭定时同步。")
      .addText((text) =>
        text.setValue(String(settings.autoSyncInterval)).onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          await this.deps.saveSettings({
            autoSyncInterval:
              Number.isFinite(parsed) && parsed >= 0 ? parsed : settings.autoSyncInterval,
          });
        }),
      );

    new Setting(containerEl)
      .setName("实时更新")
      .setDesc("订阅服务端事件，远端修改几乎立即落地。")
      .addToggle((toggle) =>
        toggle.setValue(settings.realtimeEnabled).onChange(async (value) => {
          await this.deps.saveSettings({ realtimeEnabled: value });
        }),
      );

    containerEl.createEl("h3", { text: "删除行为" });
    new Setting(containerEl)
      .setName("本地删除时同步删除云端")
      .setDesc("⚠ 开启后在 Obsidian 删除文件会软删除云端文档。默认关闭。")
      .addToggle((toggle) =>
        toggle.setValue(settings.deleteRemoteOnLocalDelete).onChange(async (value) => {
          await this.deps.saveSettings({ deleteRemoteOnLocalDelete: value });
        }),
      );

    new Setting(containerEl).setName("云端删除时删除本地").addToggle((toggle) =>
      toggle.setValue(settings.deleteLocalOnRemoteDelete).onChange(async (value) => {
        await this.deps.saveSettings({ deleteLocalOnRemoteDelete: value });
      }),
    );

    containerEl.createEl("h3", { text: "界面" });
    new Setting(containerEl).setName("显示状态栏").addToggle((toggle) =>
      toggle.setValue(settings.showStatusBar).onChange(async (value) => {
        await this.deps.saveSettings({ showStatusBar: value });
      }),
    );
    new Setting(containerEl)
      .setName("输出调试日志")
      .setDesc("在开发者控制台打印每次同步的比对结果。")
      .addToggle((toggle) =>
        toggle.setValue(settings.debugLogging).onChange(async (value) => {
          await this.deps.saveSettings({ debugLogging: value });
        }),
      );

    containerEl.createEl("h3", { text: "高级" });
    new Setting(containerEl)
      .setName("服务地址")
      .setDesc("授权与接口的公共地址，修改后需重新登录。")
      .addText((text) =>
        text.setValue(settings.serverUrl).onChange(async (value) => {
          await this.deps.saveSettings({ serverUrl: value.trim() });
        }),
      );
    new Setting(containerEl).setName("接口地址").addText((text) =>
      text.setValue(settings.apiUrl).onChange(async (value) => {
        await this.deps.saveSettings({ apiUrl: value.trim() });
      }),
    );
    new Setting(containerEl)
      .setName("重建同步索引")
      .setDesc("索引损坏或需要全量重新比对时使用。")
      .addButton((button) =>
        button.setButtonText("重建").onClick(async () => {
          await this.deps.rebuildIndex();
        }),
      );
    new Setting(containerEl).setName("立即同步").addButton((button) =>
      button.setButtonText("同步").onClick(async () => {
        await this.deps.syncNow();
      }),
    );
  }
}
