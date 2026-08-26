export const MARKDOWN_SURFACE_STYLES = `
.sg-markdown-content {
  --sg-markdown-link: var(--sg-accent, #8b7cff);
  --sg-markdown-link-hover: var(--sg-accent-2, #b9a4ff);
  --sg-markdown-rule: color-mix(in srgb, var(--sg-border, rgba(148, 163, 184, .28)) 58%, transparent);
  --sg-markdown-code-bg: var(--sg-bg-2, #161b24);
  --sg-markdown-code-header: var(--sg-bg-3, #202632);
  --sg-markdown-code-fg: #aeb7c4;
  --sg-markdown-code-border: var(--sg-border, rgba(148, 163, 184, .28));
  --sg-markdown-inline-code-bg: var(--sg-bg-3, #202632);
  --sg-markdown-inline-code-fg: #aeb7c4;
  --sg-markdown-inline-code-border: #303a49;
  --code-bg-color: var(--sg-markdown-code-bg);
  --code-text-color: var(--sg-markdown-code-fg);
  --highlighter-bg-color: var(--sg-markdown-code-bg);
  --highlighter-text-color: var(--sg-markdown-code-fg);
  --highlighter-selection-bg: #334155;
  --highlighter-comment: #8b949e;
  --highlighter-punctuation: #a8b1bf;
  --highlighter-property: #79c0ff;
  --highlighter-tag: #ff7b72;
  --highlighter-boolean: #ffab70;
  --highlighter-number: #79c0ff;
  --highlighter-constant: #79c0ff;
  --highlighter-symbol: #d2a8ff;
  --highlighter-selector: #7ee787;
  --highlighter-attr-name: #d2a8ff;
  --highlighter-string: #a5d6ff;
  --highlighter-builtin: #ffa657;
  --highlighter-operator: #ff7b72;
  --highlighter-entity: #ffa657;
  --highlighter-url: #a5d6ff;
  --highlighter-atrule: #d2a8ff;
  --highlighter-attr-value: #a5d6ff;
  --highlighter-keyword: #ff7b72;
  --highlighter-function: #d2a8ff;
  --highlighter-class-name: #ffa657;
  --highlighter-regex: #a5d6ff;
  --highlighter-important: #ff7b72;
  --highlighter-variable: #ffa657;
}
.sg-markdown-content a {
  color: var(--sg-markdown-link) !important;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--sg-markdown-link) 45%, transparent);
  text-underline-offset: 2px;
}
.sg-markdown-content a:hover,
.sg-markdown-content a:focus-visible {
  color: var(--sg-markdown-link-hover) !important;
}
.sg-markdown-content hr {
  height: 0;
  margin: 28px 0;
  border: 0;
  border-top: 1px solid var(--sg-markdown-rule);
  background: none;
}
.sg-markdown-content pre {
  max-width: 100%;
  margin: 16px 0;
  /* XMarkdown owns this generated node; the page/panel containing it uses Scrollbar. */
  overflow: auto;
  padding: 14px 16px;
  border: 1px solid var(--sg-markdown-code-border);
  border-radius: 8px;
  color: var(--sg-markdown-code-fg) !important;
  background: var(--sg-markdown-code-bg) !important;
  font-family: var(--sg-mono, "SFMono-Regular", Consolas, monospace);
  font-size: 13px;
  line-height: 1.7;
}
.sg-markdown-content pre code {
  display: block;
  padding: 0;
  color: inherit !important;
  background: transparent !important;
  font: inherit;
  white-space: pre;
}
.sg-markdown-content section > header {
  position: relative !important;
  top: auto !important;
  z-index: 1 !important;
  min-height: 42px;
  height: auto;
  border: 1px solid var(--sg-markdown-code-border);
  border-bottom: 1px solid var(--sg-markdown-code-border);
  border-radius: 8px 8px 0 0;
  color: var(--sg-fg-2, #c9d1d9);
  background: var(--sg-markdown-code-header) !important;
}
.sg-markdown-content section > header,
.sg-markdown-content section > header * {
  color: var(--sg-fg-2, #c9d1d9) !important;
}
.sg-markdown-content section > header .ant-segmented {
  border: 1px solid var(--sg-markdown-code-border);
  background: var(--sg-markdown-code-bg) !important;
}
.sg-markdown-content section > header .ant-segmented-item {
  color: var(--sg-muted, #8b949e) !important;
  font-weight: 600;
}
.sg-markdown-content section > header .ant-segmented-item-selected {
  color: #fff !important;
  background: var(--sg-accent, #6d5dfc) !important;
  box-shadow: 0 0 0 1px var(--sg-accent, #6d5dfc);
}
.sg-markdown-content section > header .ant-segmented-thumb {
  background: var(--sg-accent, #6d5dfc) !important;
}
.sg-markdown-content section > header button:hover,
.sg-markdown-content section > header button:focus-visible {
  color: var(--sg-fg, #fff) !important;
  background: rgba(255, 255, 255, .08) !important;
}
.sg-markdown-content > pre:has(> section) {
  overflow: visible;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent !important;
}
.sg-markdown-content > pre > section {
  overflow: hidden;
  border: 1px solid var(--sg-markdown-code-border);
  border-radius: 8px;
  background: var(--sg-markdown-code-bg);
}
.sg-markdown-content > pre > section > div {
  border: 0;
  border-radius: 0 0 8px 8px;
  background: var(--sg-markdown-code-bg);
}
.sg-markdown-content > pre > section pre {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent !important;
}
.sg-markdown-content :not(pre) > code {
  padding: 2px 5px;
  border: 1px solid var(--sg-markdown-inline-code-border);
  border-radius: 4px;
  color: var(--sg-markdown-inline-code-fg) !important;
  background: var(--sg-markdown-inline-code-bg) !important;
  font-family: var(--sg-mono, "SFMono-Regular", Consolas, monospace);
  font-size: .9em;
  line-height: 1.4;
}
.sg-markdown-content img,
.sg-markdown-content svg {
  max-width: 100%;
}
`;

/** Shared XMarkdown surface styles. Consumers only need to provide theme variables. */
export function MarkdownSurfaceStyles() {
  return <style data-sg-markdown-surface="true">{MARKDOWN_SURFACE_STYLES}</style>;
}
