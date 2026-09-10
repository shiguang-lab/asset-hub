import { type App, normalizePath, type TAbstractFile, TFile } from "obsidian";

export interface VaultEntry {
  path: string;
  mtime: number;
}

export interface VaultAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(root: string): Promise<VaultEntry[]>;
  trash(path: string): Promise<void>;
  ensureFolder(path: string): Promise<void>;
  onModify(handler: (path: string) => void): () => void;
  onDelete(handler: (path: string) => void): () => void;
  onRename(handler: (path: string, previousPath: string) => void): () => void;
}

export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private readonly app: App) {}

  async read(path: string): Promise<string> {
    return await this.app.vault.adapter.read(normalizePath(path));
  }

  /**
   * Writes through the vault API rather than the raw adapter so Obsidian's
   * metadata cache and any open editor stay consistent with the file on disk.
   */
  async write(path: string, content: string): Promise<void> {
    const target = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(target);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return;
    }
    await this.ensureFolder(parentOf(target));
    await this.app.vault.create(target, content);
  }

  async exists(path: string): Promise<boolean> {
    return await this.app.vault.adapter.exists(normalizePath(path));
  }

  async list(root: string): Promise<VaultEntry[]> {
    const prefix = normalizePath(root).replace(/\/+$/, "");
    const entries: VaultEntry[] = [];
    for (const file of this.app.vault.getFiles()) {
      if (!file.path.startsWith(prefix === "" ? "" : `${prefix}/`)) continue;
      entries.push({ path: file.path, mtime: file.stat.mtime });
    }
    return entries;
  }

  async trash(path: string): Promise<void> {
    const target = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!target) return;
    // Trash rather than delete: a bad sync decision stays recoverable.
    await this.app.fileManager.trashFile(target);
  }

  async ensureFolder(path: string): Promise<void> {
    const target = normalizePath(path);
    if (target === "" || target === "/") return;
    if (this.app.vault.getAbstractFileByPath(target)) return;
    await this.ensureFolder(parentOf(target));
    try {
      await this.app.vault.createFolder(target);
    } catch {
      // A concurrent writer may have created it between the check and the call.
    }
  }

  /**
   * `vault.on` hands back an `EventRef`, which is not callable — returning it
   * directly would make every disposer throw the moment it is invoked and leave
   * the listener attached for the life of the app. Hence the `offref` wrapper,
   * repeated per event because the overloads type each callback separately.
   */
  onModify(handler: (path: string) => void): () => void {
    const ref = this.app.vault.on("modify", (file: TAbstractFile) => {
      if (file instanceof TFile) handler(file.path);
    });
    return () => this.app.vault.offref(ref);
  }

  onDelete(handler: (path: string) => void): () => void {
    const ref = this.app.vault.on("delete", (file: TAbstractFile) => {
      if (file instanceof TFile) handler(file.path);
    });
    return () => this.app.vault.offref(ref);
  }

  onRename(handler: (path: string, previousPath: string) => void): () => void {
    const ref = this.app.vault.on("rename", (file: TAbstractFile, previousPath: string) => {
      if (file instanceof TFile) handler(file.path, previousPath);
    });
    return () => this.app.vault.offref(ref);
  }
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}
