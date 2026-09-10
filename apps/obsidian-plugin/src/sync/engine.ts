import { ApiError, describe } from "../api/client.js";
import type { DocumentsApi, RemoteDocument } from "../api/documents.js";
import type { Logger } from "../logger.js";
import type { VaultAdapter } from "../obsidian/vault-adapter.js";
import type { PluginSettings } from "../settings.js";
import { conflictCopyPath } from "./conflict.js";
import { planSync } from "./differ.js";
import { contentHash, normaliseContent } from "./hash.js";
import type { SyncIndexStore } from "./index-store.js";
import { normalisePath, titleForPath, toVaultPath } from "./path-mapper.js";
import type {
  LocalSnapshot,
  RemoteSnapshot,
  SyncAction,
  SyncActionKind,
  SyncBinding,
} from "./types.js";

export type SyncPhase = "idle" | "scanning" | "pulling" | "pushing" | "error";

export interface SyncProgress {
  running: boolean;
  phase: SyncPhase;
  completed: number;
  total: number;
  lastSyncAt: number | null;
  lastError: string | null;
  conflicts: number;
}

export type NoticeLevel = "info" | "warn" | "error";

export interface SyncEngineDeps {
  vault: VaultAdapter;
  documents: DocumentsApi;
  index: SyncIndexStore;
  settings: () => PluginSettings;
  logger: Logger;
  onProgress: (progress: SyncProgress) => void;
  onNotice: (message: string, level: NoticeLevel) => void;
  now?: () => number;
}

/**
 * Pull-before-push is a correctness requirement, not a preference: pushing
 * first would raise the server's lock version, and the subsequent pull would
 * then overwrite the vault with content the user never saw.
 */
function applyOrder(kind: SyncActionKind): number {
  switch (kind) {
    case "pull":
      return 0;
    case "conflict":
      return 1;
    case "push-move":
    case "push-update":
      return 2;
    case "push-create":
      return 3;
    case "delete-local":
    case "delete-remote":
      return 4;
    case "forget":
    case "orphan":
      return 5;
  }
}

export class SyncEngine {
  #running = false;
  #pending = false;
  #progress: SyncProgress = {
    running: false,
    phase: "idle",
    completed: 0,
    total: 0,
    lastSyncAt: null,
    lastError: null,
    conflicts: 0,
  };
  /** Hash cache keyed by path, invalidated by mtime. */
  #hashes = new Map<string, { mtime: number; hash: string }>();

  constructor(private readonly deps: SyncEngineDeps) {}

  get progress(): SyncProgress {
    return this.#progress;
  }

  get isRunning(): boolean {
    return this.#running;
  }

  /** Runs a full reconcile round. Concurrent calls coalesce into one follow-up. */
  async sync(): Promise<void> {
    if (this.#running) {
      this.#pending = true;
      return;
    }
    this.#running = true;
    this.#pending = false;
    this.#publish({ running: true, phase: "scanning", completed: 0, total: 0, lastError: null });
    try {
      await this.#runOnce();
      this.#publish({
        running: false,
        phase: "idle",
        lastSyncAt: this.now(),
        conflicts: this.#conflictCount(),
      });
    } catch (error) {
      this.deps.logger.error("sync round failed", error);
      this.#publish({ running: false, phase: "error", lastError: describe(error) });
      if (error instanceof ApiError && error.isForbidden) {
        this.deps.onNotice("缺少写入权限，请重新登录并授权。", "error");
      } else if (!(error instanceof ApiError && (error.isTransient || error.isConflict))) {
        // Network flapping and optimistic-lock races resolve themselves; only
        // failures the user has to act on are surfaced.
        this.deps.onNotice(`同步失败：${describe(error)}`, "error");
      }
    } finally {
      this.#running = false;
      await this.deps.index.save().catch((error) => {
        this.deps.logger.error("persisting sync index failed", error);
      });
      if (this.#pending) {
        this.#pending = false;
        await this.sync();
      }
    }
  }

  /** Drops the cached hashes so the next round re-reads every file. */
  invalidateHashes(): void {
    this.#hashes.clear();
  }

  /**
   * Resolves a recorded conflict. The losing version's conflict copy is removed
   * either way: the user has made an explicit decision and the copy is exactly
   * what they chose to discard.
   */
  async resolveConflict(vaultPath: string, choice: "keep-local" | "keep-remote"): Promise<void> {
    const binding = this.deps.index.find(vaultPath);
    if (!binding?.conflicted) throw new Error("该文档当前没有待解决的冲突");

    if (choice === "keep-local") {
      const text = await this.deps.vault.read(vaultPath);
      const normalised = normaliseContent(text);
      const remote = await this.deps.documents.update({
        remoteId: binding.remoteId,
        remotePath: normalisePath(binding.remotePath),
        title: titleForPath(binding.remotePath),
        text: normalised,
        baseVersion: binding.remoteVersion,
      });
      this.#bind(binding.vaultPath, remote, contentHash(normalised));
    } else {
      const content = await this.deps.documents.fetchContent(binding.remoteId);
      const normalised = normaliseContent(content.text);
      await this.deps.vault.write(vaultPath, normalised);
      this.#hashes.delete(vaultPath);
      this.deps.index.settle(vaultPath, {
        remotePath: normalisePath(binding.remotePath),
        remoteVersion: binding.remoteVersion,
        baseHash: contentHash(normalised),
      });
    }
    await this.#discardConflictCopy(binding);
    await this.deps.index.save();
  }

  async #runOnce(): Promise<void> {
    const settings = this.deps.settings();
    if (!settings.syncEnabled) return;

    const local = await this.#scanLocal(settings);
    const remote = await this.#scanRemote();

    const actions = planSync(
      {
        local,
        remote,
        bindings: this.deps.index.bindings,
        ignoredVaultPaths: this.deps.index.ignored,
      },
      {
        syncRoot: settings.syncRoot,
        deleteRemoteOnLocalDelete: settings.deleteRemoteOnLocalDelete,
        deleteLocalOnRemoteDelete: settings.deleteLocalOnRemoteDelete,
      },
    );
    if (actions.length === 0) return;

    actions.sort((left, right) => applyOrder(left.kind) - applyOrder(right.kind));
    this.#publish({ total: actions.length, completed: 0 });

    const failures: string[] = [];
    for (const action of actions) {
      try {
        await this.#apply(action, settings);
      } catch (error) {
        const message = `${describeAction(action)}：${describe(error)}`;
        failures.push(message);
        this.deps.logger.error("sync action failed", message, error);
        if (error instanceof ApiError && (error.isConflict || error.isUnauthorized)) throw error;
      }
      this.#publish({ completed: this.#progress.completed + 1 });
    }

    if (failures.length > 0) {
      this.deps.onNotice(`${failures.length} 项同步操作失败，详见控制台。`, "warn");
    }
  }

  async #scanLocal(settings: PluginSettings): Promise<LocalSnapshot[]> {
    const root = normalisePath(settings.syncRoot);
    if (!(await this.deps.vault.exists(root))) return [];
    const entries = await this.deps.vault.list(root);
    const snapshots: LocalSnapshot[] = [];
    for (const entry of entries) {
      if (!/\.md$/i.test(entry.path)) continue;
      const path = normalisePath(entry.path);
      const cached = this.#hashes.get(path);
      if (cached && cached.mtime === entry.mtime) {
        snapshots.push({ vaultPath: path, hash: cached.hash, mtime: entry.mtime });
        continue;
      }
      try {
        const hash = contentHash(await this.deps.vault.read(path));
        this.#hashes.set(path, { mtime: entry.mtime, hash });
        snapshots.push({ vaultPath: path, hash, mtime: entry.mtime });
      } catch (error) {
        this.deps.logger.warn(`unreadable file skipped: ${path}`, error);
      }
    }
    return snapshots;
  }

  async #scanRemote(): Promise<RemoteSnapshot[]> {
    const documents = await this.deps.documents.listAll();
    return documents
      .filter((document) => normalisePath(document.remotePath) !== "")
      .map((document) => ({
        remoteId: document.remoteId,
        remotePath: normalisePath(document.remotePath),
        version: document.version,
        updatedAt: document.updatedAt,
      }));
  }

  async #apply(action: SyncAction, settings: PluginSettings): Promise<void> {
    switch (action.kind) {
      case "pull":
        return await this.#pull(
          action.remoteId,
          action.remotePath,
          action.vaultPath || toVaultPath(action.remotePath, settings.syncRoot),
          action.remoteVersion,
          action.previousVaultPath,
        );
      case "push-create":
        return await this.#pushCreate(action.vaultPath, action.remotePath);
      case "push-update":
        return await this.#pushUpdate(
          action.remoteId,
          action.vaultPath,
          action.remotePath,
          action.baseVersion,
        );
      case "push-move":
        return await this.#pushMove(
          action.remoteId,
          action.vaultPath,
          action.remotePath,
          action.baseVersion,
        );
      case "delete-remote":
        await this.deps.documents.remove({
          remoteId: action.remoteId,
          baseVersion: action.baseVersion,
        });
        this.#forgetByRemoteId(action.remoteId);
        return;
      case "delete-local":
        await this.deps.vault.trash(action.vaultPath);
        this.deps.index.remove(action.vaultPath);
        this.#hashes.delete(action.vaultPath);
        return;
      case "conflict":
        return await this.#recordConflict(action);
      case "orphan":
        this.deps.index.remove(action.vaultPath);
        this.deps.onNotice(
          `云端已删除「${action.vaultPath}」，但本地仍有未同步的修改，已保留本地文件。`,
          "warn",
        );
        return;
      case "forget":
        this.deps.index.remove(action.vaultPath);
        return;
    }
  }

  async #pull(
    remoteId: string,
    remotePath: string,
    vaultPath: string,
    remoteVersion: number,
    previousVaultPath: string | null,
  ): Promise<void> {
    const content = await this.deps.documents.fetchContent(remoteId);
    const text = normaliseContent(content.text);
    const hash = contentHash(text);
    if (content.contentHash && content.contentHash !== hash) {
      // Surfaced rather than hidden: a mismatch means the two sides disagree
      // about how content is hashed and the index would never settle.
      this.deps.logger.warn(
        `content hash mismatch for ${remotePath}: server=${content.contentHash} local=${hash}`,
      );
    }
    await this.deps.vault.write(vaultPath, text);
    // The vault decides the file's mtime, so the cache entry is dropped rather
    // than guessed; the next scan re-reads once and records the real mtime.
    this.#hashes.delete(vaultPath);
    if (previousVaultPath && normalisePath(previousVaultPath) !== vaultPath) {
      await this.deps.vault.trash(previousVaultPath);
      this.deps.index.remove(previousVaultPath);
      this.#hashes.delete(previousVaultPath);
    }
    this.deps.index.upsert({
      remoteId,
      vaultPath,
      remotePath,
      baseHash: hash,
      remoteVersion,
      updatedAt: new Date(this.now()).toISOString(),
    });
  }

  async #pushCreate(vaultPath: string, remotePath: string): Promise<void> {
    const text = normaliseContent(await this.deps.vault.read(vaultPath));
    const created = await this.deps.documents.create({
      remotePath,
      title: titleForPath(remotePath),
      text,
    });
    this.#bind(vaultPath, created, contentHash(text));
  }

  async #pushUpdate(
    remoteId: string,
    vaultPath: string,
    remotePath: string,
    baseVersion: number,
  ): Promise<void> {
    const text = normaliseContent(await this.deps.vault.read(vaultPath));
    const updated = await this.deps.documents.update({
      remoteId,
      remotePath,
      title: titleForPath(remotePath),
      text,
      baseVersion,
    });
    this.#bind(vaultPath, updated, contentHash(text));
  }

  async #pushMove(
    remoteId: string,
    vaultPath: string,
    remotePath: string,
    baseVersion: number,
  ): Promise<void> {
    const previous = this.deps.index.bindings.find((entry) => entry.remoteId === remoteId);
    const moved = await this.deps.documents.move({
      remoteId,
      remotePath,
      title: titleForPath(remotePath),
      baseVersion,
    });
    // Bindings are keyed by vault path, so the record has to move with the file.
    // Leaving the old one behind would make the next round see a missing file
    // and an unbound one, and re-upload the document as a second copy.
    this.#forgetByRemoteId(remoteId);
    this.deps.index.upsert({
      remoteId: moved.remoteId,
      vaultPath,
      remotePath: normalisePath(moved.remotePath),
      // A move is detected by matching the file's content against the index, so
      // the recorded base hash still holds; the read is a guard, not the norm.
      baseHash:
        previous?.baseHash ?? contentHash(normaliseContent(await this.deps.vault.read(vaultPath))),
      remoteVersion: moved.version,
      updatedAt: moved.updatedAt,
    });
  }

  /**
   * Records a conflict without choosing a winner. The remote version is written
   * to a sibling copy so nothing is lost, and the binding is parked until the
   * user decides.
   *
   * Two sides holding identical content is not a disagreement, whatever the
   * version numbers say — that is the everyday shape of a rebuilt index, so the
   * document is simply re-adopted and the round stays quiet.
   */
  async #recordConflict(action: Extract<SyncAction, { kind: "conflict" }>): Promise<void> {
    const content = await this.deps.documents.fetchContent(action.remoteId);
    const text = normaliseContent(content.text);
    const remoteHash = contentHash(text);
    const localHash =
      this.#hashes.get(action.vaultPath)?.hash ??
      contentHash(await this.deps.vault.read(action.vaultPath));
    if (localHash === remoteHash) {
      this.deps.index.upsert({
        remoteId: action.remoteId,
        vaultPath: action.vaultPath,
        remotePath: normalisePath(action.remotePath),
        baseHash: localHash,
        remoteVersion: action.baseVersion,
        updatedAt: new Date(this.now()).toISOString(),
      });
      return;
    }

    // The copy holds the version that would otherwise be lost.
    const remotePath = normalisePath(action.remotePath);
    const copyPath = conflictCopyPath(action.vaultPath, new Date(this.now()));
    await this.deps.vault.write(copyPath, text);
    this.deps.index.ignore(copyPath);
    if (this.deps.index.find(action.vaultPath)) {
      this.deps.index.patch(action.vaultPath, {
        conflicted: true,
        conflictCopy: copyPath,
        remoteVersion: action.baseVersion,
        remotePath,
      });
    } else {
      // Path collision: nothing is bound to this path yet, so the conflict has
      // to create the binding rather than amend it.
      this.deps.index.upsert({
        remoteId: action.remoteId,
        vaultPath: action.vaultPath,
        remotePath,
        baseHash: localHash,
        remoteVersion: action.baseVersion,
        updatedAt: new Date(this.now()).toISOString(),
        conflicted: true,
        conflictCopy: copyPath,
      });
    }
    this.deps.onNotice(
      `「${action.vaultPath}」存在冲突，已在同目录生成副本，请在面板中裁决。`,
      "warn",
    );
  }

  async #discardConflictCopy(binding: SyncBinding): Promise<void> {
    if (binding.conflictCopy) {
      await this.deps.vault.trash(binding.conflictCopy);
      this.deps.index.unignore(binding.conflictCopy);
    }
    this.deps.index.settle(binding.vaultPath);
  }

  #bind(vaultPath: string, remote: RemoteDocument, hash: string): void {
    this.deps.index.upsert({
      remoteId: remote.remoteId,
      vaultPath,
      remotePath: normalisePath(remote.remotePath),
      baseHash: hash,
      remoteVersion: remote.version,
      updatedAt: remote.updatedAt,
    });
  }

  #forgetByRemoteId(remoteId: string): void {
    const binding = this.deps.index.bindings.find((entry) => entry.remoteId === remoteId);
    if (binding) {
      this.deps.index.remove(binding.vaultPath);
      this.#hashes.delete(binding.vaultPath);
    }
  }

  #conflictCount(): number {
    return this.deps.index.conflicted().length;
  }

  #publish(changes: Partial<SyncProgress>): void {
    this.#progress = { ...this.#progress, ...changes };
    this.deps.onProgress(this.#progress);
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

function describeAction(action: SyncAction): string {
  const target =
    "vaultPath" in action ? action.vaultPath : "remotePath" in action ? action.remotePath : "";
  return `${action.kind} ${target}`.trim();
}
