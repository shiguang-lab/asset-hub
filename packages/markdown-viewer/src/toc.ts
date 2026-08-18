export interface MarkdownTocItem {
  level: number;
  text: string;
  anchor: string;
}

export function extractMarkdownToc(markdown: string): MarkdownTocItem[] {
  const result: MarkdownTocItem[] = [];
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = stripInlineMarkdown(match[2] ?? "");
    if (!text) continue;
    result.push({
      level: match[1]?.length ?? 1,
      text,
      anchor: `sg-heading-${result.length}-${slugify(text)}`,
    });
  }
  return result;
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
