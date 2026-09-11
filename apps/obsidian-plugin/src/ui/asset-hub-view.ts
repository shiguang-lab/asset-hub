import { ItemView, type ViewStateResult, type WorkspaceLeaf } from "obsidian";

export const VIEW_TYPE_ASSET_HUB = "zhixu-document-center";

export class AssetHubView extends ItemView {
  private opened = false;
  private returnTo = "https://doc.shiguanglab.com";
  constructor(leaf: WorkspaceLeaf, private readonly getURL: (returnTo: string) => Promise<string>) { super(leaf); }
  override getViewType(): string { return VIEW_TYPE_ASSET_HUB; }
  override getDisplayText(): string { return "知序文档中心"; }
  override getIcon(): string { return "library"; }
  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    this.returnTo = typeof (state as { returnTo?: unknown } | null)?.returnTo === "string" ? (state as { returnTo: string }).returnTo : "https://doc.shiguanglab.com";
    if (this.opened) await this.render(this.returnTo);
  }
  override async onOpen(): Promise<void> {
    this.opened = true;
    await this.render(this.returnTo);
  }
  override async onClose(): Promise<void> { this.opened = false; }
  private async render(returnTo: string): Promise<void> {
    this.contentEl.empty();
    const loading = this.contentEl.createEl("p", { text: "正在打开知序文档中心…" });
    try {
      const iframe = this.contentEl.createEl("iframe", { attr: { src: await this.getURL(returnTo), title: "知序文档中心", allow: "clipboard-read; clipboard-write" } });
      iframe.addClass("asset-hub-webview"); loading.remove();
    } catch (error) { loading.setText(error instanceof Error ? error.message : String(error)); }
  }
}
