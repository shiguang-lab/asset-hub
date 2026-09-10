/** A document as it exists in the vault. */
export interface LocalSnapshot {
  vaultPath: string;
  /** `sha256:<hex>` over the file's normalised content. */
  hash: string;
  mtime: number;
}

/**
 * A document as it exists on the server.
 *
 * Deliberately carries no content hash: computing one would mean downloading
 * every document each round. Change detection is done against the index — the
 * state both sides last agreed on — which needs no content from the server.
 */
export interface RemoteSnapshot {
  remoteId: string;
  remotePath: string;
  /** Server-side optimistic lock version, bumped on every write. */
  version: number;
  updatedAt: string;
}

/**
 * The record of what was last known to be in sync for one document. Everything
 * the sync engine needs to distinguish "changed here" from "changed there".
 */
export interface SyncBinding {
  remoteId: string;
  vaultPath: string;
  remotePath: string;
  /** Hash observed at the last successful sync; null when never pulled. */
  baseHash: string | null;
  /** Remote version observed at the last successful sync. */
  remoteVersion: number;
  updatedAt: string;
  /**
   * Set once a genuine conflict has been recorded. A conflicted binding is left
   * alone by every subsequent round until the user decides which side wins —
   * choosing automatically would silently discard the other version.
   */
  conflicted?: boolean;
  /** The sibling file holding the version that lost the conflict. */
  conflictCopy?: string;
}

export interface SyncIndex {
  version: 1;
  bindings: SyncBinding[];
  /** Paths the plugin created itself (conflict copies) and must never upload. */
  ignored: string[];
}

export const EMPTY_INDEX: SyncIndex = { version: 1, bindings: [], ignored: [] };

export type ConflictReason = "both-changed" | "path-collision";

export type SyncActionKind = SyncAction["kind"];

export type SyncAction =
  | { kind: "push-create"; vaultPath: string; remotePath: string }
  | {
      kind: "push-update";
      remoteId: string;
      vaultPath: string;
      remotePath: string;
      baseVersion: number;
    }
  | {
      kind: "push-move";
      remoteId: string;
      vaultPath: string;
      remotePath: string;
      baseVersion: number;
    }
  | {
      kind: "pull";
      remoteId: string;
      remotePath: string;
      vaultPath: string;
      /** Remote lock version observed during the scan, recorded as the new base. */
      remoteVersion: number;
      /** Set when the document moved, so the old file can be removed. */
      previousVaultPath: string | null;
    }
  | { kind: "delete-remote"; remoteId: string; baseVersion: number }
  | { kind: "delete-local"; vaultPath: string }
  | {
      kind: "conflict";
      remoteId: string;
      vaultPath: string;
      remotePath: string;
      baseVersion: number;
      reason: ConflictReason;
    }
  /** Remote is gone but the local file has unsynced edits; the local file is kept. */
  | { kind: "orphan"; vaultPath: string; remoteId: string }
  | {
      kind: "forget";
      vaultPath: string;
      reason: "local-delete-kept-remote" | "remote-delete-kept-local" | "both-gone";
    };
