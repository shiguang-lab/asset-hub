import { describe, expect, it, vi } from "vitest";
import type { DocumentsApi, RemoteContent, RemoteDocument } from "../api/documents.js";
import { silentLogger } from "../logger.js";
import type { VaultAdapter, VaultEntry } from "../obsidian/vault-adapter.js";
import { DEFAULT_SETTINGS, type PluginSettings } from "../settings.js";
import { MemoryIndexStorage } from "../test/memory-index-storage.js";
import { conflictCopyPath } from "./conflict.js";
import { type NoticeLevel, SyncEngine } from "./engine.js";
import { contentHash } from "./hash.js";
import { SyncIndexStore } from "./index-store.js";
import type { SyncBinding } from "./types.js";

const NOW = 1_700_000_000_000;
const ROOT = DEFAULT_SETTINGS.syncRoot;

class MemoryVault implements VaultAdapter {
  #mtime = 1;

  constructor(
    readonly files: Map<string, string> = new Map(),
    private readonly log: string[] = [],
  ) {}

  seed(path: string, content: string): void {
    this.files.set(path, content);
  }

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT ${path}`);
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    this.log.push(`vault:write:${path}`);
    this.files.set(path, content);
    this.#mtime += 1;
  }

  async exists(path: string): Promise<boolean> {
    // The sync root is a folder, so "exists" must see descendant files too —
    // otherwise the engine concludes there is nothing to scan.
    if (this.files.has(path)) return true;
    return [...this.files.keys()].some((key) => key.startsWith(`${path}/`));
  }

  async list(root: string): Promise<VaultEntry[]> {
    const prefix = root === "" ? "" : `${root}/`;
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix))
      .map((path) => ({ path, mtime: this.#mtime }));
  }

  async trash(path: string): Promise<void> {
    this.log.push(`vault:trash:${path}`);
    this.files.delete(path);
  }

  async ensureFolder(): Promise<void> {
    return undefined;
  }

  onModify(): () => void {
    return () => undefined;
  }

  onDelete(): () => void {
    return () => undefined;
  }

  onRename(): () => void {
    return () => undefined;
  }
}

type StoredDocument = RemoteDocument & { text: string };

class FakeDocuments {
  readonly docs: StoredDocument[] = [];
  readonly creates: Array<{ remotePath: string; text: string }> = [];
  readonly updates: Array<{ remoteId: string; text: string }> = [];
  readonly removals: string[] = [];
  #sequence = 0;

  constructor(private readonly log: string[] = []) {}

  seed(remoteId: string, remotePath: string, text: string, version = 1): void {
    this.docs.push({
      remoteId,
      remotePath,
      title: remotePath,
      version,
      updatedAt: "2026-09-10T00:00:00.000Z",
      text,
    });
  }

  async listAll(): Promise<RemoteDocument[]> {
    return this.docs.map((doc) => ({
      remoteId: doc.remoteId,
      remotePath: doc.remotePath,
      title: doc.title,
      version: doc.version,
      updatedAt: doc.updatedAt,
    }));
  }

  async fetchContent(remoteId: string): Promise<RemoteContent> {
    const doc = this.#require(remoteId);
    return { text: doc.text, contentHash: contentHash(doc.text) };
  }

  async create(input: {
    remotePath: string;
    title: string;
    text: string;
  }): Promise<RemoteDocument> {
    this.#sequence += 1;
    const doc: StoredDocument = {
      remoteId: `ast_new_${this.#sequence}`,
      remotePath: input.remotePath,
      title: input.title,
      version: 1,
      updatedAt: "2026-09-10T00:00:00.000Z",
      text: input.text,
    };
    this.docs.push(doc);
    this.log.push(`remote:create:${input.remotePath}`);
    this.creates.push({ remotePath: input.remotePath, text: input.text });
    return doc;
  }

  async update(input: {
    remoteId: string;
    remotePath: string;
    title: string;
    text: string;
    baseVersion: number;
  }): Promise<RemoteDocument> {
    const doc = this.#require(input.remoteId);
    doc.text = input.text;
    doc.remotePath = input.remotePath;
    doc.title = input.title;
    doc.version = input.baseVersion + 1;
    this.log.push(`remote:update:${input.remotePath}`);
    this.updates.push({ remoteId: input.remoteId, text: input.text });
    return doc;
  }

  async move(input: {
    remoteId: string;
    remotePath: string;
    title: string;
    baseVersion: number;
  }): Promise<RemoteDocument> {
    const doc = this.#require(input.remoteId);
    doc.remotePath = input.remotePath;
    doc.title = input.title;
    doc.version = input.baseVersion + 1;
    this.log.push(`remote:move:${input.remotePath}`);
    return doc;
  }

  async remove(input: { remoteId: string; baseVersion: number }): Promise<void> {
    this.log.push(`remote:remove:${input.remoteId}`);
    this.removals.push(input.remoteId);
    const index = this.docs.findIndex((doc) => doc.remoteId === input.remoteId);
    if (index >= 0) this.docs.splice(index, 1);
  }

  #require(remoteId: string): StoredDocument {
    const doc = this.docs.find((entry) => entry.remoteId === remoteId);
    if (!doc) throw new Error(`404 ${remoteId}`);
    return doc;
  }
}

interface Harness {
  vault: MemoryVault;
  documents: FakeDocuments;
  storage: MemoryIndexStorage;
  index: SyncIndexStore;
  engine: SyncEngine;
  notices: Array<{ message: string; level: NoticeLevel }>;
  log: string[];
  settings: PluginSettings;
}

async function createHarness(overrides: Partial<PluginSettings> = {}): Promise<Harness> {
  const log: string[] = [];
  const vault = new MemoryVault(new Map(), log);
  const documents = new FakeDocuments(log);
  const storage = new MemoryIndexStorage();
  const index = new SyncIndexStore(storage, silentLogger);
  await index.load();

  const notices: Array<{ message: string; level: NoticeLevel }> = [];
  const settings: PluginSettings = { ...DEFAULT_SETTINGS, syncEnabled: true, ...overrides };
  const engine = new SyncEngine({
    vault,
    documents: documents as unknown as DocumentsApi,
    index,
    settings: () => settings,
    logger: silentLogger,
    onProgress: () => undefined,
    onNotice: (message, level) => notices.push({ message, level }),
    now: () => NOW,
  });
  return { vault, documents, storage, index, engine, notices, log, settings };
}

function binding(over: Partial<SyncBinding> = {}): SyncBinding {
  return {
    remoteId: "ast_1",
    vaultPath: `${ROOT}/笔记.md`,
    remotePath: "笔记.md",
    baseHash: contentHash("原始内容"),
    remoteVersion: 1,
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...over,
  };
}

describe("SyncEngine", () => {
  it("pulls a server document into the vault and records the binding", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "产品/周报.md", "# 周报\n");

    await h.engine.sync();

    expect(h.vault.files.get(`${ROOT}/产品/周报.md`)).toBe("# 周报\n");
    expect(h.index.find(`${ROOT}/产品/周报.md`)).toMatchObject({
      remoteId: "ast_1",
      remotePath: "产品/周报.md",
      remoteVersion: 1,
      baseHash: contentHash("# 周报\n"),
    });
  });

  it("uploads a local file and remembers it", async () => {
    const h = await createHarness();
    h.vault.seed(`${ROOT}/新笔记.md`, "# 新");

    await h.engine.sync();

    expect(h.documents.creates).toEqual([{ remotePath: "新笔记.md", text: "# 新" }]);
    const recorded = h.index.find(`${ROOT}/新笔记.md`);
    expect(recorded?.remoteId).toBe("ast_new_1");
    expect(recorded?.baseHash).toBe(contentHash("# 新"));
  });

  it("normalises line endings before uploading so both sides hash alike", async () => {
    const h = await createHarness();
    h.vault.seed(`${ROOT}/win.md`, "a\r\nb\r\n");

    await h.engine.sync();

    expect(h.documents.creates[0]?.text).toBe("a\nb\n");
    expect(h.index.find(`${ROOT}/win.md`)?.baseHash).toBe(contentHash("a\nb\n"));
  });

  it("applies pulls before pushes within a single round", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "产品/周报.md", "# 周报\n");
    h.vault.seed(`${ROOT}/新笔记.md`, "# 新");

    await h.engine.sync();

    expect(h.log.indexOf(`vault:write:${ROOT}/产品/周报.md`)).toBeLessThan(
      h.log.indexOf("remote:create:新笔记.md"),
    );
  });

  it("leaves both sides untouched when they already agree", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "原始内容");
    h.vault.seed(`${ROOT}/笔记.md`, "原始内容");
    h.index.upsert(binding());

    await h.engine.sync();

    expect(h.log).toEqual([]);
    expect(h.notices).toEqual([]);
  });

  it("pushes a local edit against the version it was based on", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "原始内容");
    h.vault.seed(`${ROOT}/笔记.md`, "本地改过");
    h.index.upsert(binding());

    await h.engine.sync();

    expect(h.documents.updates).toEqual([{ remoteId: "ast_1", text: "本地改过" }]);
    expect(h.index.find(`${ROOT}/笔记.md`)?.remoteVersion).toBe(2);
  });

  it("parks a conflict instead of guessing, and keeps the server copy", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "服务端改过", 2);
    h.vault.seed(`${ROOT}/笔记.md`, "本地改过");
    h.index.upsert(binding());

    await h.engine.sync();

    const copyPath = conflictCopyPath(`${ROOT}/笔记.md`, new Date(NOW));
    expect(h.vault.files.get(copyPath)).toBe("服务端改过");
    expect(h.vault.files.get(`${ROOT}/笔记.md`)).toBe("本地改过");
    const parked = h.index.find(`${ROOT}/笔记.md`);
    expect(parked?.conflicted).toBe(true);
    expect(parked?.conflictCopy).toBe(copyPath);
    expect(h.index.ignored).toContain(copyPath);
    expect(h.engine.progress.conflicts).toBe(1);
    expect(h.notices.at(-1)?.level).toBe("warn");
  });

  it("re-adopts a document instead of inventing a conflict when both sides match", async () => {
    const h = await createHarness();
    // No binding at all: this is exactly what a rebuilt index looks like.
    h.documents.seed("ast_1", "笔记.md", "一致的内容");
    h.vault.seed(`${ROOT}/笔记.md`, "一致的内容");

    await h.engine.sync();

    expect(h.notices).toEqual([]);
    expect(h.vault.files.size).toBe(1);
    const adopted = h.index.find(`${ROOT}/笔记.md`);
    expect(adopted?.remoteId).toBe("ast_1");
    expect(adopted?.baseHash).toBe(contentHash("一致的内容"));
    expect(adopted?.conflicted).toBeUndefined();
  });

  it("never lets a colliding server document overwrite the local file", async () => {
    const h = await createHarness();
    h.documents.seed("ast_2", "笔记.md", "云端内容");
    h.vault.seed(`${ROOT}/笔记.md`, "本地内容");

    await h.engine.sync();

    expect(h.vault.files.get(`${ROOT}/笔记.md`)).toBe("本地内容");
    const copyPath = conflictCopyPath(`${ROOT}/笔记.md`, new Date(NOW));
    expect(h.vault.files.get(copyPath)).toBe("云端内容");
    expect(h.index.find(`${ROOT}/笔记.md`)?.conflicted).toBe(true);
  });

  it("does not touch a parked conflict on later rounds", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "服务端改过", 2);
    h.vault.seed(`${ROOT}/笔记.md`, "本地改过");
    h.index.upsert(binding());
    await h.engine.sync();

    h.documents.updates.length = 0;
    h.documents.creates.length = 0;
    await h.engine.sync();

    expect(h.documents.updates).toEqual([]);
    expect(h.documents.creates).toEqual([]);
  });

  it("resolves a conflict by overwriting the server with the local file", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "服务端改过", 2);
    h.vault.seed(`${ROOT}/笔记.md`, "本地改过");
    h.index.upsert(binding());
    await h.engine.sync();
    const copyPath = h.index.find(`${ROOT}/笔记.md`)?.conflictCopy ?? "";

    await h.engine.resolveConflict(`${ROOT}/笔记.md`, "keep-local");

    expect(h.documents.updates).toEqual([{ remoteId: "ast_1", text: "本地改过" }]);
    expect(h.index.find(`${ROOT}/笔记.md`)?.conflicted).toBeUndefined();
    expect(h.vault.files.has(copyPath)).toBe(false);
    expect(h.index.ignored).not.toContain(copyPath);
  });

  it("resolves a conflict by overwriting the local file with the server copy", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "服务端改过", 2);
    h.vault.seed(`${ROOT}/笔记.md`, "本地改过");
    h.index.upsert(binding());
    await h.engine.sync();

    await h.engine.resolveConflict(`${ROOT}/笔记.md`, "keep-remote");

    expect(h.vault.files.get(`${ROOT}/笔记.md`)).toBe("服务端改过");
    expect(h.index.find(`${ROOT}/笔记.md`)?.baseHash).toBe(contentHash("服务端改过"));
    expect(h.index.find(`${ROOT}/笔记.md`)?.conflicted).toBeUndefined();
  });

  it("refuses to resolve a document that is not conflicted", async () => {
    const h = await createHarness();
    h.index.upsert(binding());
    await expect(h.engine.resolveConflict(`${ROOT}/笔记.md`, "keep-local")).rejects.toThrow();
  });

  it("trashes the local file when the server dropped the document", async () => {
    const h = await createHarness({ deleteLocalOnRemoteDelete: true });
    h.vault.seed(`${ROOT}/笔记.md`, "原始内容");
    h.index.upsert(binding());

    await h.engine.sync();

    expect(h.vault.files.has(`${ROOT}/笔记.md`)).toBe(false);
    expect(h.index.find(`${ROOT}/笔记.md`)).toBeUndefined();
  });

  it("keeps a locally edited file whose server copy disappeared", async () => {
    const h = await createHarness();
    h.vault.seed(`${ROOT}/笔记.md`, "只有本地有的改动");
    h.index.upsert(binding());

    await h.engine.sync();

    expect(h.vault.files.get(`${ROOT}/笔记.md`)).toBe("只有本地有的改动");
    expect(h.index.find(`${ROOT}/笔记.md`)).toBeUndefined();
    expect(h.notices.at(-1)?.level).toBe("warn");
  });

  it("deletes the server document when a local delete is allowed to propagate", async () => {
    const h = await createHarness({ deleteRemoteOnLocalDelete: true });
    h.documents.seed("ast_1", "笔记.md", "原始内容");
    h.index.upsert(binding());

    await h.engine.sync();

    expect(h.documents.removals).toEqual(["ast_1"]);
  });

  it("keeps the server document when local deletes must not propagate", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "原始内容");
    h.index.upsert(binding());

    await h.engine.sync();

    expect(h.documents.removals).toEqual([]);
    expect(h.index.find(`${ROOT}/笔记.md`)).toBeUndefined();
  });

  it("follows a server-side rename and removes the stale local file", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "新位置/笔记.md", "原始内容", 2);
    h.vault.seed(`${ROOT}/笔记.md`, "原始内容");
    h.index.upsert(binding());

    await h.engine.sync();

    expect(h.vault.files.get(`${ROOT}/新位置/笔记.md`)).toBe("原始内容");
    expect(h.vault.files.has(`${ROOT}/笔记.md`)).toBe(false);
    expect(h.index.find(`${ROOT}/新位置/笔记.md`)?.remoteId).toBe("ast_1");
  });

  it("moves the server document instead of duplicating it when a file is renamed", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "原始内容");
    h.vault.seed(`${ROOT}/新名字.md`, "原始内容");
    h.index.upsert(binding());

    await h.engine.sync();

    expect(h.documents.creates).toEqual([]);
    expect(h.documents.removals).toEqual([]);
    expect(h.documents.docs[0]?.remotePath).toBe("新名字.md");
    expect(h.index.find(`${ROOT}/笔记.md`)).toBeUndefined();
    expect(h.index.find(`${ROOT}/新名字.md`)).toMatchObject({
      remoteId: "ast_1",
      remotePath: "新名字.md",
      baseHash: contentHash("原始内容"),
    });
  });

  it("does not re-upload a renamed file on the round after the move", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "原始内容");
    h.vault.seed(`${ROOT}/新名字.md`, "原始内容");
    h.index.upsert(binding());
    await h.engine.sync();

    h.log.length = 0;
    await h.engine.sync();

    expect(h.log).toEqual([]);
  });

  it("records completion time and persists the index", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "# 一\n");

    await h.engine.sync();

    expect(h.engine.progress).toMatchObject({ running: false, phase: "idle", lastSyncAt: NOW });
    expect(h.storage.written).toHaveLength(1);
    expect(JSON.parse(h.storage.raw ?? "{}")).toMatchObject({ version: 1 });
  });

  it("does nothing at all while sync is switched off", async () => {
    const h = await createHarness({ syncEnabled: false });
    h.vault.seed(`${ROOT}/新笔记.md`, "# 新");
    const listAll = vi.spyOn(h.documents, "listAll");

    await h.engine.sync();

    expect(listAll).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);
    expect(h.index.bindings).toEqual([]);
  });

  it("coalesces a trigger arriving mid-round into a single follow-up", async () => {
    const h = await createHarness();
    h.documents.seed("ast_1", "笔记.md", "# 一\n");
    const listAll = vi.spyOn(h.documents, "listAll");

    const first = h.engine.sync();
    const second = h.engine.sync();
    await Promise.all([first, second]);

    expect(listAll).toHaveBeenCalledTimes(2);
    expect(h.engine.isRunning).toBe(false);
  });

  it("surfaces a fatal API error and stops the round", async () => {
    const h = await createHarness();
    vi.spyOn(h.documents, "listAll").mockRejectedValue(new Error("boom"));

    await h.engine.sync();

    expect(h.engine.progress.phase).toBe("error");
    expect(h.engine.progress.lastError).toContain("boom");
  });
});
