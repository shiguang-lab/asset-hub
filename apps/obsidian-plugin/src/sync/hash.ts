import { createHash } from "node:crypto";

/**
 * Content hashes must be byte-identical to the server's, or the two sides can
 * never agree that a document is in sync. The server stores what it receives,
 * so the plugin normalises line endings *before* hashing and before uploading.
 */
export function normaliseContent(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

/** Server content hash format: `sha256:` followed by lowercase hex. */
export function contentHash(content: string): string {
  return `sha256:${createHash("sha256").update(normaliseContent(content), "utf8").digest("hex")}`;
}
