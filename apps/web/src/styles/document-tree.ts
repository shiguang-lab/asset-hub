import { createStyles } from "antd-style";

export const useDocumentTreeStyles = createStyles(({ css }) => ({
  root: css`
/* Document organization: nested folder tree and document workspace. */
.sg-docs-workspace {
  display: grid;
  min-width: 0;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}
.sg-docs-tree-panel {
  position: sticky;
  top: 14px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-height: calc(100vh - 190px);
  overflow: hidden;
  padding: 10px 8px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-docs-tree-scroll {
  min-height: 0;
  flex: 1 1 auto;
}
.sg-docs-tree-heading,
.sg-docs-tree-row {
  display: flex;
  align-items: center;
}
.sg-docs-tree-heading {
  min-height: 34px;
  justify-content: space-between;
  padding: 0 6px 6px 8px;
  color: var(--sg-fg);
  font-size: 13px;
}
.sg-docs-tree-heading button,
.sg-docs-tree-more,
.sg-docs-tree-toggle {
  display: grid;
  width: 26px;
  height: 26px;
  flex: none;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  color: var(--sg-muted);
  background: transparent;
  cursor: pointer;
}
.sg-docs-tree-heading button:hover,
.sg-docs-tree-more:hover,
.sg-docs-tree-toggle:hover {
  color: var(--sg-fg);
  background: var(--sg-bg-3);
}
.sg-docs-system-views {
  display: grid;
  gap: 2px;
}
.sg-docs-system-views > button {
  display: flex;
  width: 100%;
  height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  color: var(--sg-muted);
  background: transparent;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.sg-docs-tree-heading > div {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sg-docs-tree-collapse {
  display: none !important;
}
.sg-docs-system-views > button:hover,
.sg-docs-system-views > button.active {
  color: var(--sg-fg);
  background: var(--sg-accent-soft);
}
.sg-docs-system-views > button svg,
.sg-docs-tree-label svg {
  flex: none;
  color: var(--sg-accent);
}
.sg-docs-tree-divider {
  height: 1px;
  margin: 9px 6px;
  background: var(--sg-border);
}
.sg-docs-tree-subheading {
  padding: 2px 9px 7px;
  color: var(--sg-muted);
  font-size: 11px;
}
.sg-docs-tree-row {
  min-width: 0;
  height: 32px;
  padding-right: 3px;
  border-radius: 6px;
}
.sg-docs-tree-row:hover,
.sg-docs-tree-row.active {
  background: var(--sg-bg-3);
}
.sg-docs-tree-row.active {
  box-shadow: inset 2px 0 0 var(--sg-accent);
}
.sg-docs-tree-label {
  display: flex;
  min-width: 0;
  height: 100%;
  flex: 1;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  padding: 0 4px;
  border: 0;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.sg-docs-tree-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-docs-tree-more {
  opacity: 0;
}
.sg-docs-tree-row:hover .sg-docs-tree-more,
.sg-docs-tree-row:focus-within .sg-docs-tree-more {
  opacity: 1;
}
.sg-docs-main {
  min-width: 0;
}
.sg-docs-location {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 10px;
  padding: 0 2px 8px;
  border-bottom: 1px solid var(--sg-border);
}
.sg-docs-location > div {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}
.sg-docs-location span {
  flex: none;
  color: var(--sg-muted);
  font-size: 11px;
}
.sg-docs-location strong {
  overflow: hidden;
  color: var(--sg-fg);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-docs-main .sg-docs-table-wrap {
  min-width: 0;
}

@media (max-width: 1400px) {
  .sg-docs-workspace {
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 14px;
  }
  .sg-docs-main .sg-assets-toolbar {
    gap: 10px;
  }
  .sg-docs-main .sg-assets-search.ant-input-affix-wrapper {
    width: 260px;
  }
  .sg-docs-main .sg-assets-select.ant-select {
    width: 132px;
  }
  .sg-docs-main .sg-assets-select:nth-of-type(2) {
    width: 122px;
  }
  .sg-docs-main .sg-assets-select:nth-of-type(3) {
    width: 138px;
  }
  .sg-docs-main .sg-docs-recent-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .sg-docs-workspace {
    grid-template-columns: 1fr;
  }
  .sg-docs-tree-panel {
    position: static;
    max-height: 280px;
  }
  .sg-docs-tree-collapse {
    display: grid !important;
  }
  .sg-docs-tree-panel:not(.open) .sg-docs-tree-content {
    display: none;
  }
  .sg-docs-tree-more {
    opacity: 1;
  }
  .sg-docs-main .sg-docs-recent-grid {
    grid-template-columns: 1fr;
  }
}
.cm-editor {
  background: var(--sg-bg-2);
  color: var(--sg-fg);
}
.cm-editor .cm-gutters {
  background: var(--sg-bg-3);
  color: var(--sg-muted);
  border-right: 1px solid var(--sg-border);
}
.cm-editor .cm-activeLine {
  background: var(--sg-accent-soft);
}
.cm-editor .cm-cursor {
  border-left-color: var(--sg-accent);
}
  `,
}));
