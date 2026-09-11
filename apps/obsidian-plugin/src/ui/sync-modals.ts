import { FuzzySuggestModal, Modal, Setting, type App } from "obsidian";

export function chooseRemoteFolder(app: App, folders: string[]): Promise<string | null> {
  return new Promise((resolve) => new FolderModal(app, folders, resolve).open());
}

class FolderModal extends FuzzySuggestModal<string> {
  private settled = false;
  constructor(app: App, private readonly folders: string[], private readonly resolve: (value: string | null) => void) { super(app); this.setPlaceholder("选择知序目录（根目录也可）"); }
  getItems(): string[] { return ["", ...this.folders]; }
  getItemText(item: string): string { return item || "文档中心根目录"; }
  onChooseItem(item: string): void { this.settled = true; this.resolve(item); }
  override onClose(): void { if (!this.settled) this.resolve(null); }
}

export function resolvePathCollision(app: App, remotePath: string, renamedPath: string): Promise<"rename" | "pull" | null> {
  return new Promise((resolve) => new CollisionModal(app, remotePath, renamedPath, resolve).open());
}

class CollisionModal extends Modal {
  private settled = false;
  constructor(app: App, private readonly remotePath: string, private readonly renamedPath: string, private readonly resolve: (value: "rename" | "pull" | null) => void) { super(app); }
  override onOpen(): void {
    this.contentEl.createEl("h3", { text: "云端已有同名文档" });
    this.contentEl.createEl("p", { text: `「${this.remotePath}」已存在。请选择如何处理，插件不会静默覆盖或合并。` });
    new Setting(this.contentEl).setName("作为新文档同步").setDesc(`建议名称：${this.renamedPath}`).addButton((button) => button.setCta().setButtonText("使用建议名称").onClick(() => this.finish("rename")));
    new Setting(this.contentEl).setName("关联已有文档").setDesc("以云端内容覆盖当前本地文件，之后进行双向同步。").addButton((button) => button.setButtonText("关联并拉取").onClick(() => this.finish("pull")));
  }
  private finish(value: "rename" | "pull"): void { this.settled = true; this.resolve(value); this.close(); }
  override onClose(): void { this.contentEl.empty(); if (!this.settled) this.resolve(null); }
}
