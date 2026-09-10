import { describe, expect, it } from "vitest";
import { silentLogger } from "../logger.js";
import { MemoryIndexStorage } from "../test/memory-index-storage.js";
import { SyncIndexStore } from "./index-store.js";
import type { SyncBinding } from "./types.js";

function binding(over: Partial<SyncBinding> = {}): SyncBinding {
  return {
    remoteId: "ast_1",
    vaultPath: "资产中心/笔记.md",
    remotePath: "笔记.md",
    baseHash: "sha256:aaaa",
    remoteVersion: 1,
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...over,
  };
}

describe("SyncIndexStore", () => {
  it("starts empty when nothing has been persisted", async () => {
    const store = new SyncIndexStore(new MemoryIndexStorage(), silentLogger);
    await store.load();
    expect(store.bindings).toEqual([]);
    expect(store.ignored).toEqual([]);
  });

  it("round-trips bindings through storage", async () => {
    const storage = new MemoryIndexStorage();
    const store = new SyncIndexStore(storage, silentLogger);
    await store.load();
    store.upsert(binding());
    await store.save();

    const reloaded = new SyncIndexStore(storage, silentLogger);
    await reloaded.load();
    expect(reloaded.find("资产中心/笔记.md")).toEqual(binding());
  });

  it("only writes when something changed", async () => {
    const storage = new MemoryIndexStorage();
    const store = new SyncIndexStore(storage, silentLogger);
    await store.load();
    await store.save();
    expect(storage.written).toHaveLength(0);

    store.remove("资产中心/笔记.md");
    await store.save();
    expect(storage.written).toHaveLength(1);
  });

  it("replaces an existing binding for the same vault path", async () => {
    const store = new SyncIndexStore(new MemoryIndexStorage(), silentLogger);
    await store.load();
    store.upsert(binding());
    store.upsert(binding({ remoteVersion: 7 }));
    expect(store.bindings).toHaveLength(1);
    expect(store.bindings[0]?.remoteVersion).toBe(7);
  });

  it("quarantines an unreadable index instead of refusing to start", async () => {
    const storage = new MemoryIndexStorage();
    storage.raw = "{ not json";
    const store = new SyncIndexStore(storage, silentLogger);
    await store.load();
    expect(store.bindings).toEqual([]);
    expect(storage.backups).toEqual(["{ not json"]);
  });

  it("rejects an index written by a future version", async () => {
    const storage = new MemoryIndexStorage();
    storage.raw = JSON.stringify({ version: 2, bindings: [] });
    const store = new SyncIndexStore(storage, silentLogger);
    await store.load();
    expect(store.bindings).toEqual([]);
    expect(storage.backups).toHaveLength(1);
  });

  it("clears the conflict markers when a binding settles", async () => {
    const store = new SyncIndexStore(new MemoryIndexStorage(), silentLogger);
    await store.load();
    store.upsert(binding({ conflicted: true, conflictCopy: "资产中心/笔记 (冲突).md" }));
    store.settle("资产中心/笔记.md", { remoteVersion: 2 });

    const settled = store.find("资产中心/笔记.md");
    expect(settled?.conflicted).toBeUndefined();
    expect(settled?.conflictCopy).toBeUndefined();
    expect(settled?.remoteVersion).toBe(2);
  });

  it("lists only conflicted bindings", async () => {
    const store = new SyncIndexStore(new MemoryIndexStorage(), silentLogger);
    await store.load();
    store.upsert(binding());
    store.upsert(binding({ vaultPath: "资产中心/另一篇.md", conflicted: true }));
    expect(store.conflicted().map((entry) => entry.vaultPath)).toEqual(["资产中心/另一篇.md"]);
  });

  it("tracks ignored paths without duplicates", async () => {
    const store = new SyncIndexStore(new MemoryIndexStorage(), silentLogger);
    await store.load();
    store.ignore("资产中心/副本.md");
    store.ignore("资产中心/副本.md");
    expect(store.ignored).toEqual(["资产中心/副本.md"]);
    store.unignore("资产中心/副本.md");
    expect(store.ignored).toEqual([]);
  });

  it("persists a reset so the next load starts clean", async () => {
    const storage = new MemoryIndexStorage();
    const store = new SyncIndexStore(storage, silentLogger);
    await store.load();
    store.upsert(binding());
    await store.save();
    await store.reset();

    const reloaded = new SyncIndexStore(storage, silentLogger);
    await reloaded.load();
    expect(reloaded.bindings).toEqual([]);
  });
});
