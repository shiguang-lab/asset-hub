"use client";

import { type AssetLinkResolver, rewriteMarkdownReferences } from "@shiguang/content";
import { MarkdownSurfaceStyles } from "@shiguang/ui";
import { XMarkdown } from "@shiguang2/components";
import { useMemo } from "react";

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
  const content = useMemo(
    () =>
      rewriteMarkdownReferences(source, ({ kind, src }) => {
        if (!src.startsWith("asset:")) return null;
        const assetId = src.slice("asset:".length);
        return assetId ? (resolveAssetLink ?? assetLinkResolver)({ assetId, kind }) : null;
      }),
    [resolveAssetLink, source],
  );

  return (
    <>
      <MarkdownSurfaceStyles />
      <XMarkdown
        content={content}
        imageConfig={{ mode: "document" }}
        className={["sg-markdown-content", className ?? "sg-document-markdown"]
          .filter(Boolean)
          .join(" ")}
      />
    </>
  );
}
