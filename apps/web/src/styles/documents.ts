import { createGlobalStyle, css } from "antd-style";

export const DocumentsGlobalStyles = createGlobalStyle(css`
/* Documents list page: per design 15_33_19 — stat cards, pill filter tabs, toolbar, recent cards, borderless table */
.sg-docs {
  width: 100%;
}
.sg-vis.private {
  color: var(--sg-muted);
}

/* Stat cards: dark surface, amber metric numbers */
.sg-docs-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.sg-docs-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--sg-border);
  border-radius: 10px;
  background: var(--sg-bg-2);
}
.sg-docs-stat .label {
  color: var(--sg-muted);
  font-size: 12.5px;
}
.sg-docs-stat .value {
  font-size: 26px;
  font-weight: 750;
  line-height: 1.1;
  color: #f0b429;
}

/* Pill filter tabs */
.sg-docs-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.sg-docs-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid var(--sg-border);
  border-radius: 999px;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  transition:
    color 140ms ease,
    border-color 140ms ease,
    background 140ms ease;
}
.sg-docs-tab:hover {
  color: var(--sg-fg);
  border-color: var(--sg-accent);
}
.sg-docs-tab.active {
  color: #fff;
  background: var(--sg-accent);
  border-color: var(--sg-accent);
}
.sg-docs-tab em {
  font-style: normal;
  font-size: 11px;
  opacity: 0.75;
}

/* Recently edited cards */
.sg-docs-recent-section,
.sg-docs-all-section {
  margin-top: 22px;
}
.sg-docs-recent-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.sg-docs-recent-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--sg-border);
  border-radius: 10px;
  background: var(--sg-bg-2);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 150ms ease,
    background 150ms ease;
}
.sg-docs-recent-card:hover {
  border-color: var(--sg-accent);
}
.sg-docs-recent-card .sg-asset-icn {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 9px;
}
.sg-docs-recent-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sg-docs-recent-title {
  overflow: hidden;
  color: var(--sg-fg);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-docs-recent-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-docs-desc {
  display: block;
  overflow: hidden;
  color: var(--sg-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Borderless document table */
.sg-docs-table-wrap {
  overflow-x: auto;
}
.sg-docs-table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
}
.sg-docs-table th {
  height: 40px;
  padding: 0 14px;
  border-bottom: 1px solid var(--sg-border);
  color: var(--sg-muted);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}
.sg-docs-table th.c-owner {
  width: 72px;
}
.sg-docs-table th.c-time {
  width: 104px;
}
.sg-docs-table th.c-vis {
  width: 120px;
}
.sg-docs-table th.c-rel {
  width: 190px;
}
.sg-docs-table th.c-menu {
  width: 150px;
  text-align: right;
}
.sg-docs-table td {
  height: 64px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sg-border);
  color: var(--sg-fg-2);
  font-size: 13px;
  vertical-align: middle;
}
.sg-docs-table .sg-asset-name-copy {
  gap: 0;
  justify-content: center;
  min-height: 32px;
}
.sg-docs-table .sg-vis,
.sg-docs-table .sg-docs-actions {
  vertical-align: middle;
}
.sg-docs-table .sg-vis {
  line-height: 1;
}
.sg-docs-table .sg-vis svg {
  margin-top: -2px;
}
.sg-docs-table tbody tr:last-of-type td {
  border-bottom: 0;
}
.sg-docs-table tbody tr {
  cursor: pointer;
}
.sg-docs-table tbody tr:hover td {
  background: var(--sg-bg-2);
}
.sg-docs-table td.c-menu {
  text-align: right;
}
.sg-docs-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  justify-content: flex-end;
}
.sg-docs-action-btn.ant-btn {
  color: var(--sg-muted);
  padding: 0 7px;
  height: 28px;
}
.sg-docs-action-btn.ant-btn:hover {
  color: var(--sg-accent) !important;
  background: var(--sg-accent-soft) !important;
}
.sg-docs-action-btn.ai.ant-btn {
  color: var(--sg-accent);
}

.sg-docs-move-hint {
  margin: 0 0 12px;
  color: var(--sg-muted);
  font-size: 13px;
}
.sg-docs-move-tree {
  max-height: min(420px, 55vh);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg);
}
.sg-docs-move-folder {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 40px;
  padding: 8px 14px;
  border: 0;
  border-radius: 6px;
  color: var(--sg-fg-2);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.sg-docs-move-folder:hover {
  color: var(--sg-fg);
  background: var(--sg-bg-2);
}
.sg-docs-move-folder.selected {
  color: var(--sg-accent);
  background: var(--sg-accent-soft);
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
`);
