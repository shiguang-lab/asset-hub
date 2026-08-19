import { rewriteMarkdownReferences } from "@shiguang/content";
import { marked, Renderer } from "marked";
import type { PublicReaderContent } from "./components/public-reader";

export function renderServerMarkdown(
  source: string,
  assetLinks: PublicReaderContent["assetLinks"],
): string {
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
  return addHeadingAnchors(html, source);
}

function addHeadingAnchors(html: string, source: string): string {
  const anchors = extractHeadingAnchors(source);
  let index = 0;
  return html.replace(/<h([1-4])>/g, (_match, level: string) => {
    const anchor = anchors[index++] ?? `${index - 1}`;
    return `<h${level} id="${anchor}">`;
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
    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = (match[2] ?? "")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim();
    if (!text) continue;
    anchors.push(`${anchors.length}-${slugify(text)}`);
  }
  return anchors;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
