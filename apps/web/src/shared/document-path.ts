/**
 * 文档目录树 —— 服务端 `asset.path` 的投影。
 *
 * `path` 是文档在工作空间内的完整逻辑路径，**含末段文件名**（不含扩展名），
 * 例如 `产品/需求文档/Shiguang Lab 产品需求文档`；根目录文档只有一段，如 `README`；
 * 空字符串表示尚未归类。本模块把这条路径换算成目录树所需的全部形状，
 * 目录本身不是独立实体，因此没有可创建、可残留的空目录。
 */

export interface DocumentFolder {
  /** 目录完整路径，同时作为树的节点 id。 */
  id: string;
  /** 末段名称，用于展示。 */
  name: string;
  /** 父目录 id；根级目录为 null。 */
  parentId: string | null;
}

/** 目录树里表示「全部文档」的哨兵 id，不会与真实目录路径冲突。 */
export const ROOT_FOLDER_ID = "__root__";

/** 路径长度上限与 `assetPathSchema` 保持一致。 */
const MAX_PATH_LENGTH = 512;

/**
 * 规范化为服务端认可的目录路径：去首尾斜杠、丢弃空段与 `.`/`..` 段、统一 NFC。
 *
 * macOS 上传的中文路径是 NFD 分解形式，不统一会让同一个目录在服务端变成两条。
 */
export function normalizeFolderPath(raw: string): string {
  return raw
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .join("/")
    .normalize("NFC")
    .slice(0, MAX_PATH_LENGTH);
}

/** 文档所在目录的路径；根目录文档返回空串。 */
export function folderPathOf(path: string): string {
  const normalised = normalizeFolderPath(path);
  const index = normalised.lastIndexOf("/");
  return index === -1 ? "" : normalised.slice(0, index);
}

/** 文档的文件名（路径末段）；空路径返回空串。 */
export function fileNameOf(path: string): string {
  const normalised = normalizeFolderPath(path);
  const index = normalised.lastIndexOf("/");
  return index === -1 ? normalised : normalised.slice(index + 1);
}

/**
 * 由标题推导文件名，供尚无路径的文档首次归类时使用。
 * 标题里的斜杠会被替换掉，否则会被当成目录分隔符。
 */
export function leafFromTitle(title: string): string {
  return normalizeFolderPath(title.replaceAll("/", "-").replaceAll("\\", "-")).slice(0, 120);
}

/** 拼接目录与文件名，任一侧为空时退化为另一侧。 */
export function joinFolderPath(folderPath: string, leaf: string): string {
  const folder = normalizeFolderPath(folderPath);
  const name = normalizeFolderPath(leaf);
  if (!folder) return name;
  if (!name) return folder;
  return `${folder}/${name}`;
}

/** 把文档移动到目标目录，文件名保持不变。 */
export function moveToFolderPath(path: string, folderPath: string): string {
  return joinFolderPath(folderPath, fileNameOf(path));
}

/** 文档是否位于该目录之下（含各级子目录）；目录为空串表示「全部」。 */
export function isInFolder(path: string, folderPath: string): boolean {
  const folder = normalizeFolderPath(folderPath);
  if (!folder) return true;
  const normalised = normalizeFolderPath(path);
  return normalised === folder || normalised.startsWith(`${folder}/`);
}

/**
 * 目录重命名或移动后，文档路径的新值；不属于该目录则返回 null。
 *
 * 前缀替换是目录级操作唯一的实现方式：服务端没有目录实体，改名等于
 * 把它下面每篇文档的路径前缀一并改写。
 *
 * 路径恰等于目录名时不改写 —— 那是一篇与目录同名的同级文档，不在该目录内。
 */
export function rewriteFolderPrefix(path: string, from: string, to: string): string | null {
  const source = normalizeFolderPath(from);
  if (!source) return null;
  const normalised = normalizeFolderPath(path);
  if (!normalised.startsWith(`${source}/`)) return null;
  return joinFolderPath(to, normalised.slice(source.length + 1));
}

/**
 * 从资产列表推导目录树：目录 = 路径去掉末段后的各级前缀。
 *
 * 与服务端 `collectImportFolders` 算法一致，两者必须同步演进。
 */
export function deriveFolderTree(assets: readonly { path?: string | null }[]): DocumentFolder[] {
  const paths = new Set<string>();
  for (const asset of assets) {
    const normalised = normalizeFolderPath(asset.path ?? "");
    if (!normalised) continue;
    const segments = normalised.split("/");
    segments.pop();
    for (let i = 1; i <= segments.length; i += 1) {
      paths.add(segments.slice(0, i).join("/"));
    }
  }
  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => {
      const index = path.lastIndexOf("/");
      return {
        id: path,
        name: index === -1 ? path : path.slice(index + 1),
        parentId: index === -1 ? null : path.slice(0, index),
      };
    });
}

/** 某目录及其各级子目录的 id 集合，供「选中目录看整棵子树」使用。 */
export function folderSubtreeIds(
  folders: readonly DocumentFolder[],
  folderId: string,
): Set<string> {
  const ids = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

/** 目录的完整展示路径，如「产品 / 需求文档」。 */
export function folderDisplayPath(folders: readonly DocumentFolder[], folderId: string): string {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(folderId);
  while (current && !visited.has(current.id)) {
    names.unshift(current.name);
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names.join(" / ");
}
