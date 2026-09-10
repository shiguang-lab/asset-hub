import { normalisePath, toRemotePath, toVaultPath } from "./path-mapper.js";
import type { LocalSnapshot, RemoteSnapshot, SyncAction, SyncBinding } from "./types.js";

export interface DifferOptions {
  syncRoot: string;
  /** When false, a file removed locally never removes the server document. */
  deleteRemoteOnLocalDelete: boolean;
  /** When false, a document removed on the server leaves the local file alone. */
  deleteLocalOnRemoteDelete: boolean;
}

export interface DifferInput {
  local: LocalSnapshot[];
  remote: RemoteSnapshot[];
  bindings: SyncBinding[];
  /**
   * Vault paths the plugin owns but must never upload, such as the conflict
   * copies it writes itself.
   */
  ignoredVaultPaths?: string[];
}

type Decision =
  | { kind: "settled"; binding: SyncBinding }
  | { kind: "in-sync"; binding: SyncBinding; remote: RemoteSnapshot }
  | { kind: "push-update"; binding: SyncBinding; local: LocalSnapshot; remote: RemoteSnapshot }
  | {
      kind: "pull";
      binding: SyncBinding;
      remote: RemoteSnapshot;
      previousVaultPath: string | null;
    }
  | { kind: "conflict"; binding: SyncBinding; remote: RemoteSnapshot }
  | { kind: "local-deleted"; binding: SyncBinding; remote: RemoteSnapshot }
  | { kind: "remote-deleted"; binding: SyncBinding; local: LocalSnapshot }
  | { kind: "orphan"; binding: SyncBinding; local: LocalSnapshot }
  | { kind: "gone"; binding: SyncBinding };

/**
 * Three-way comparison of vault, server and the last synced index.
 *
 * This is a pure decision function: it reports what each document needs, in no
 * particular order. Sequencing is the engine's job — it applies pulls before
 * pushes so that a push can never overwrite a remote change that arrived in the
 * same round (see docs/02-sync-design.md).
 */
export function planSync(input: DifferInput, options: DifferOptions): SyncAction[] {
  const localByPath = new Map(input.local.map((entry) => [normalisePath(entry.vaultPath), entry]));
  const remoteById = new Map(input.remote.map((entry) => [entry.remoteId, entry]));
  const boundVaultPaths = new Set(
    input.bindings.map((binding) => normalisePath(binding.vaultPath)),
  );
  const boundRemoteIds = new Set(input.bindings.map((binding) => binding.remoteId));

  const ignored = new Set((input.ignoredVaultPaths ?? []).map(normalisePath));
  const decisions = input.bindings.map((binding) =>
    binding.conflicted
      ? ({ kind: "settled", binding } satisfies Decision)
      : classify(binding, localByPath, remoteById),
  );
  const actions: SyncAction[] = [];

  // A file that vanished from one path and appeared at another is a rename, not
  // a delete plus a create. Matching on content avoids creating a duplicate
  // document on the server every time a note is moved.
  const consumedLocals = new Set<string>();
  /**
   * Remote documents already accounted for by a path collision. Without this,
   * the same document would also be pulled to the contested path — and that
   * pull runs before the conflict is recorded, overwriting the local file the
   * conflict existed to protect.
   */
  const consumedRemotes = new Set<string>();
  const renames = new Map<number, LocalSnapshot>();
  decisions.forEach((decision, index) => {
    if (decision.kind !== "local-deleted" || !decision.binding.baseHash) return;
    const candidate = input.local.find(
      (entry) =>
        !boundVaultPaths.has(normalisePath(entry.vaultPath)) &&
        !consumedLocals.has(normalisePath(entry.vaultPath)) &&
        !ignored.has(normalisePath(entry.vaultPath)) &&
        entry.hash === decision.binding.baseHash,
    );
    if (!candidate) return;
    consumedLocals.add(normalisePath(candidate.vaultPath));
    renames.set(index, candidate);
  });

  decisions.forEach((decision, index) => {
    switch (decision.kind) {
      case "settled":
      case "in-sync":
      case "gone":
        return;
      case "conflict":
        actions.push({
          kind: "conflict",
          remoteId: decision.binding.remoteId,
          vaultPath: decision.binding.vaultPath,
          remotePath: normalisePath(decision.remote.remotePath),
          baseVersion: decision.binding.remoteVersion,
          reason: "both-changed",
        });
        return;
      case "push-update":
        actions.push({
          kind: "push-update",
          remoteId: decision.binding.remoteId,
          vaultPath: decision.binding.vaultPath,
          remotePath: normalisePath(decision.remote.remotePath),
          baseVersion: decision.binding.remoteVersion,
        });
        return;
      case "pull":
        actions.push({
          kind: "pull",
          remoteId: decision.remote.remoteId,
          vaultPath: toVaultPath(decision.remote.remotePath, options.syncRoot),
          remotePath: normalisePath(decision.remote.remotePath),
          remoteVersion: decision.remote.version,
          previousVaultPath: decision.previousVaultPath,
        });
        return;
      case "orphan":
        actions.push({
          kind: "orphan",
          vaultPath: decision.binding.vaultPath,
          remoteId: decision.binding.remoteId,
        });
        return;
      case "remote-deleted":
        if (options.deleteLocalOnRemoteDelete) {
          actions.push({ kind: "delete-local", vaultPath: decision.binding.vaultPath });
        } else {
          actions.push({
            kind: "forget",
            vaultPath: decision.binding.vaultPath,
            reason: "remote-delete-kept-local",
          });
        }
        return;
      case "local-deleted": {
        const renamed = renames.get(index);
        if (renamed) {
          const remotePath = toRemotePath(renamed.vaultPath, options.syncRoot);
          if (remotePath) {
            actions.push({
              kind: "push-move",
              remoteId: decision.binding.remoteId,
              vaultPath: renamed.vaultPath,
              remotePath,
              baseVersion: decision.binding.remoteVersion,
            });
            return;
          }
        }
        if (options.deleteRemoteOnLocalDelete) {
          actions.push({
            kind: "delete-remote",
            remoteId: decision.binding.remoteId,
            baseVersion: decision.binding.remoteVersion,
          });
        } else {
          actions.push({
            kind: "forget",
            vaultPath: decision.binding.vaultPath,
            reason: "local-delete-kept-remote",
          });
        }
        return;
      }
    }
  });

  for (const entry of input.local) {
    const path = normalisePath(entry.vaultPath);
    if (boundVaultPaths.has(path) || consumedLocals.has(path) || ignored.has(path)) continue;
    const remotePath = toRemotePath(entry.vaultPath, options.syncRoot);
    if (!remotePath) continue;
    // A file the vault already holds must not be overwritten by an unrelated
    // server document that happens to claim the same path.
    const claimed = input.remote.find(
      (candidate) =>
        !boundRemoteIds.has(candidate.remoteId) &&
        toVaultPath(candidate.remotePath, options.syncRoot) === path,
    );
    if (claimed) {
      consumedRemotes.add(claimed.remoteId);
      actions.push({
        kind: "conflict",
        remoteId: claimed.remoteId,
        vaultPath: entry.vaultPath,
        remotePath: normalisePath(claimed.remotePath),
        baseVersion: claimed.version,
        reason: "path-collision",
      });
      continue;
    }
    actions.push({ kind: "push-create", vaultPath: entry.vaultPath, remotePath });
  }

  for (const entry of input.remote) {
    if (boundRemoteIds.has(entry.remoteId) || consumedRemotes.has(entry.remoteId)) continue;
    if (!normalisePath(entry.remotePath)) continue;
    actions.push({
      kind: "pull",
      remoteId: entry.remoteId,
      vaultPath: toVaultPath(entry.remotePath, options.syncRoot),
      remotePath: normalisePath(entry.remotePath),
      remoteVersion: entry.version,
      previousVaultPath: null,
    });
  }

  return actions;
}

function classify(
  binding: SyncBinding,
  localByPath: Map<string, LocalSnapshot>,
  remoteById: Map<string, RemoteSnapshot>,
): Decision {
  const local = localByPath.get(normalisePath(binding.vaultPath)) ?? null;
  const remote = remoteById.get(binding.remoteId) ?? null;

  if (remote === null) {
    if (local === null) return { kind: "gone", binding };
    // The file changed locally after the server copy disappeared. Keep the
    // local file: it is the only surviving copy of that edit.
    return local.hash !== binding.baseHash
      ? { kind: "orphan", binding, local }
      : { kind: "remote-deleted", binding, local };
  }
  if (local === null) {
    return { kind: "local-deleted", binding, remote };
  }

  const moved = normalisePath(remote.remotePath) !== normalisePath(binding.remotePath);
  if (moved) {
    return { kind: "pull", binding, remote, previousVaultPath: binding.vaultPath };
  }

  // Both sides still match the state the index recorded, so neither has moved.
  const localChanged = local.hash !== binding.baseHash;
  const remoteChanged = remote.version !== binding.remoteVersion;
  if (!localChanged && !remoteChanged) return { kind: "in-sync", binding, remote };
  if (localChanged && remoteChanged) return { kind: "conflict", binding, remote };
  if (localChanged) return { kind: "push-update", binding, local, remote };
  // Reached when the local file matches the last synced content but the server
  // holds something else: the server is authoritative and there is no local
  // edit to lose.
  return { kind: "pull", binding, remote, previousVaultPath: null };
}
