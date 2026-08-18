"use client";

import { extractMarkdownToc } from "@shiguang/markdown-viewer/toc";
import { Copy, Download, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

const InteractiveMarkdown = dynamic(
  () => import("./interactive-markdown").then((module) => module.InteractiveMarkdown),
  { ssr: false },
);

export interface PublicReaderContent {
  title: string;
  markdown: string;
  allowDownload: boolean;
  allowCopy: boolean;
  assetLinks: Record<string, string>;
}

export function PublicReader({
  slug,
  content,
  serverMarkdownHtml,
}: {
  slug: string;
  content: PublicReaderContent;
  serverMarkdownHtml: string;
}) {
  const [tocOpen, setTocOpen] = useState(true);
  const [interactiveReady, setInteractiveReady] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const toc = useMemo(() => extractMarkdownToc(content.markdown), [content.markdown]);

  useEffect(() => {
    const headings = contentRef.current?.querySelectorAll(
      ".x-markdown h1, .x-markdown h2, .x-markdown h3, .x-markdown h4",
    );
    headings?.forEach((heading, index) => {
      const item = toc[index];
      if (item) heading.id = item.anchor;
    });
  }, [toc]);

  const copyLink = async () => {
    await navigator.clipboard?.writeText(window.location.href);
  };
  return (
    <div className={`sg-public-page${tocOpen ? "" : " toc-collapsed"}`}>
      <header className="sg-public-header">
        <div className="sg-public-brand">
          <span className="sg-public-mark">S</span>
          <span>Shiguang Lab</span>
        </div>
        <div className="sg-public-actions">
          <button
            type="button"
            className="sg-public-icon-button"
            onClick={() => setTocOpen((open) => !open)}
            aria-label={tocOpen ? "隐藏目录" : "显示目录"}
            title={tocOpen ? "隐藏目录" : "显示目录"}
          >
            {tocOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
          </button>
          {content.allowDownload ? (
            <a className="sg-public-action" href={`/p/${encodeURIComponent(slug)}/download`}>
              <Download size={15} />
              下载
            </a>
          ) : null}
          <button type="button" className="sg-public-action" onClick={() => void copyLink()}>
            <Copy size={15} />
            复制链接
          </button>
        </div>
      </header>
      <div className="sg-public-layout">
        {tocOpen ? (
          <aside className="sg-public-toc" aria-label="文档目录">
            <div className="sg-public-toc-title">
              <Menu size={15} />
              <span>目录</span>
            </div>
            {toc.length > 0 ? (
              <nav>
                {toc.map((item) => (
                  <a key={item.anchor} className={`level-${item.level}`} href={`#${item.anchor}`}>
                    {item.text}
                  </a>
                ))}
              </nav>
            ) : (
              <p className="sg-public-toc-empty">本文档暂无目录</p>
            )}
          </aside>
        ) : null}
        <main
          ref={contentRef}
          className="sg-public-content"
          onCopy={content.allowCopy ? undefined : (event) => event.preventDefault()}
          onContextMenu={content.allowCopy ? undefined : (event) => event.preventDefault()}
        >
          <div className="sg-public-title-block">
            <p className="sg-public-eyebrow">公开文档</p>
            <h1>{content.title}</h1>
          </div>
          {!interactiveReady ? (
            <div
              className="sg-public-markdown"
              dangerouslySetInnerHTML={{ __html: serverMarkdownHtml }}
            />
          ) : null}
          <div hidden={!interactiveReady}>
            <InteractiveMarkdown
              source={content.markdown}
              assetLinks={content.assetLinks}
              onReady={() => setInteractiveReady(true)}
            />
          </div>
          <footer className="sg-public-footer">由 Shiguang Lab 发布 · 内容可追溯</footer>
        </main>
      </div>
    </div>
  );
}
