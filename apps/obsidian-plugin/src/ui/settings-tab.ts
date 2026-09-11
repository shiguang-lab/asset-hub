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
        text: "桌面端使用系统凭据保护能力加密保存令牌；系统加密不可用时不持久化令牌，下次启动需重新登录。",
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
      .setName("自动双向同步")
      .setDesc(
        "开启后在启动、定时和本地或云端发生变化时同步已关联文档。冲突会保留双方版本并等待处理。",
      )
      .addToggle((toggle) =>
        toggle.setValue(settings.syncEnabled).onChange(async (value) => {
          await this.deps.saveSettings({ syncEnabled: value });
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
    new Setting(containerEl).setName("知序页面地址").addText((text) =>
      text.setValue(settings.webUrl).onChange(async (value) => {
        await this.deps.saveSettings({ webUrl: value.trim() });
      }),
    );
    new Setting(containerEl)
      .setName("重建同步索引")
      .setDesc("索引损坏时使用。重建会清除全部文档关联，不删除本地或云端内容。")
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
