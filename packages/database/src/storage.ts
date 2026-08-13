import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Content-addressed object store. Local filesystem by default; the interface
 * mirrors an S3-compatible bucket so a SeaweedFS/S3 adapter can replace the
 * implementation without changing callers.
 */
export interface ObjectStore {
  put(
    key: string,
    data: Buffer,
    mediaType?: string,
  ): Promise<{ key: string; hash: string; size: number }>;
  get(key: string): Promise<Buffer | null>;
  getStream(key: string): Promise<NodeJS.ReadableStream | null>;
  stat(key: string): Promise<{ size: number; hash: string } | null>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  objectPath(key: string): string;
  list(prefix?: string): string[];
}

export function hashBuffer(data: Buffer): string {
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  private safeKey(key: string): string {
    const normalized = key
      .split("/")
      .filter((part) => part !== "" && part !== "." && part !== "..");
    return normalized.join(sep);
  }

  objectPath(key: string): string {
    return resolve(this.root, this.safeKey(key));
  }

  list(prefix = ""): string[] {
    const base = resolve(this.root, this.safeKey(prefix));
    const out: string[] = [];
    const walk = (dir: string, relative: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(dir, entry);
        const rel = relative ? `${relative}/${entry}` : entry;
        const info = statSync(full);
        if (info.isDirectory()) walk(full, rel);
        else out.push(rel);
      }
    };
    try {
      if (!statSync(base).isDirectory()) return [];
    } catch {
      return [];
    }
    walk(base, prefix);
    return out;
  }

  async put(
    key: string,
    data: Buffer,
    _mediaType = "application/octet-stream",
  ): Promise<{ key: string; hash: string; size: number }> {
    const hash = hashBuffer(data);
    const target = this.objectPath(key);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data, { mode: 0o644 });
    return { key, hash, size: data.byteLength };
  }

  async putAtomic(key: string, data: Buffer): Promise<{ key: string; hash: string; size: number }> {
    const hash = hashBuffer(data);
    const target = this.objectPath(key);
    mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, data, { mode: 0o644 });
    renameSync(tmp, target);
    return { key, hash, size: data.byteLength };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return readFileSync(this.objectPath(key));
    } catch {
      return null;
    }
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream | null> {
    const { createReadStream } = await import("node:fs");
    const path = this.objectPath(key);
    try {
      const stat = await import("node:fs").then((m) => m.statSync(path));
      if (!stat.isFile()) return null;
      return createReadStream(path);
    } catch {
      return null;
    }
  }

  async stat(key: string): Promise<{ size: number; hash: string } | null> {
    try {
      const { statSync } = await import("node:fs");
      const info = statSync(this.objectPath(key));
      if (!info.isFile()) return null;
      const data = readFileSync(this.objectPath(key));
      return { size: info.size, hash: hashBuffer(data) };
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async delete(key: string): Promise<boolean> {
    try {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(this.objectPath(key));
      return true;
    } catch {
      return false;
    }
  }
}

export function createObjectStore(rootDir: string): ObjectStore {
  return new LocalObjectStore(rootDir);
}
