import { useEffect, useMemo, useRef, useState } from "react";
import rehypeKatex from "rehype-katex";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import "katex/dist/katex.min.css";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeKatex)
  .use(rehypeSanitize)
  .use(rehypeStringify);

export function Markdown({ source, className }: { source: string; className?: string }) {
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
    return <Markdown source={source} className={className} />;
  }
  const parts: string[] = [];
  let cursor = 0;
  for (const block of rendered) {
    parts.push(source.slice(cursor, block.start));
    parts.push(`<div data-mermaid="${escapeAttr(block.code)}"></div>`);
    cursor = block.end;
  }
  parts.push(source.slice(cursor));
  const html = String(processor.processSync(parts.join("")));
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
