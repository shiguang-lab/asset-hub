import type { ApiClient } from "./client.js";
import type { AssetPage, RemoteAsset, RemoteAssetDetail } from "./types.js";

const DOCUMENT_TYPE = "document";
const PAGE_SIZE = 100;

export interface RemoteDocument {
  remoteId: string;
  remotePath: string;
  title: string;
  version: number;
  updatedAt: string;
}

export interface RemoteContent {
  text: string;
  /** Server-reported hash of the stored content, when available. */
  contentHash: string | null;
}

export class DocumentsApi {
  constructor(private readonly client: ApiClient) {}

  async listFolders(): Promise<string[]> {
    const result = await this.client.request<{ items: Array<{ path: string }> }>({
      path: "/document-folders",
    });
    return result.items.map((item) => item.path).filter(Boolean);
  }

  /**
   * Lists every document, following the cursor to exhaustion.
   *
   * A full scan every round rather than a `since` window: the server reports
   * deletions by their absence, so a windowed scan would have to persist a
   * watermark and still re-read anything it might have missed. The document
   * centre is small enough that listing it is the cheaper correctness argument.
   */
  async listAll(): Promise<RemoteDocument[]> {
    const result: RemoteDocument[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.request<AssetPage>({
        path: "/assets",
        query: { type: DOCUMENT_TYPE, limit: PAGE_SIZE, cursor },
      });
      for (const asset of page.items) result.push(toRemoteDocument(asset));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return result;
  }

  async fetchContent(remoteId: string): Promise<RemoteContent> {
    const detail = await this.client.request<RemoteAssetDetail>({
      path: `/assets/${encodeURIComponent(remoteId)}`,
    });
    return {
      text: detail.content?.text ?? "",
      contentHash: detail.version?.contentHash ?? null,
    };
  }

  async create(input: {
    remotePath: string;
    title: string;
    text: string;
  }): Promise<RemoteDocument> {
    const asset = await this.client.request<RemoteAsset>({
      method: "POST",
      path: "/assets",
      body: {
        type: DOCUMENT_TYPE,
        title: input.title,
        path: input.remotePath,
        content: { kind: "markdown", text: input.text },
      },
    });
    return toRemoteDocument(asset);
  }

  async update(input: {
    remoteId: string;
    remotePath: string;
    title: string;
    text: string;
    baseVersion: number;
  }): Promise<RemoteDocument> {
    const asset = await this.client.request<RemoteAsset>({
      method: "PATCH",
      path: `/assets/${encodeURIComponent(input.remoteId)}`,
      ifMatch: input.baseVersion,
      body: {
        title: input.title,
        path: input.remotePath,
        content: { kind: "markdown", text: input.text },
      },
    });
    return toRemoteDocument(asset);
  }

  /** Moves a document without rewriting its content. */
  async move(input: {
    remoteId: string;
    remotePath: string;
    title: string;
    baseVersion: number;
  }): Promise<RemoteDocument> {
    const asset = await this.client.request<RemoteAsset>({
      method: "PATCH",
      path: `/assets/${encodeURIComponent(input.remoteId)}`,
      ifMatch: input.baseVersion,
      body: { title: input.title, path: input.remotePath },
    });
    return toRemoteDocument(asset);
  }

  async remove(input: { remoteId: string; baseVersion: number }): Promise<void> {
    await this.client.request<void>({
      method: "DELETE",
      path: `/assets/${encodeURIComponent(input.remoteId)}`,
      ifMatch: input.baseVersion,
    });
  }
}

function toRemoteDocument(asset: RemoteAsset): RemoteDocument {
  return {
    remoteId: asset.id,
    remotePath: asset.path ?? "",
    title: asset.title,
    version: asset.lockVersion,
    updatedAt: asset.updatedAt,
  };
}
