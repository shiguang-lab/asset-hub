"use client";

import { type AssetLinkResolver, rewriteMarkdownReferences } from "@shiguang/content";
import { XMarkdown } from "@shiguang2/components";
import { useMemo } from "react";
export type { MarkdownTocItem } from "./toc.js";
export { extractMarkdownToc } from "./toc.js";

export interface MarkdownDocumentProps {
  source: string;
  className?: string;
  resolveAssetLink?: AssetLinkResolver;
}

const defaultAssetLinkResolver: AssetLinkResolver = ({ assetId, kind }) =>
  kind === "image" ? `/api/v1/assets/${assetId}/download` : `/assets/${assetId}`;

export function MarkdownDocument({ source, className, resolveAssetLink }: MarkdownDocumentProps) {
  const content = useMemo(
    () =>
      rewriteMarkdownReferences(source, ({ kind, src }) => {
        if (!src.startsWith("asset:")) return null;
        const assetId = src.slice("asset:".length);
        return assetId ? (resolveAssetLink ?? defaultAssetLinkResolver)({ assetId, kind }) : null;
      }),
    [resolveAssetLink, source],
  );

  return (
    <XMarkdown
      content={content}
      imageConfig={{ mode: "document" }}
      className={className ?? "sg-document-markdown"}
    />
  );
}
