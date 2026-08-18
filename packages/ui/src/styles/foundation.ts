import { createGlobalStyle, css } from "antd-style";

export const UiFoundationGlobalStyles = createGlobalStyle(css`
:root {
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
  --sg-sidebar-w: 232px;
}

[data-theme="dark"] {
  --sg-fg: #eef1f8;
  --sg-fg-2: #c3c9d9;
  --sg-muted: #8a92a8;
  --sg-bg: #0f1420;
  --sg-bg-2: #171e2e;
  --sg-bg-3: #202a3f;
  --sg-border: #2a3550;
  --sg-accent: #8b7bff;
  --sg-accent-2: #a99cff;
  --sg-accent-soft: rgba(139, 123, 255, 0.14);
  --sg-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
}

* {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
}

body {
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

/* ---------------- shell ---------------- */
.sg-app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.sg-shell {
  display: flex;
  min-height: 100vh;
}
.sg-sidebar {
  width: var(--sg-sidebar-w);
  flex: none;
  background: var(--sg-bg-2);
  border-right: 1px solid var(--sg-border);
  display: flex;
  flex-direction: column;
  padding: 14px 10px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
.sg-sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 18px;
  font-weight: 750;
  font-size: 16px;
  letter-spacing: 0.01em;
  color: var(--sg-fg);
}
.sg-sidebar-logo:hover {
  text-decoration: none;
}
.sg-sidebar .spacer {
  flex: 1;
}
.sg-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--sg-fg-2);
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  border: 0;
  background: transparent;
  width: 100%;
  text-align: left;
  margin-bottom: 1px;
}
.sg-nav-item:hover {
  background: var(--sg-bg-3);
  color: var(--sg-fg);
  text-decoration: none;
}
.sg-nav-item.active {
  background: var(--sg-accent-soft);
  color: var(--sg-accent);
  font-weight: 600;
}
.sg-nav-icon {
  width: 18px;
  text-align: center;
  font-size: 15px;
  flex: none;
}
.sg-credits-box {
  margin: 10px 8px 6px;
  padding: 10px 12px;
  border: 1px solid var(--sg-border);
  border-radius: 10px;
  background: var(--sg-bg);
}
.sg-credits-box .num {
  font-weight: 700;
  font-size: 13px;
}
.sg-credits-box .buy {
  color: var(--sg-accent);
  font-size: 12px;
  cursor: pointer;
}
.sg-team-box {
  margin: 0 8px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--sg-border);
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.sg-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.sg-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--sg-border);
  background: var(--sg-bg-2);
  position: sticky;
  top: 0;
  z-index: 40;
  min-height: 54px;
}
.sg-breadcrumb {
  color: var(--sg-muted);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sg-breadcrumb strong {
  color: var(--sg-fg);
  font-weight: 600;
}
.sg-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--sg-bg-3);
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 7px 12px;
  width: min(360px, 32vw);
  color: var(--sg-muted);
  cursor: pointer;
  font-size: 13px;
}
.sg-search:hover {
  border-color: var(--sg-accent);
}
.sg-content {
  flex: 1;
  padding: 22px 26px 72px;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}
.sg-content.wide {
  max-width: 1600px;
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
`);
