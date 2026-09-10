import type { VaultAdapter } from "../obsidian/vault-adapter.js";
import { normalisePath } from "./path-mapper.js";

export interface WatcherOptions {
  vault: VaultAdapter;
  syncRoot: () => string;
  onTrigger: (reason: string) => void;
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 3_000;

/**
 * Turns vault activity into sync rounds.
 *
 * No attempt is made to suppress the events caused by the engine's own writes.
 * A spurious trigger is harmless by construction: the engine re-reads the vault,
 * compares hashes and finds nothing to do. Suppression bookkeeping would add a
 * race for no benefit, and a missed suppression would be the worse failure.
 */
export class VaultWatcher {
  #disposers: Array<() => void> = [];
  #timer: ReturnType<typeof setTimeout> | null = null;
  #reason = "";

  constructor(private readonly options: WatcherOptions) {}

  start(): void {
    if (this.#disposers.length > 0) return;
    const { vault } = this.options;
    this.#disposers = [
      vault.onModify((path) => this.#consider("文件已修改", path)),
      vault.onDelete((path) => this.#consider("文件已删除", path)),
      vault.onRename((path, previousPath) => {
        this.#consider("文件已重命名", path);
        this.#consider("文件已重命名", previousPath);
      }),
    ];
  }

  stop(): void {
    for (const dispose of this.#disposers) dispose();
    this.#disposers = [];
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #consider(reason: string, path: string): void {
    if (!this.#isInsideSyncRoot(path)) return;
    this.#reason = reason;
    const delay = this.options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.options.onTrigger(this.#reason);
    }, delay);
  }

  #isInsideSyncRoot(path: string): boolean {
    const root = normalisePath(this.options.syncRoot());
    const target = normalisePath(path);
    return root === "" || target === root || target.startsWith(`${root}/`);
  }
}
