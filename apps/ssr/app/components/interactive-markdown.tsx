"use client";

import { MarkdownSurfaceStyles } from "@shiguang/ui";
import { XMarkdown } from "@shiguang2/components";

export function InteractiveMarkdown({ source }: { source: string }) {
  return (
    <>
      <MarkdownSurfaceStyles />
      <XMarkdown
        content={source}
        imageConfig={{ mode: "document" }}
        className="sg-markdown-content sg-public-markdown"
      />
    </>
  );
}
