import { createStyles } from "antd-style";

export const useShellStyles = createStyles(({ css }) => {
  return {
    root: css`
/* V6 No-Topbar Immersive Studio Shell */
& {
  background: var(--sg-bg);
  font-size: 13px;
  line-height: 1.55;
  font-family: var(--sg-font);
}

button,
input,
textarea,
select {
  letter-spacing: 0;
  font-family: inherit;
}

.sg-shell {
  width: 100%;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  background: var(--zx-frame-bg) !important;
  color: var(--sg-fg);
  display: flex;
  flex-direction: row;
  padding: 10px 12px 10px 10px;
  gap: 10px;
  box-sizing: border-box;
}

/* Left Floating C-End Studio Rail (Full-Height Viewport Pinned) */
.zx-studio-rail {
  width: 224px;
  height: 100%;
  flex-shrink: 0;
  border-radius: 22px;
  padding: 15px 12px 13px;
  background: var(--zx-rail-bg);
  border: 1px solid var(--zx-rail-border);
  box-shadow: var(--zx-rail-shadow);
  backdrop-filter: blur(28px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  z-index: 30;
  box-sizing: border-box;
  transition: width 180ms ease, padding 180ms ease;
}

.zx-studio-rail.slim {
  width: 68px;
  padding: 15px 10px 13px;
  align-items: center;
}

.zx-rail-top {
  flex-shrink: 0;
}

.zx-rail-scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}
.zx-rail-scroll::-webkit-scrollbar {
  display: none;
}

.zx-ws-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 12px;
}
.zx-ws-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.zx-brand-gem {
  width: 33px;
  height: 33px;
  border-radius: 10px;
  background: var(--zx-cta-bg);
  box-shadow: var(--zx-cta-shadow);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  text-decoration: none;
  transition: transform 140ms ease;
}
.zx-brand-gem:hover {
  transform: scale(1.04);
  color: #fff;
}
.zx-ws-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.zx-ws-name {
  font-size: 15px;
  font-weight: 760;
  letter-spacing: -0.015em;
  color: var(--sg-fg);
  line-height: 1.2;
  text-decoration: none;
}
.zx-ws-name:hover {
  color: #fff;
}

.sg-space-switcher {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  margin-top: 2px;
  border: 0;
  background: transparent;
  color: var(--sg-muted);
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  max-width: 124px;
  text-align: left;
}
.sg-space-switcher > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-space-switcher:hover {
  color: var(--sg-fg-2);
}

.zx-notif-btn {
  width: 31px;
  height: 31px;
  border-radius: 99px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
  color: var(--sg-fg-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 140ms ease, color 140ms ease;
}
.zx-notif-btn:hover {
  border-color: var(--zx-brand-border);
  color: #fff;
}
.zx-notif-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 99px;
  background: #F43F5E;
  color: #fff;
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.zx-rail-actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 14px;
}
.zx-rail-create {
  width: 100%;
  height: 38px;
  border-radius: 12px;
  border: 0;
  background: var(--zx-cta-bg);
  box-shadow: var(--zx-cta-shadow);
  color: #fff;
  font-size: 13px;
  font-weight: 650;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  cursor: pointer;
  transition: transform 140ms ease, opacity 140ms ease;
}
.zx-rail-create:hover {
  transform: translateY(-1px);
  opacity: 0.96;
}
.zx-rail-search {
  width: 100%;
  height: 35px;
  padding: 0 11px;
  border-radius: 11px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
  color: var(--sg-muted);
  font-size: 12.5px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: left;
  transition: border-color 140ms ease, color 140ms ease;
}
.zx-rail-search:hover,
.zx-rail-search.active {
  border-color: var(--zx-brand-border);
  color: var(--sg-fg);
}
.zx-rail-kbd {
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
  color: var(--sg-fg-2);
}

.zx-nav-group-lbl {
  font-size: 11.5px;
  font-weight: 650;
  color: var(--sg-muted);
  padding: 11px 10px 5px;
  letter-spacing: 0.02em;
}
.zx-nav-stack {
  display: flex;
  flex-direction: column;
  gap: 2.5px;
}
.zx-nav-item {
  width: 100%;
  height: 37px;
  padding: 0 11px;
  border-radius: 11px;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
  font-weight: 520;
  color: var(--sg-fg-2);
  cursor: pointer;
  text-align: left;
  text-decoration: none;
  transition: background 140ms ease, color 140ms ease;
}
.zx-nav-item:hover {
  background: var(--zx-surface-subtle);
  color: var(--sg-fg);
}
.zx-nav-item .icn {
  color: var(--sg-muted);
  display: inline-flex;
}
.zx-nav-item.active {
  background: var(--zx-active-pill);
  box-shadow: var(--zx-active-shadow);
  color: var(--sg-fg);
  font-weight: 660;
}
.zx-nav-item.active .icn {
  color: var(--zx-brand);
}
.zx-nav-badge {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 680;
  padding: 1px 7px;
  border-radius: 99px;
  background: var(--zx-brand-soft);
  color: var(--zx-brand);
}

/* Slim Rail Icon Buttons */
.zx-slim-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 0;
  background: transparent;
  color: var(--sg-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.zx-slim-btn:hover {
  background: var(--zx-surface-subtle);
  color: var(--sg-fg);
}
.zx-slim-btn.active {
  background: var(--zx-active-pill);
  box-shadow: var(--zx-active-shadow);
  color: var(--zx-brand);
}
.zx-slim-create {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 0;
  background: var(--zx-cta-bg);
  box-shadow: var(--zx-cta-shadow);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.zx-slim-search {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  border: 1px solid var(--zx-border);
  background: var(--zx-surface-subtle);
  color: var(--sg-fg-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* Bottom Pinned User & Credits Dock (No Theme Toggle!) */
.zx-user-dock {
  margin-top: 12px;
  flex-shrink: 0;
  padding: 10px 11px;
  border-radius: 14px;
  background: var(--zx-active-pill);
  box-shadow: var(--zx-active-shadow);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.zx-ud-top {
  display: flex;
  align-items: center;
  gap: 9px;
}
.zx-ud-user-btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  min-width: 0;
  flex: 1;
}
.zx-ud-avatar {
  width: 34px;
  height: 34px;
  border-radius: 99px;
  background: linear-gradient(135deg, #FB7185, #A855F7);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 0;
  cursor: pointer;
}
.zx-ud-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.zx-ud-name-btn {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  max-width: 100%;
  display: inline-flex;
}
.zx-ud-name {
  font-size: 13px;
  font-weight: 660;
  line-height: 1.2;
  color: var(--sg-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zx-ud-credits {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: var(--sg-fg-2);
  text-decoration: none;
}
.zx-ud-credits:hover {
  color: #FDE68A;
}
.zx-ud-gear {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--sg-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  flex-shrink: 0;
  transition: color 140ms ease, background 140ms ease;
}
.zx-ud-gear:hover,
.zx-ud-gear.active {
  color: var(--sg-fg);
  background: var(--zx-surface-subtle);
}
.zx-ud-bar {
  height: 3.5px;
  border-radius: 99px;
  background: var(--zx-border);
  overflow: hidden;
}
.zx-ud-bar i {
  display: block;
  width: 64%;
  height: 100%;
  border-radius: 99px;
  background: var(--zx-prog-grad);
}

/* Right Full-Height Rounded Studio Canvas */
.zx-studio-canvas {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  border-radius: 24px;
  background: var(--zx-canvas-bg);
  border: 1px solid var(--zx-canvas-border);
  box-shadow: var(--zx-canvas-shadow);
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* + 新建创作 Glass Popover */
.sg-create-dropdown .ant-dropdown {
  margin-top: 6px;
}
.sg-create-popover {
  width: min(520px, calc(100vw - 32px));
  padding: 20px;
  border: 1px solid var(--zx-border-strong);
  border-radius: 20px;
  background: rgba(18, 22, 39, 0.96);
  backdrop-filter: blur(28px);
  box-shadow: 0 26px 60px rgba(0, 0, 0, 0.62), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.sg-create-popover h2 {
  margin: 0 0 14px;
  color: var(--sg-fg);
  font-size: 16px;
  font-weight: 700;
}
.sg-create-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sg-create-card {
  min-width: 0;
  min-height: 72px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 12px;
  border: 1px solid var(--zx-border);
  border-radius: 14px;
  color: var(--sg-fg);
  background: rgba(255, 255, 255, 0.038);
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}
.sg-create-card:hover {
  border-color: var(--zx-brand-border);
  background: rgba(168, 85, 247, 0.10);
  transform: translateY(-1px);
}
.sg-create-card-icon {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: #fff;
  background: linear-gradient(145deg, #38BDF8, #2563EB);
}
.sg-create-card-icon.green {
  background: linear-gradient(145deg, #34D399, #059669);
}
.sg-create-card-icon.violet {
  background: linear-gradient(145deg, #C084FC, #7C3AED);
}
.sg-create-card-icon.orange {
  background: linear-gradient(145deg, #FBBF24, #EA580C);
}
.sg-create-card-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}
.sg-create-card-copy strong {
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 660;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-create-card-copy small {
  overflow: hidden;
  color: var(--sg-muted);
  font-size: 11.5px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-create-card-arrow {
  flex: none;
  color: var(--sg-muted);
}
.sg-create-recent {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--zx-border);
}
.sg-create-recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.sg-create-recent-head h3 {
  margin: 0;
  color: var(--sg-fg);
  font-size: 12.5px;
  font-weight: 660;
}
.sg-create-recent-head button {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 0;
  color: var(--zx-brand);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}
.sg-create-template-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.sg-create-template-grid button {
  min-width: 0;
  padding: 0;
  border: 0;
  color: var(--sg-fg-2);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.sg-create-template-grid button:hover strong {
  color: #E9D5FF;
}
.sg-create-template-grid img {
  width: 100%;
  height: 52px;
  display: block;
  object-fit: cover;
  border: 1px solid var(--zx-border);
  border-radius: 8px;
  opacity: 0.88;
}
.sg-create-template-grid strong {
  display: block;
  overflow: hidden;
  margin-top: 6px;
  color: var(--sg-fg-2);
  font-size: 11.5px;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sg-content {
  max-width: none;
  width: 100%;
  margin: 0;
  min-height: 100%;
  height: auto;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: var(--sg-page-gutter);
}
.sg-content.zx-studio-route {
  padding: 0;
}
.sg-page-fill {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sg-h1 {
  font-size: 28px;
  font-weight: 770;
  letter-spacing: -0.025em;
}
.sg-h2 {
  font-size: 16px;
}
.sg-h3 {
  font-size: 14px;
}
.sg-eyebrow {
  letter-spacing: 0.1em;
  color: var(--zx-brand);
}
.sg-list-action-btn.ant-btn {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 99px;
  color: var(--sg-muted);
  background: transparent;
}
.sg-list-action-btn.ant-btn:hover {
  color: var(--zx-brand) !important;
  background: var(--zx-brand-soft) !important;
}
.sg-list-action-btn.ai.ant-btn {
  color: var(--zx-brand);
}
.sg-input,
.sg-textarea,
.sg-select {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.048);
  border-color: var(--zx-border);
}
.sg-badge {
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 11.5px;
}

/* ==================== V6 IMMERSIVE DOCUMENT EDITOR ==================== */
.sg-content-viewport-document-editor,
.sg-content-viewport-document-preview,
.sg-content-viewport-asset-detail,
.sg-content-viewport-presentation-editor,
.sg-content-viewport-presentation-new,
.sg-content-viewport-presentation-generation {
  overflow: hidden !important;
}
.sg-content-viewport-document-editor > .sg-content,
.sg-content-viewport-document-preview > .sg-content,
.sg-content-viewport-asset-detail > .sg-content,
.sg-content-viewport-presentation-editor > .sg-content,
.sg-content-viewport-presentation-new > .sg-content,
.sg-content-viewport-presentation-generation > .sg-content {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.zx-ed-studio {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  padding: 20px 32px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-sizing: border-box;
}
.zx-ed-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}
.zx-ed-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.zx-ed-title-input {
  min-width: 180px;
  flex: 1;
  max-width: 440px;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--sg-fg);
  font-size: 18px;
  font-weight: 760;
  letter-spacing: -0.015em;
}
.zx-ed-title-input::placeholder {
  color: var(--sg-muted);
}

.zx-ed-sub-pills {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3.5px;
  border-radius: 999px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
}
.zx-ed-sp {
  height: 29px;
  padding: 0 13px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--sg-fg-2);
  font-size: 12px;
  font-weight: 560;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.zx-ed-sp:hover {
  color: var(--sg-fg);
}
.zx-ed-sp.active {
  background: var(--zx-active-pill);
  box-shadow: var(--zx-active-shadow);
  color: var(--sg-fg);
  font-weight: 680;
}

.zx-floating-ai-bar {
  flex: 0 0 auto;
  align-self: center;
  min-height: 44px;
  padding: 5px 10px 5px 14px;
  border-radius: 999px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border-strong);
  box-shadow: var(--zx-card-shadow);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.zx-ai-chip {
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--sg-fg-2);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.zx-ai-chip:hover {
  background: var(--zx-surface-subtle);
  color: var(--sg-fg);
}
.zx-ai-chip.primary {
  background: var(--zx-brand-soft);
  color: var(--zx-brand);
  border-color: var(--zx-brand-border);
  font-weight: 680;
}
.zx-ai-sep {
  width: 1px;
  height: 18px;
  background: var(--zx-border);
  margin: 0 2px;
}

.zx-ed-workspace {
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 196px minmax(0, 1fr) minmax(0, 1.06fr);
  gap: 18px;
  overflow: hidden;
}
.zx-ed-workspace.mode-edit {
  grid-template-columns: 196px minmax(0, 1fr);
}
.zx-ed-workspace.mode-preview {
  grid-template-columns: 196px minmax(0, 880px);
  justify-content: center;
}
.zx-ed-workspace.html-split {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr);
}
.zx-ed-workspace.html-edit,
.zx-ed-workspace.html-preview {
  grid-template-columns: minmax(0, 1fr);
}

.zx-outline-rail {
  height: 100%;
  min-height: 0;
  padding: 12px 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.zx-outline-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--sg-muted);
  padding: 0 12px 8px;
  letter-spacing: 0.03em;
}
.zx-toc-item {
  padding: 7px 12px;
  border-radius: 10px;
  font-size: 12.5px;
  color: var(--sg-fg-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zx-toc-item.first {
  background: var(--zx-active-pill);
  box-shadow: var(--zx-active-shadow);
  color: var(--sg-fg);
  font-weight: 660;
}

.zx-md-pane {
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-radius: 20px;
  background: rgba(15, 18, 32, 0.72);
  border: 1px solid var(--zx-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.zx-md-pane .sg-code-editor-host,
.zx-md-pane .cm-editor,
.zx-md-pane .cm-scroller {
  flex: 1 1 0;
  height: 100%;
  min-height: 0;
  background: transparent !important;
}
.zx-md-pane .cm-gutters {
  background: rgba(255, 255, 255, 0.025) !important;
  border-right: 1px solid var(--zx-border) !important;
  color: var(--sg-muted) !important;
}
.zx-md-footer {
  flex: 0 0 auto;
  padding: 9px 18px;
  border-top: 1px solid var(--zx-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--sg-muted);
}

.zx-paper-sheet {
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-radius: 22px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border-strong);
  box-shadow: var(--zx-card-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.zx-paper-scroll {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  padding: 28px 34px;
}

.sg-document-markdown {
  --sg-markdown-link: var(--zx-brand);
  --sg-markdown-link-hover: #E9D5FF;
  --sg-markdown-rule: var(--zx-border);
  --sg-markdown-code-bg: rgba(11, 14, 26, 0.85);
  --sg-markdown-code-header: var(--sg-bg-3);
  --sg-markdown-code-fg: #CBD5E1;
  --sg-markdown-code-border: var(--zx-border);
  --sg-markdown-inline-code-bg: rgba(168, 85, 247, 0.16);
  --sg-markdown-inline-code-fg: #E9D5FF;
  --sg-markdown-inline-code-border: rgba(192, 132, 252, 0.25);
  min-width: 0;
  padding-bottom: 24px;
  color: var(--sg-fg-2);
  line-height: 1.75;
}
.zx-paper-sheet .sg-document-markdown h1 {
  color: var(--sg-fg);
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-top: 0;
}
.zx-paper-sheet .sg-document-markdown h2 {
  color: var(--sg-fg);
  font-size: 17px;
  font-weight: 700;
  margin-top: 22px;
}
.zx-paper-sheet .sg-document-markdown h3 {
  color: var(--sg-fg);
  font-size: 15px;
  font-weight: 680;
}
.zx-paper-sheet .sg-document-markdown strong {
  color: var(--sg-fg);
}
.zx-paper-sheet .sg-document-markdown blockquote {
  margin: 16px 0;
  padding: 12px 16px;
  border-radius: 12px;
  border-left: 3px solid var(--zx-brand);
  background: var(--zx-brand-soft);
  color: var(--sg-fg);
}

/* Asset Detail / Preview / Workflow pages */
.sg-asset-detail-page,
.sg-document-preview-page {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.sg-asset-detail-header,
.sg-asset-detail-page > .ant-tabs,
.sg-document-preview-header {
  flex: 0 0 auto;
}
.sg-asset-detail-content {
  min-height: 0;
  flex: 1 1 auto;
  padding-bottom: var(--sg-page-gutter);
}
.sg-asset-detail-content-presentation {
  display: flex;
  flex-direction: column;
  overflow: hidden !important;
  padding-bottom: 0;
}
.sg-asset-presentation-card {
  min-height: 0;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sg-asset-presentation-card > .ant-card-body {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  padding: 0;
}
.sg-asset-presentation-preview {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 24px;
  background: #090B14;
  container-type: size;
}
.sg-asset-presentation-stage {
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sg-asset-presentation-stage > iframe {
  display: block;
  min-width: 0;
  min-height: 0 !important;
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--zx-border);
  border-radius: 12px;
  background: #fff;
}
@supports (width: 1cqw) {
  .sg-asset-presentation-stage > iframe {
    width: min(100%, 177.777778cqh);
    height: min(100%, 56.25cqw);
  }
}
.sg-document-preview-content {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  border: 1px solid var(--zx-border-strong);
  border-radius: 20px;
  background: var(--zx-surface-card);
}
.sg-document-preview-content > div {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 28px 34px;
}

.sg-workflow-page {
  width: 100%;
}
.sg-presentation-new-workflow {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sg-workflow-page .sg-stepper {
  width: 100%;
  min-height: 68px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: stretch;
  margin-bottom: 20px;
  padding: 0 12px;
  border: 1px solid var(--zx-brand-border);
  border-radius: 16px;
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.14), rgba(56, 189, 248, 0.06));
}
.sg-workflow-page .sg-step {
  position: relative;
  justify-content: center;
  gap: 8px;
  background: transparent;
  color: var(--sg-muted);
  font-size: 12.5px;
  font-weight: 560;
}
.sg-workflow-page .sg-step.active {
  color: var(--sg-fg);
}
.sg-workflow-page .sg-step.active .num,
.sg-workflow-page .sg-step.done .num {
  color: #fff;
  border-color: transparent;
  background: var(--zx-cta-bg);
}
.sg-research-workflow > .sg-card,
.sg-form-workflow > .sg-card {
  max-width: none;
  padding: 24px;
}

@keyframes zx-cover-shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
.zx-cover-skeleton {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: linear-gradient(145deg, rgba(20, 25, 44, 0.92), rgba(12, 16, 32, 0.96));
}
.zx-cover-skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 20%,
    rgba(255, 255, 255, 0.055) 48%,
    rgba(192, 132, 252, 0.07) 54%,
    transparent 80%
  );
  animation: zx-cover-shimmer 1.6s ease-in-out infinite;
}

@media (max-width: 1180px) {
  .zx-ed-workspace {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .zx-outline-rail {
    display: none;
  }
}
@media (max-width: 820px) {
  .zx-studio-rail {
    width: 68px;
    padding: 14px 8px;
    align-items: center;
  }
  .zx-ed-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}
    `,
  };
});
