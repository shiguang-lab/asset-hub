import { createStyles } from "antd-style";

export const useDocumentsStyles = createStyles(({ css }) => ({
  root: css`
/* V6 Documents: Craft / Notion Visual Document Studio */
.zx-doc-studio {
  flex: 1;
  width: 100%;
  padding: 34px 44px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
}

.zx-studio-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.zx-title-pack {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}
.zx-title-pack h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 770;
  letter-spacing: -0.025em;
  color: var(--sg-fg);
}
.zx-whisper-metrics {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--sg-muted);
}
.zx-whisper-metrics b {
  color: var(--sg-fg);
  font-weight: 680;
}
.zx-studio-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sg-muted);
}

/* Horizontal Scope Tabs + Folder Chips */
.zx-filter-deck {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.zx-scope-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.zx-seg-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px;
  border-radius: 14px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
}
.zx-seg-tab {
  height: 32px;
  padding: 0 13px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  font-size: 12.5px;
  font-weight: 540;
  color: var(--sg-fg-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.zx-seg-tab:hover {
  color: var(--sg-fg);
}
.zx-seg-tab small {
  font-size: 11.5px;
  color: var(--sg-muted);
}
.zx-seg-tab.active {
  background: var(--zx-active-pill);
  box-shadow: var(--zx-active-shadow);
  color: var(--sg-fg);
  font-weight: 680;
}
.zx-seg-tab.active small {
  color: var(--zx-brand);
}

.zx-doc-search-pill {
  width: 224px;
  height: 36px;
  padding: 0 13px;
  border-radius: 999px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--sg-muted);
}
.zx-doc-search-pill:focus-within {
  border-color: var(--zx-brand-border);
}
.zx-doc-search-pill input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--sg-fg);
  font-size: 12.5px;
}
.zx-doc-search-pill input::placeholder {
  color: var(--sg-muted);
}

.zx-folder-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.zx-folder-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.zx-f-chip-wrap {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
  transition: border-color 140ms ease, background 140ms ease;
}
.zx-f-chip-wrap:hover {
  border-color: var(--zx-border-strong);
}
.zx-f-chip-wrap.active {
  background: var(--zx-brand-soft);
  border-color: var(--zx-brand-border);
}
.zx-f-chip {
  height: 32px;
  padding: 0 11px 0 13px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--sg-fg-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.zx-f-chip-wrap.active .zx-f-chip {
  color: var(--zx-brand);
  font-weight: 660;
}
.zx-f-chip-more {
  width: 24px;
  height: 24px;
  margin-right: 4px;
  border: 0;
  border-radius: 99px;
  background: transparent;
  color: var(--sg-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.zx-f-chip-more:hover {
  color: var(--sg-fg);
  background: rgba(255, 255, 255, 0.08);
}
.zx-f-chip-create {
  height: 32px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px dashed var(--zx-brand-border);
  background: transparent;
  color: var(--zx-brand);
  font-size: 12.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}
.zx-f-chip-create:hover {
  background: var(--zx-brand-soft);
}

/* Floating Glass List Strips (List View Mode) */
.zx-doc-strip-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.zx-doc-strip {
  min-height: 68px;
  padding: 10px 20px;
  border-radius: 16px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border);
  box-shadow: var(--zx-card-shadow);
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) 130px 150px 136px 138px auto;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: border-color 150ms ease, transform 150ms ease;
}
.zx-doc-strip:hover {
  border-color: var(--zx-brand-border);
  transform: translateX(2px);
}
.zx-doc-strip.is-trashed {
  cursor: default;
}
.zx-doc-strip.is-trashed:hover {
  border-color: var(--zx-border-strong);
  transform: none;
}

.zx-trash-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 36px;
}
.zx-trash-hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--sg-muted);
}
.zx-trash-acts {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* Move Dialog Styles */
.sg-docs-move-hint {
  margin: 0 0 12px;
  color: var(--sg-muted);
  font-size: 13px;
}
.sg-docs-move-tree {
  max-height: min(420px, 55vh);
  min-height: 0;
  padding: 6px;
  border: 1px solid var(--zx-border);
  border-radius: 14px;
  background: rgba(11, 14, 26, 0.65);
}
.sg-docs-move-folder {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 40px;
  padding: 8px 14px;
  border: 0;
  border-radius: 10px;
  color: var(--sg-fg-2);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.sg-docs-move-folder:hover {
  color: var(--sg-fg);
  background: var(--zx-surface-subtle);
}
.sg-docs-move-folder.selected {
  color: var(--zx-brand);
  background: var(--zx-brand-soft);
}
.sg-docs-move-folder > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-docs-move-folder-check {
  flex: none;
  margin-left: auto;
}
.sg-docs-move-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 1280px) {
  .zx-doc-studio {
    padding: 28px 24px;
  }
  .zx-doc-strip {
    grid-template-columns: minmax(0, 1fr) 120px 130px auto;
  }
  .zx-doc-strip > .hide-md {
    display: none;
  }
}
  `,
}));
