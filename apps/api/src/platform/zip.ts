import { inflateRawSync } from "node:zlib";

/**
 * 极简 ZIP 读取器：只服务于「文档导入增强」，解出归档里的普通文件（目录项忽略）。
 *
 * 支持两种压缩方式：0 = stored（原样）、8 = deflate（raw inflate，Node zlib 原生）。
 * 文件名与尺寸一律以中央目录（central directory）为准——这能正确覆盖
 * 启用了 data descriptor 的归档（local header 里的 size 可能为 0）。
 */

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIR_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIR = 0x06054b50;

const MAX_ENTRIES = 10_000;

export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount > MAX_ENTRIES) {
    throw new Error(`ZIP 条目过多（${entryCount}）`);
  }

  const entries = new Map<string, Buffer>();
  let cursor = centralDirOffset;
  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIR_HEADER) {
      throw new Error("ZIP 中央目录损坏");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameBytes = buffer.subarray(nameStart, nameStart + fileNameLength);
    const name = (flags & 0x0800) !== 0 ? nameBytes.toString("utf8") : nameBytes.toString("latin1");
    cursor = nameStart + fileNameLength + extraLength + commentLength;

    if (name.endsWith("/") || name.length === 0) continue; // 目录项

    if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_HEADER) {
      throw new Error(`ZIP 条目「${name}」的本地头损坏`);
    }
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.set(name, Buffer.from(compressed));
    } else if (method === 8) {
      entries.set(name, inflateRawSync(compressed));
    } else {
      throw new Error(`不支持的 ZIP 压缩方式（${method}）`);
    }
  }
  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  // EOCD 固定 22 字节 + 可选 comment；从末尾向前搜索签名。
  const minimum = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= minimum; i -= 1) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL_DIR) return i;
  }
  throw new Error("不是有效的 ZIP 归档");
}
