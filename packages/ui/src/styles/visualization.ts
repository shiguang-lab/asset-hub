import { createStyles } from "antd-style";

export const useUiVisualizationStyles = createStyles(({ css }) => ({
  root: css`
/* ---------------- slides ---------------- */
.sg-slide-editor {
  display: grid;
  grid-template-columns: 220px 1fr 260px;
  gap: 14px;
  height: calc(100vh - 150px);
}
.sg-slide-list {
  border: 1px solid var(--sg-border);
  border-radius: 10px;
  background: var(--sg-bg-2);
  padding: 8px;
}
.sg-slide-thumb {
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12.5px;
  text-align: left;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--sg-fg);
  margin-bottom: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sg-slide-thumb.active {
  background: var(--sg-accent-soft);
}
.sg-slide-thumb-no {
  font-size: 11px;
  color: var(--sg-muted);
  font-variant-numeric: tabular-nums;
}
.sg-slide-thumb-frame {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  background: #fff;
  pointer-events: none;
}
.sg-slide-thumb-label {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sg-slide-thumb.active .sg-slide-thumb-frame {
  border-color: var(--sg-accent);
}
.sg-el-editor {
  display: flex;
  flex-direction: column;
  border: 1px solid transparent;
  transition: border-color 0.15s ease;
}
.sg-el-editor.selected {
  border-color: var(--sg-accent);
  background: var(--sg-accent-soft);
}
.sg-editor-hint {
  font-size: 12.5px;
  color: var(--sg-muted);
}
.sg-slide-canvas {
  border: 1px solid var(--sg-border);
  border-radius: 10px;
  background: var(--sg-bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.sg-slide-frame {
  width: min(100%, 880px);
  aspect-ratio: 16 / 9;
  border: 1px solid var(--sg-border);
  border-radius: 12px;
  padding: 48px;
  box-shadow: var(--sg-shadow);
}
.sg-editor-right {
  width: 260px;
  border: 1px solid var(--sg-border);
  border-radius: 10px;
  background: var(--sg-bg-2);
  padding: 12px;
}
.sg-editor-right h4 {
  font-size: 12px;
  color: var(--sg-muted);
  margin: 14px 0 8px;
  font-weight: 600;
}
.sg-option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--sg-bg-3);
}
.sg-option-row:last-of-type {
  border-bottom: 0;
}

/* ---------------- dataset ---------------- */
.sg-dataset-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.sg-pagination {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 12px;
}

/* ---------------- command palette ---------------- */
.sg-palette-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 20, 32, 0.4);
  z-index: 300;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}
.sg-palette-backdrop-close {
  position: fixed;
  inset: 0;
  background: transparent;
  border: 0;
  cursor: default;
  z-index: 0;
}
.sg-palette {
  width: min(620px, 92vw);
  position: relative;
  z-index: 1;
  background: var(--sg-bg-2);
  border: 1px solid var(--sg-border);
  border-radius: 14px;
  box-shadow: var(--sg-shadow-lg);
  overflow: hidden;
}
.sg-palette input {
  width: 100%;
  border: 0;
  padding: 16px 18px;
  font-size: 15px;
  background: transparent;
  color: var(--sg-fg);
  outline: none;
  border-bottom: 1px solid var(--sg-border);
}
.sg-palette-list {
  max-height: 340px;
  padding: 6px;
}
.sg-palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13.5px;
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--sg-fg);
  text-align: left;
}
.sg-palette-item:hover,
.sg-palette-item.active {
  background: var(--sg-accent-soft);
}
`,
}));
