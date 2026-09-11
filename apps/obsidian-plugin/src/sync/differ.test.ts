import { describe, expect, it } from "vitest";
import { type DifferOptions, planSync } from "./differ.js";
import type { LocalSnapshot, RemoteSnapshot, SyncAction, SyncBinding } from "./types.js";

const HASH_A = "sha256:aaaa";
const HASH_B = "sha256:bbbb";
const HASH_C = "sha256:cccc";

const OPTIONS: DifferOptions = {
  syncRoot: "资产中心",
  deleteRemoteOnLocalDelete: false,
  deleteLocalOnRemoteDelete: true,
};

function local(vaultPath: string, hash: string): LocalSnapshot {
  return { vaultPath, hash, mtime: 1 };
}

function remote(remoteId: string, remotePath: string, version: number): RemoteSnapshot {
  return { remoteId, remotePath, version, updatedAt: "2026-09-10T00:00:00.000Z" };
}

function binding(over: Partial<SyncBinding> = {}): SyncBinding {
  return {
    remoteId: "ast_1",
    vaultPath: "资产中心/笔记.md",
    remotePath: "笔记.md",
    baseHash: HASH_A,
    remoteVersion: 1,
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...over,
  };
}

function kinds(actions: SyncAction[]): string[] {
  return actions.map((action) => action.kind);
}

describe("planSync", () => {
  it("ignores unbound local and remote documents in per-document mode", () => {
    const actions = planSync(
      {
        local: [local("任意目录/同名.md", HASH_A)],
        remote: [remote("ast_2", "目标目录/同名.md", 1)],
        bindings: [],
      },
      { ...OPTIONS, associationsOnly: true },
    );
    expect(actions).toEqual([]);
  });

  it("keeps a bound local path when the remote document is renamed", () => {
    const actions = planSync(
      {
        local: [local("本地/笔记.md", HASH_A)],
        remote: [remote("ast_1", "云端/新名字.md", 2)],
        bindings: [binding({ vaultPath: "本地/笔记.md" })],
      },
      { ...OPTIONS, associationsOnly: true },
    );
    expect(actions[0]).toMatchObject({ kind: "pull", vaultPath: "本地/笔记.md" });
  });

  it("creates a remote document for an unbound local file", () => {
    const actions = planSync(
      { local: [local("资产中心/新笔记.md", HASH_A)], remote: [], bindings: [] },
      OPTIONS,
    );
    expect(actions).toEqual([
      { kind: "push-create", vaultPath: "资产中心/新笔记.md", remotePath: "新笔记.md" },
    ]);
  });

  it("does not upload files outside the sync root", () => {
    const actions = planSync(
      { local: [local("日记/今天.md", HASH_A)], remote: [], bindings: [] },
      OPTIONS,
    );
    expect(actions).toEqual([]);
  });

  it("pulls an unbound remote document into the sync root", () => {
    const actions = planSync(
      { local: [], remote: [remote("ast_9", "产品/周报.md", 3)], bindings: [] },
      OPTIONS,
    );
    expect(actions).toEqual([
      {
        kind: "pull",
        remoteId: "ast_9",
        remotePath: "产品/周报.md",
        vaultPath: "资产中心/产品/周报.md",
        remoteVersion: 3,
        previousVaultPath: null,
      },
    ]);
  });

  it("takes no action when both sides still match the index", () => {
    const actions = planSync(
      {
        local: [local("资产中心/笔记.md", HASH_A)],
        remote: [remote("ast_1", "笔记.md", 1)],
        bindings: [binding()],
      },
      OPTIONS,
    );
    expect(actions).toEqual([]);
  });

  it("asks for a download only when the server version actually moved", () => {
    // The remote snapshot carries no content hash, so an idle round has to be
    // decided purely from the index — a pull here would rewrite every file on
    // every timer tick and keep the watcher awake.
    const idle = planSync(
      {
        local: [local("资产中心/笔记.md", HASH_A)],
        remote: [remote("ast_1", "笔记.md", 1)],
        bindings: [binding()],
      },
      OPTIONS,
    );
    const moved = planSync(
      {
        local: [local("资产中心/笔记.md", HASH_A)],
        remote: [remote("ast_1", "笔记.md", 2)],
        bindings: [binding()],
      },
      OPTIONS,
    );
    expect(kinds(idle)).toEqual([]);
    expect(kinds(moved)).toEqual(["pull"]);
  });

  it("pushes a local edit when the server is untouched", () => {
    const actions = planSync(
      {
        local: [local("资产中心/笔记.md", HASH_B)],
        remote: [remote("ast_1", "笔记.md", 1)],
        bindings: [binding()],
      },
      OPTIONS,
    );
    expect(actions).toEqual([
      {
        kind: "push-update",
        remoteId: "ast_1",
        vaultPath: "资产中心/笔记.md",
        remotePath: "笔记.md",
        baseVersion: 1,
      },
    ]);
  });

  it("reports a conflict when both sides changed", () => {
    const actions = planSync(
      {
        local: [local("资产中心/笔记.md", HASH_B)],
        remote: [remote("ast_1", "笔记.md", 2)],
        bindings: [binding()],
      },
      OPTIONS,
    );
    expect(actions).toEqual([
      {
        kind: "conflict",
        remoteId: "ast_1",
        vaultPath: "资产中心/笔记.md",
        remotePath: "笔记.md",
        baseVersion: 1,
        reason: "both-changed",
      },
    ]);
  });

  it("pulls over an unchanged local file when only the server moved on", () => {
    const actions = planSync(
      {
        local: [local("资产中心/笔记.md", HASH_A)],
        remote: [remote("ast_1", "笔记.md", 2)],
        bindings: [binding()],
      },
      OPTIONS,
    );
    expect(kinds(actions)).toEqual(["pull"]);
  });

  it("leaves a recorded conflict alone until the user decides", () => {
    const actions = planSync(
      {
        local: [local("资产中心/笔记.md", HASH_C)],
        remote: [remote("ast_1", "笔记.md", 5)],
        bindings: [binding({ conflicted: true, conflictCopy: "资产中心/笔记 (冲突 1).md" })],
      },
      OPTIONS,
    );
    expect(actions).toEqual([]);
  });

  it("treats a vanished file reappearing with the same content as a move", () => {
    const actions = planSync(
      {
        local: [local("资产中心/新目录/笔记.md", HASH_A)],
        remote: [remote("ast_1", "笔记.md", 1)],
        bindings: [binding()],
      },
      OPTIONS,
    );
    expect(actions).toEqual([
      {
        kind: "push-move",
        remoteId: "ast_1",
        vaultPath: "资产中心/新目录/笔记.md",
        remotePath: "新目录/笔记.md",
        baseVersion: 1,
      },
    ]);
  });

  it("keeps the remote document when a local delete must not propagate", () => {
    const actions = planSync(
      { local: [], remote: [remote("ast_1", "笔记.md", 1)], bindings: [binding()] },
      OPTIONS,
    );
    expect(actions).toEqual([
      { kind: "forget", vaultPath: "资产中心/笔记.md", reason: "local-delete-kept-remote" },
    ]);
  });

  it("deletes the remote document when local deletes propagate", () => {
    const actions = planSync(
      { local: [], remote: [remote("ast_1", "笔记.md", 1)], bindings: [binding()] },
      { ...OPTIONS, deleteRemoteOnLocalDelete: true },
    );
    expect(actions).toEqual([{ kind: "delete-remote", remoteId: "ast_1", baseVersion: 1 }]);
  });

  it("removes the local file when the server dropped the document", () => {
    const actions = planSync(
      { local: [local("资产中心/笔记.md", HASH_A)], remote: [], bindings: [binding()] },
      OPTIONS,
    );
    expect(actions).toEqual([{ kind: "delete-local", vaultPath: "资产中心/笔记.md" }]);
  });

  it("orphans a locally edited file whose remote copy disappeared", () => {
    const actions = planSync(
      { local: [local("资产中心/笔记.md", HASH_B)], remote: [], bindings: [binding()] },
      OPTIONS,
    );
    expect(actions).toEqual([{ kind: "orphan", vaultPath: "资产中心/笔记.md", remoteId: "ast_1" }]);
  });

  it("flags a path claimed by an unrelated remote document", () => {
    const actions = planSync(
      {
        local: [local("资产中心/笔记.md", HASH_A)],
        remote: [remote("ast_2", "笔记.md", 4)],
        bindings: [],
      },
      OPTIONS,
    );
    expect(actions).toEqual([
      {
        kind: "conflict",
        remoteId: "ast_2",
        vaultPath: "资产中心/笔记.md",
        remotePath: "笔记.md",
        baseVersion: 4,
        reason: "path-collision",
      },
    ]);
  });

  it("never uploads a path the plugin marked as ignored", () => {
    const actions = planSync(
      {
        local: [local("资产中心/笔记 (冲突 2026-09-10 153045).md", HASH_C)],
        remote: [],
        bindings: [],
        ignoredVaultPaths: ["资产中心/笔记 (冲突 2026-09-10 153045).md"],
      },
      OPTIONS,
    );
    expect(actions).toEqual([]);
  });

  it("follows a remote rename and cleans up the old file", () => {
    const actions = planSync(
      {
        local: [local("资产中心/旧.md", HASH_A)],
        remote: [remote("ast_1", "新.md", 2)],
        bindings: [binding({ vaultPath: "资产中心/旧.md", remotePath: "旧.md" })],
      },
      OPTIONS,
    );
    expect(actions).toEqual([
      {
        kind: "pull",
        remoteId: "ast_1",
        remotePath: "新.md",
        vaultPath: "资产中心/新.md",
        remoteVersion: 2,
        previousVaultPath: "资产中心/旧.md",
      },
    ]);
  });

  it("reports every side of a mixed round independently", () => {
    const actions = planSync(
      {
        local: [local("资产中心/新笔记.md", HASH_B)],
        remote: [remote("ast_9", "产品/周报.md", 1)],
        bindings: [],
      },
      OPTIONS,
    );
    expect(kinds(actions).sort()).toEqual(["pull", "push-create"]);
  });
});
