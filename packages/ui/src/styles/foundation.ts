import { createStyles } from "antd-style";

export const useUiFoundationStyles = createStyles(({ css }) => ({
  root: css`
& {
  --sg-fg: #1a1f36;
  --sg-fg-2: #4b5568;
  --sg-muted: #8a94a6;
  --sg-bg: #f7f8fb;
  --sg-bg-2: #ffffff;
  --sg-bg-3: #f1f2f7;
  --sg-border: #e6e8f0;
  --sg-accent: #5b36f5;
  --sg-accent-2: #7a5cff;
  --sg-accent-soft: rgba(91, 54, 245, 0.08);
  --sg-danger: #e5484d;
  --sg-success: #30a46c;
  --sg-warning: #f5a524;
  --sg-radius: 12px;
  --sg-radius-sm: 8px;
  --sg-shadow: 0 4px 20px rgba(26, 31, 54, 0.06);
  --sg-shadow-lg: 0 12px 40px rgba(26, 31, 54, 0.12);
  --sg-font:
    Inter, ui-sans-serif, -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei",
    sans-serif;
  --sg-mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
}

* {
  box-sizing: border-box;
}

& {
  height: 100%;
}

& {
  margin: 0;
  color: var(--sg-fg);
  background: var(--sg-bg);
  font-family: var(--sg-font);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

a {
  color: var(--sg-accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
button {
  font-family: var(--sg-font);
}

/* ---------------- typography ---------------- */
.sg-h1 {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
  letter-spacing: -0.01em;
}
.sg-h2 {
  font-size: 17px;
  font-weight: 650;
  margin: 0 0 8px;
}
.sg-h3 {
  font-size: 14.5px;
  font-weight: 600;
  margin: 0 0 6px;
}
.sg-subtle {
  color: var(--sg-muted);
  font-size: 13px;
}
.sg-diff-block {
  border-left: 3px solid var(--sg-border);
  background: var(--sg-surface-muted, rgba(128, 128, 128, 0.06));
  display: flex;
  gap: 8px;
  align-items: baseline;
  line-height: 1.5;
}
.sg-diff-block[data-kind="add"] {
  border-left-color: var(--sg-success, #16a34a);
  background: rgba(22, 163, 74, 0.08);
}
.sg-diff-block[data-kind="remove"] {
  border-left-color: var(--sg-danger, #dc2626);
  background: rgba(220, 38, 38, 0.07);
}
.sg-diff-block[data-kind="modify"] {
  border-left-color: var(--sg-warning, #d97706);
  background: rgba(217, 119, 6, 0.08);
}
.sg-diff-label {
  flex: none;
  font-size: 11px;
  color: var(--sg-muted);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-eyebrow {
  color: var(--sg-accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
`,
}));
