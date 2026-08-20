import { rewriteMarkdownReferences } from "@shiguang/content";
import { marked, Renderer } from "marked";

export interface TocItem {
  id: string;
  level: number;
  text: string;
}

/** Server-only fallback. The hydrated reader still uses XMarkdown. */
export function renderServerMarkdown(source: string, assetLinks: Record<string, string>): string {
  const rewritten = rewriteMarkdownReferences(source, ({ src }) => {
    if (!src.startsWith("asset:")) return null;
    return assetLinks[src.slice("asset:".length)] ?? null;
  });
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  const html = marked.parse(rewritten, {
    async: false,
    breaks: true,
    gfm: true,
    renderer,
  }) as string;
  return addHeadingAnchors(html, rewritten);
}

/**
 * Extract table of contents from markdown source for SSR.
 * Returns an array of heading items with id, level, and text.
 */
export function extractToc(source: string): TocItem[] {
  const anchors: TocItem[] = [];
  let fenced = false;

  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const level = match[1].length;
    const text = (match[2] ?? "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim();

    if (!text) continue;

    const id = String(anchors.length);
    anchors.push({ id, level, text });
  }

  return anchors;
}

function addHeadingAnchors(html: string, source: string): string {
  const anchors = extractHeadingAnchors(source);
  let index = 0;
  return html.replace(/<h([1-6])>/g, (_match, level: string) => {
    const anchor = anchors[index++] ?? `${index - 1}`;
    return `<h${level} id="${escapeHtml(anchor)}">`;
  });
}

function extractHeadingAnchors(markdown: string): string[] {
  const anchors: string[] = [];
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = (match[2] ?? "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim();
    if (!text) continue;
    anchors.push(String(anchors.length));
  }
  return anchors;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
