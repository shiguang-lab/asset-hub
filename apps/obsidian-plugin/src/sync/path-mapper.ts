/**
 * Translates between server document paths and vault paths.
 *
 * Paths are normalised to NFC everywhere. macOS hands out NFD for filenames, so
 * without this the same 「产品」 folder would be stored under two different
 * server paths depending on which machine synced first.
 */
export function normalisePath(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

export function isMarkdownPath(path: string): boolean {
  return /\.md$/i.test(path);
}

export function isSyncablePath(path: string, includeHtml: boolean): boolean {
  if (isMarkdownPath(path)) return true;
  return includeHtml && /\.html?$/i.test(path);
}

/** Vault path → server path, or null when the file is outside the sync root. */
export function toRemotePath(vaultPath: string, syncRoot: string): string | null {
  const root = normalisePath(syncRoot);
  const path = normalisePath(vaultPath);
  if (!root) return path || null;
  if (path === root) return null;
  if (!path.startsWith(`${root}/`)) return null;
  const relative = path.slice(root.length + 1);
  return relative === "" ? null : relative;
}

/** Server path → vault path, inside the sync root. */
export function toVaultPath(remotePath: string, syncRoot: string): string {
  const root = normalisePath(syncRoot);
  const path = normalisePath(remotePath);
  if (!root) return path;
  return path ? `${root}/${path}` : root;
}

/** The document title shown in the asset hub, derived from the file name. */
export function titleForPath(remotePath: string): string {
  const base = normalisePath(remotePath).split("/").pop() ?? remotePath;
  return base.replace(/\.(md|html?)$/i, "");
}
