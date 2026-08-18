/**
 * 从 Skill 的 zip 包中读取 SKILL.md 的 YAML frontmatter，回填 name/description/tags。
 * 与 OPC 的 extractSkillMetadataFromZip 对齐：纯浏览器实现，无第三方依赖。
 */

export interface SkillZipMetadata {
  name?: string;
  description?: string;
  tags?: string[];
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

type ZipDecompressionStream = new (
  format: "deflate-raw",
) => TransformStream<Uint8Array, Uint8Array>;

const textDecoder = new TextDecoder("utf-8");

export async function extractSkillMetadataFromZip(file: File): Promise<SkillZipMetadata | null> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const entry = findSkillMdEntry(bytes);
  if (!entry) return null;

  const content = await readZipEntryText(bytes, entry);
  return parseSkillFrontmatter(content);
}

function findSkillMdEntry(bytes: Uint8Array): ZipEntry | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) return null;

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdCount = view.getUint16(eocdOffset + 10, true);
  const entries: ZipEntry[] = [];
  let pos = cdOffset;

  for (let index = 0; index < cdCount; index++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;

    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localHeaderOffset = view.getUint32(pos + 42, true);
    const name = textDecoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    if (shouldIgnoreArchivePath(name)) continue;
    if (!name.replace(/\\/g, "/").endsWith("/SKILL.md") && name !== "SKILL.md") continue;
    entries.push({ name, method, compressedSize, localHeaderOffset });
  }

  return entries.sort((a, b) => pathDepth(a.name) - pathDepth(b.name))[0] ?? null;
}

function findEndOfCentralDirectory(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function readZipEntryText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) {
    throw new Error("Invalid ZIP local file header");
  }

  const localNameLen = view.getUint16(offset + 26, true);
  const localExtraLen = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + localNameLen + localExtraLen;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return textDecoder.decode(compressed);
  if (entry.method !== 8) throw new Error(`Unsupported ZIP compression method ${entry.method}`);

  const streamCtor = (
    globalThis as typeof globalThis & {
      DecompressionStream?: ZipDecompressionStream;
    }
  ).DecompressionStream;
  if (!streamCtor) throw new Error("ZIP deflate decompression is not supported in this browser");

  const stream = new Blob([compressed as BlobPart])
    .stream()
    .pipeThrough(new streamCtor("deflate-raw"));
  const decompressed = await new Response(stream).arrayBuffer();
  return textDecoder.decode(decompressed);
}

function shouldIgnoreArchivePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!normalized || normalized.endsWith("/")) return true;
  const parts = normalized.split("/");
  const base = parts[parts.length - 1];
  return parts.includes("__MACOSX") || base === ".DS_Store" || base.startsWith("._");
}

function pathDepth(path: string): number {
  return path.replace(/\\/g, "/").split("/").length;
}

/** 把 SKILL.md 拆成 frontmatter 元数据 + 正文。 */
export function splitSkillMarkdown(content: string): {
  metadata: SkillZipMetadata | null;
  body: string;
} {
  const match = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---[\r\n]*/);
  if (!match) return { metadata: null, body: content };
  return { metadata: parseSkillFrontmatter(content), body: content.slice(match[0].length) };
}

/** 由字段生成带 frontmatter 的 SKILL.md 全文。 */
export function buildSkillMarkdown(
  name: string,
  description: string | undefined,
  tags: string[],
  body: string,
): string {
  const lines = ["---", `name: ${JSON.stringify(name)}`];
  if (description?.trim()) lines.push(`description: ${JSON.stringify(description.trim())}`);
  if (tags.length > 0) lines.push(`tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`);
  lines.push("---", "", body.trim());
  return `${lines.join("\n")}\n`;
}

export function parseSkillFrontmatter(content: string): SkillZipMetadata | null {
  const match = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  if (!match) return null;

  const frontmatter = match[1];
  return {
    ...readScalar(frontmatter, "name", "name"),
    ...readScalar(frontmatter, "description", "description"),
    ...readTags(frontmatter),
  };
}

function readScalar<T extends keyof SkillZipMetadata>(
  frontmatter: string,
  key: string,
  target: T,
): Partial<Pick<SkillZipMetadata, T>> {
  const block = readBlockScalar(frontmatter, key);
  if (block) return { [target]: block } as Pick<SkillZipMetadata, T>;

  const match = frontmatter.match(new RegExp(`^${escapeRegExp(key)}:[ \\t]*(.+?)[ \\t]*$`, "m"));
  const value = match ? cleanYamlScalar(match[1]) : undefined;
  return value ? ({ [target]: value } as Pick<SkillZipMetadata, T>) : {};
}

function readBlockScalar(frontmatter: string, key: string): string | undefined {
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    new RegExp(`^${escapeRegExp(key)}:[ \\t]*[|>][-+]?[ \\t]*$`).test(line),
  );
  if (start < 0) return undefined;

  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S[^:]*:\s*/.test(line)) break;
    block.push(line.replace(/^ {2}/, ""));
  }

  const text = block.join("\n").trim();
  return text || undefined;
}

function readTags(frontmatter: string): Pick<SkillZipMetadata, "tags"> {
  const inline = frontmatter.match(/^tags:[ \t]*(.+?)[ \t]*$/m)?.[1];
  if (inline) {
    const tags = parseInlineTags(inline);
    return tags.length > 0 ? { tags } : {};
  }

  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((line) => /^tags:[ \t]*$/.test(line));
  if (start < 0) return {};

  const tags: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S[^:]*:\s*/.test(line)) break;
    const item = line.match(/^\s*-\s*(.+?)\s*$/)?.[1];
    if (item) tags.push(cleanYamlScalar(item));
  }

  return tags.length > 0 ? { tags: uniqueTags(tags) } : {};
}

function parseInlineTags(value: string): string[] {
  const cleaned = value.trim();
  if (!cleaned) return [];
  if (cleaned.startsWith("[") && cleaned.endsWith("]")) {
    return uniqueTags(cleaned.slice(1, -1).split(",").map(cleanYamlScalar));
  }
  return uniqueTags(cleaned.split(",").map(cleanYamlScalar));
}

function cleanYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function uniqueTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
