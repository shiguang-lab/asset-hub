import { type AssetLinkResolver, rewriteAssetLinks } from "@shiguang/content";
import { useEffect, useMemo, useRef, useState } from "react";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import "katex/dist/katex.min.css";

// 默认 schema 会剥掉 `asset:` 协议，这里放开，使正文里的内部引用链接/图片不丢 href/src。
const defaultProtocols = defaultSchema.protocols ?? {};
const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultProtocols,
    href: [...(defaultProtocols.href ?? []), "asset"],
    src: [...(defaultProtocols.src ?? []), "asset"],
  },
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeKatex)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify);

export function Markdown({
  source,
  className,
  resolveAssetLink,
}: {
  source: string;
  className?: string;
  resolveAssetLink?: AssetLinkResolver;
}) {
  const [mermaid, setMermaid] = useState<{
    render: (id: string, code: string) => Promise<string>;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendered = useMemo(() => {
    const blocks: Array<{ start: number; end: number; code: string }> = [];
    const regex = /```mermaid\s*\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null = regex.exec(source);
    while (match !== null) {
      blocks.push({ start: match.index, end: match.index + match[0].length, code: match[1] ?? "" });
      match = regex.exec(source);
    }
    return blocks;
  }, [source]);

  const finalize = (html: string): string =>
    resolveAssetLink ? rewriteAssetLinks(html, resolveAssetLink) : html;

  useEffect(() => {
    if (rendered.length === 0) return;
    void import("mermaid").then((m) => {
      m.default.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });
      setMermaid({ render: (id, code) => m.default.render(id, code).then((r) => r.svg) });
    });
  }, [rendered.length]);

  useEffect(() => {
    if (!mermaid || !containerRef.current) return;
    const nodes = containerRef.current.querySelectorAll<HTMLElement>("[data-mermaid]");
    nodes.forEach((node, i) => {
      const code = node.dataset.mermaid ?? "";
      void mermaid.render(`mmd-${Date.now()}-${i}`, code).then((svg) => {
        node.innerHTML = svg;
      });
    });
  }, [mermaid, source]);

  if (rendered.length === 0) {
    const html = finalize(String(processor.processSync(source)));
    return <div className={className ?? "sg-md"} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  const parts: string[] = [];
  let cursor = 0;
  for (const block of rendered) {
    parts.push(source.slice(cursor, block.start));
    parts.push(`<div data-mermaid="${escapeAttr(block.code)}"></div>`);
    cursor = block.end;
  }
  parts.push(source.slice(cursor));
  const html = finalize(String(processor.processSync(parts.join(""))));
  return (
    <div
      ref={containerRef}
      className={className ?? "sg-md"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
