"use client";

import { MarkdownDocument } from "@shiguang/markdown-viewer";
import { useEffect } from "react";

export function InteractiveMarkdown({
  source,
  assetLinks,
  onReady,
}: {
  source: string;
  assetLinks: Record<string, string>;
  onReady: () => void;
}) {
  useEffect(() => onReady(), [onReady]);
  return (
    <MarkdownDocument
      source={source}
      className="sg-public-markdown"
      resolveAssetLink={({ assetId }) => assetLinks[assetId] ?? null}
    />
  );
}
