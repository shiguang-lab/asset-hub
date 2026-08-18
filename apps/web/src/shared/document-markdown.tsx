import type { AssetLinkResolver } from "@shiguang/content";
import { MarkdownDocument } from "@shiguang/markdown-viewer";
import { assetLinkResolver } from "./asset-link.js";

export function DocumentMarkdown({
  source,
  className,
  resolveAssetLink,
}: {
  source: string;
  className?: string;
  resolveAssetLink?: AssetLinkResolver;
}) {
  return (
    <MarkdownDocument
      source={source}
      className={className ?? "sg-document-markdown"}
      resolveAssetLink={resolveAssetLink ?? assetLinkResolver}
    />
  );
}
