const EXTENSION = /(\.[A-Za-z0-9]+)$/;

/**
 * Names the sibling file that preserves the version we refused to overwrite.
 *
 * The timestamp is local and to the second so two conflict copies for the same
 * document created in quick succession do not collide.
 */
export function conflictCopyPath(vaultPath: string, now: Date): string {
  const stamp = [
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  ].join(" ");
  const match = EXTENSION.exec(vaultPath);
  if (!match) return `${vaultPath} (冲突 ${stamp})`;
  const suffix = match[1] ?? "";
  return `${vaultPath.slice(0, vaultPath.length - suffix.length)} (冲突 ${stamp})${suffix}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
