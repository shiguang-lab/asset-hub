import type { Logger } from "../logger.js";
import { EMPTY_INDEX, type SyncBinding, type SyncIndex } from "./types.js";

/** Where the index lives. Injected so tests can use memory. */
export interface IndexStorage {
  read(): Promise<string | null>;
  write(content: string): Promise<void>;
  /** Preserves an unreadable index so a corrupt file is never silently lost. */
  backup(content: string): Promise<void>;
}

export class SyncIndexStore {
  #index: SyncIndex = EMPTY_INDEX;
  #dirty = false;

  constructor(
    private readonly storage: IndexStorage,
    private readonly logger: Logger,
  ) {}

  get index(): SyncIndex {
    return this.#index;
  }

  get bindings(): SyncBinding[] {
    return this.#index.bindings;
  }

  get ignored(): string[] {
    return this.#index.ignored;
  }

  conflicted(): SyncBinding[] {
    return this.#index.bindings.filter((binding) => binding.conflicted);
  }

  find(vaultPath: string): SyncBinding | undefined {
    return this.#index.bindings.find((binding) => binding.vaultPath === vaultPath);
  }

  /**
   * Loads the index, recovering from corruption by quarantining the unreadable
   * file. Losing the index costs a full re-scan; refusing to start would leave
   * the user with no way forward.
   */
  async load(): Promise<void> {
    const raw = await this.storage.read();
    if (raw === null) {
      this.#index = EMPTY_INDEX;
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SyncIndex>;
      if (!Array.isArray(parsed.bindings) || parsed.version !== 1) {
        throw new Error("unsupported index shape");
      }
      this.#index = {
        version: 1,
        bindings: parsed.bindings,
        ignored: Array.isArray(parsed.ignored) ? parsed.ignored : [],
      };
    } catch (error) {
      this.logger.error("sync index is unreadable, quarantining it", error);
      await this.storage.backup(raw);
      this.#index = EMPTY_INDEX;
      this.#dirty = true;
    }
  }

  async save(): Promise<void> {
    if (!this.#dirty) return;
    await this.storage.write(JSON.stringify(this.#index, null, 2));
    this.#dirty = false;
  }

  upsert(binding: SyncBinding): void {
    const next = this.#index.bindings.filter((entry) => entry.vaultPath !== binding.vaultPath);
    next.push(binding);
    this.#index = { ...this.#index, bindings: next };
    this.#dirty = true;
  }

  patch(vaultPath: string, changes: Partial<SyncBinding>): void {
    this.#index = {
      ...this.#index,
      bindings: this.#index.bindings.map((entry) =>
        entry.vaultPath === vaultPath ? { ...entry, ...changes } : entry,
      ),
    };
    this.#dirty = true;
  }

  remove(vaultPath: string): void {
    this.#index = {
      ...this.#index,
      bindings: this.#index.bindings.filter((entry) => entry.vaultPath !== vaultPath),
    };
    this.#dirty = true;
  }

  ignore(vaultPath: string): void {
    if (this.#index.ignored.includes(vaultPath)) return;
    this.#index = { ...this.#index, ignored: [...this.#index.ignored, vaultPath] };
    this.#dirty = true;
  }

  unignore(vaultPath: string): void {
    this.#index = {
      ...this.#index,
      ignored: this.#index.ignored.filter((entry) => entry !== vaultPath),
    };
    this.#dirty = true;
  }

  /**
   * Applies changes while clearing the conflict markers. The indexes are
   * removed rather than set to undefined so the persisted JSON stays tidy.
   */
  settle(vaultPath: string, changes: Partial<SyncBinding> = {}): void {
    this.#index = {
      ...this.#index,
      bindings: this.#index.bindings.map((entry) => {
        if (entry.vaultPath !== vaultPath) return entry;
        const { conflicted: _conflicted, conflictCopy: _copy, ...rest } = entry;
        return { ...rest, ...changes };
      }),
    };
    this.#dirty = true;
  }

  async reset(): Promise<void> {
    this.#index = EMPTY_INDEX;
    this.#dirty = true;
    await this.save();
  }
}
