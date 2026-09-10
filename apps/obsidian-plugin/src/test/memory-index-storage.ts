import type { IndexStorage } from "../sync/index-store.js";

/** In-memory stand-in for the `sync-index.json` file. */
export class MemoryIndexStorage implements IndexStorage {
  raw: string | null = null;
  readonly written: string[] = [];
  readonly backups: string[] = [];

  async read(): Promise<string | null> {
    return this.raw;
  }

  async write(content: string): Promise<void> {
    this.raw = content;
    this.written.push(content);
  }

  async backup(content: string): Promise<void> {
    this.backups.push(content);
  }
}
