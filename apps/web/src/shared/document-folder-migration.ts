/**
 * 历史本地目录数据的一次性迁移。
 *
 * 目录树曾经只存在于 Web 端 localStorage（目录定义 + 文档归属两张表），
 * 现在服务端 `asset.path` 才是唯一真源。这份模块负责把用户原有归属换算成
 * `path`，让改造不是静默丢数据。
 */

import { joinFolderPath, leafFromTitle, normalizeFolderPath } from "./document-path.js";

const LEGACY_FOLDERS_KEY = "shiguang.document-folders";
const LEGACY_ASSIGNMENTS_KEY = "shiguang.document-folder-assignments";

/** 旧模型里表示「不属于任何目录」。 */
const LEGACY_ROOT_FOLDER_ID = "root";

export interface LegacyPathUpdate {
  id: string;
  path: string;
}

export interface LegacyFolderMigration {
  /** 需要写入服务端的文档路径。 */
  updates: LegacyPathUpdate[];
  /** 迁移成功后应清除的 localStorage 键。 */
  keys: string[];
}

interface LegacyFolder {
  id: string;
  name: string;
  parentId: string | null;
}

function readLegacyFolders(storage: Pick<Storage, "getItem">): LegacyFolder[] {
  try {
    const parsed = JSON.parse(storage.getItem(LEGACY_FOLDERS_KEY) ?? "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((folder): LegacyFolder[] => {
      if (!folder || typeof folder.id !== "string" || typeof folder.name !== "string") return [];
      return [
        {
          id: folder.id,
          name: folder.name,
          parentId: typeof folder.parentId === "string" ? folder.parentId : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

function readLegacyAssignments(storage: Pick<Storage, "getItem">): Record<string, string> {
  try {
    const parsed = JSON.parse(storage.getItem(LEGACY_ASSIGNMENTS_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const assignments: Record<string, string> = {};
    for (const [documentId, folderId] of Object.entries(parsed)) {
      if (typeof folderId === "string" && folderId) assignments[documentId] = folderId;
    }
    return assignments;
  } catch {
    return {};
  }
}

/** 把旧目录 id 还原成完整目录路径；链断了就退化成该目录自己的名字。 */
function legacyFolderPaths(folders: readonly LegacyFolder[]): Map<string, string> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const resolved = new Map<string, string>();
  for (const folder of folders) {
    const names: string[] = [];
    const visited = new Set<string>();
    let current: LegacyFolder | undefined = folder;
    while (current && !visited.has(current.id)) {
      names.unshift(current.name);
      visited.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    resolved.set(folder.id, normalizeFolderPath(names.join("/")));
  }
  return resolved;
}

/**
 * 读出可迁移的旧目录归属。无可迁移内容时返回 null。
 *
 * 只在文档全部没有服务端路径时才提示迁移：一旦服务端已有目录数据，说明这份
 * 本地数据要么已经迁过，要么已被更新的事实取代，此时再写回只会造成冲突。
 */
export function readLegacyFolderMigration(
  storage: Pick<Storage, "getItem">,
  assets: readonly { id: string; title: string; path?: string | null }[],
): LegacyFolderMigration | null {
  if (assets.some((asset) => normalizeFolderPath(asset.path ?? "") !== "")) return null;
  const assignments = readLegacyAssignments(storage);
  if (Object.keys(assignments).length === 0) return null;

  const folderPaths = legacyFolderPaths(readLegacyFolders(storage));
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const updates: LegacyPathUpdate[] = [];

  for (const [documentId, folderId] of Object.entries(assignments)) {
    if (folderId === LEGACY_ROOT_FOLDER_ID) continue;
    const asset = byId.get(documentId);
    const folderPath = folderPaths.get(folderId);
    if (!asset || !folderPath) continue;
    const leaf = leafFromTitle(asset.title);
    if (!leaf) continue;
    updates.push({ id: documentId, path: joinFolderPath(folderPath, leaf) });
  }

  if (updates.length === 0) return null;
  return { updates, keys: [LEGACY_FOLDERS_KEY, LEGACY_ASSIGNMENTS_KEY] };
}

/** 旧数据里出现过的目录，仅用于向用户说明将要迁移的规模。 */
export function legacyFolderNames(storage: Pick<Storage, "getItem">): string[] {
  return [...legacyFolderPaths(readLegacyFolders(storage)).values()].filter((path) => path !== "");
}
