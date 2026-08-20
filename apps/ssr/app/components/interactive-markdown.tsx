"use client";

import { MarkdownSurfaceStyles } from "@shiguang/ui";
import { XMarkdown } from "@shiguang2/components";
import { memo } from "react";

const documentImageConfig = { mode: "document" } as const;

export const InteractiveMarkdown = memo(function InteractiveMarkdown({ source }: { source: string }) {
  return (
    <>
      <MarkdownSurfaceStyles />
      <XMarkdown
        content={source}
        imageConfig={documentImageConfig}
        className="sg-markdown-content sg-public-markdown"
      />
    </>
  );
});
