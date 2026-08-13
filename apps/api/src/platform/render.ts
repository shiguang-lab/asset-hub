import type { PresentationDocument } from "@shiguang/contracts";
import { marked } from "marked";

const SHELL_CSS = `
  :root { color-scheme: light dark; --fg:#172033; --bg:#f7f8fb; --accent:#6d5dfc; --muted:#667085; --border:#e5e7ef; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif; color: var(--fg); background: var(--bg); line-height: 1.7; }
  .doc { max-width: 860px; margin: 0 auto; padding: 48px 24px 96px; }
  h1,h2,h3 { line-height: 1.3; }
  h1 { font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: .4em; }
  code { background: rgba(109,93,252,.08); border-radius: 4px; padding: .15em .35em; font-size: .92em; }
  pre { background: #101625; color: #e6e9f2; padding: 16px; border-radius: 10px; overflow: auto; }
  pre code { background: transparent; color: inherit; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th,td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
  blockquote { border-left: 4px solid var(--accent); margin: 1em 0; padding: .4em 1em; color: var(--muted); background: rgba(109,93,252,.05); }
  a { color: var(--accent); }
  img { max-width: 100%; }
  .muted { color: var(--muted); }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); font-size: .85em; }
  @media (max-width: 640px) { .doc { padding: 24px 16px 64px; } }
`;

export function renderMarkdownHtml(markdown: string, title: string): string {
  const body = marked.parse(markdown, { async: false, gfm: true, breaks: true }) as string;
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>${SHELL_CSS}</style>
</head>
<body>
<main class="doc">
${body}
<footer>由 Shiguang Lab 发布 · <span class="muted">保持版本化，内容可追溯</span></footer>
</main>
</body>
</html>`;
}

export function renderPresentationHtml(doc: PresentationDocument, title: string): string {
  const theme =
    doc.theme === "dark"
      ? { bg: "#0f1420", fg: "#f5f7ff", accent: "#8b7bff", muted: "#9aa3b8" }
      : doc.theme === "brand"
        ? { bg: "#ffffff", fg: "#1a2a4f", accent: "#f04e2c", muted: "#6b7a99" }
        : doc.theme === "minimal"
          ? { bg: "#fafafa", fg: "#111111", accent: "#888888", muted: "#666666" }
          : doc.theme === "gradient"
            ? {
                bg: "linear-gradient(135deg,#0d0b1e,#2a1b4d)",
                fg: "#ffffff",
                accent: "#7c5cff",
                muted: "#c4b8e8",
              }
            : { bg: "#ffffff", fg: "#172033", accent: "#6d5dfc", muted: "#667085" };
  const slides = doc.slides
    .map(
      (slide, i) => `
  <section class="slide" data-index="${i}">
    <div class="slide-inner">
      ${slide.blocks
        .map((block) => {
          switch (block.type) {
            case "heading":
              return `<h2>${escapeHtml(block.content)}</h2>`;
            case "text":
              return `<p>${escapeHtml(block.content)}</p>`;
            case "bullet":
              return `<ul>${block.content
                .split("\n")
                .filter(Boolean)
                .map((line) => `<li>${escapeHtml(line)}</li>`)
                .join("")}</ul>`;
            case "quote":
              return `<blockquote>${escapeHtml(block.content)}</blockquote>`;
            case "table":
              return `<pre class="table">${escapeHtml(block.content)}</pre>`;
            case "code":
              return `<pre><code>${escapeHtml(block.content)}</code></pre>`;
            default:
              return `<p>${escapeHtml(block.content)}</p>`;
          }
        })
        .join("")}
    </div>
  </section>`,
    )
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  html,body { height: 100%; margin: 0; font-family: -apple-system,"PingFang SC","Noto Sans SC",sans-serif; }
  body { background: ${theme.bg}; color: ${theme.fg}; overflow: hidden; }
  .deck { height: 100vh; display: flex; }
  .slide { min-width: 100%; display: flex; align-items: center; justify-content: center; padding: 48px; transition: transform .4s ease; }
  .slide-inner { max-width: 1000px; width: 100%; }
  h2 { font-size: clamp(28px, 4vw, 52px); margin: 0 0 24px; color: ${theme.accent}; }
  p, li { font-size: clamp(18px, 2vw, 26px); line-height: 1.6; }
  blockquote { border-left: 5px solid ${theme.accent}; padding: 8px 20px; color: ${theme.muted}; font-size: 22px; }
  ul { padding-left: 28px; }
  .table { white-space: pre-wrap; background: rgba(0,0,0,.08); padding: 16px; border-radius: 8px; }
  pre { overflow: auto; }
  .nav { position: fixed; bottom: 20px; right: 20px; display: flex; gap: 8px; z-index: 10; }
  .nav button { border: 1px solid ${theme.accent}; background: transparent; color: ${theme.fg}; border-radius: 50%; width: 40px; height: 40px; cursor: pointer; font-size: 18px; }
  .progress { position: fixed; top: 0; left: 0; height: 4px; background: ${theme.accent}; transition: width .3s; z-index: 10; }
  @media (max-width: 640px) { .slide { padding: 24px; } }
</style>
</head>
<body>
<div class="progress" id="progress"></div>
<div class="deck" id="deck">${slides}</div>
<div class="nav">
  <button id="prev" aria-label="上一页">‹</button>
  <button id="next" aria-label="下一页">›</button>
</div>
<script>
(() => {
  const deck = document.getElementById('deck');
  const slides = Array.from(deck.querySelectorAll('.slide'));
  const progress = document.getElementById('progress');
  let current = 0;
  const show = (i) => {
    current = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, idx) => s.style.transform = 'translateX(' + ((idx - current) * 100) + '%)');
    progress.style.width = (slides.length ? ((current + 1) / slides.length) * 100 : 0) + '%';
  };
  document.getElementById('prev').addEventListener('click', () => show(current - 1));
  document.getElementById('next').addEventListener('click', () => show(current + 1));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); show(current + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
  });
  show(0);
})();
</script>
</body>
</html>`;
}

export function buildReleaseBundle(input: {
  assetType: string;
  title: string;
  markdown?: string;
  html?: string;
  presentation?: PresentationDocument;
}): {
  files: Array<{ path: string; content: string; mediaType: string }>;
  manifest: Record<string, unknown>;
} {
  const files: Array<{ path: string; content: string; mediaType: string }> = [];
  if (input.assetType === "presentation" && input.presentation) {
    files.push({
      path: "index.html",
      content: renderPresentationHtml(input.presentation, input.title),
      mediaType: "text/html",
    });
    files.push({
      path: "slides.json",
      content: JSON.stringify(input.presentation, null, 2),
      mediaType: "application/json",
    });
  } else if (input.assetType === "html" && input.html) {
    files.push({ path: "index.html", content: input.html, mediaType: "text/html" });
  } else {
    const markdown = input.markdown ?? "";
    files.push({
      path: "index.html",
      content: renderMarkdownHtml(markdown, input.title),
      mediaType: "text/html",
    });
    files.push({ path: "index.md", content: markdown, mediaType: "text/markdown" });
  }
  const manifest = {
    schemaVersion: 1,
    entrypoint: "index.html",
    title: input.title,
    assetType: input.assetType,
    files: files.map((f) => ({
      path: f.path,
      mediaType: f.mediaType,
      size: Buffer.byteLength(f.content),
    })),
    csp: "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
  };
  return { files, manifest };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
