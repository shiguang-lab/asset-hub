import { createGlobalStyle, css } from "antd-style";

export const AssetsGlobalStyles = createGlobalStyle(css`
/* Assets center: per design 16_16_03 (3) — header, underline tabs, filter bar, table list, right rail, pager */
.sg-assets {
  width: 100%;
}
.sg-assets-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.sg-assets-head .sg-h1 {
  margin: 0 0 5px;
  font-size: 24px;
}
.sg-assets-sub {
  margin: 0;
  color: var(--sg-muted);
  font-size: 13px;
}
.sg-assets-head-btn.ant-btn {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border-color: #3c3452;
  border-radius: 6px;
  color: #b79aff;
  background: transparent;
  font-size: 13px;
  font-weight: 560;
}
.sg-assets-head-btn.ant-btn:hover {
  color: #d5c4ff !important;
  border-color: #7c3cff !important;
  background: rgba(124, 60, 255, 0.08) !important;
}

/* Underline type tabs */
.sg-type-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--sg-border);
  overflow-x: auto;
}
.sg-type-chip {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 9px 12px 12px;
  border: 0;
  background: transparent;
  color: var(--sg-muted);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
}
.sg-type-chip em {
  font-style: normal;
  font-size: 11px;
  color: var(--sg-muted);
}
.sg-type-chip:hover {
  color: var(--sg-fg-2);
}
.sg-type-chip.active {
  color: #c6b1ff;
  font-weight: 600;
}
.sg-type-chip.active::after {
  content: "";
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--sg-accent);
}
.sg-type-chip.active em {
  color: #9b7fff;
}

.sg-assets-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 264px;
  gap: 14px;
  align-items: start;
}
.sg-assets-list {
  min-width: 0;
}

/* Filter toolbar */
.sg-assets-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.sg-assets-search.ant-input-affix-wrapper {
  width: 260px;
  height: 34px;
  border-radius: 7px;
  background: #141218;
  border-color: var(--sg-border);
}
.sg-assets-select.ant-select {
  width: 118px;
}
.sg-assets-select .ant-select-selector {
  border-radius: 7px !important;
  background: #141218 !important;
}
.sg-assets-batch {
  margin-left: auto;
  gap: 8px;
}

/* Table list */
.sg-assets-table-wrap {
  overflow-x: auto;
  border: 1px solid #272430;
  border-radius: 8px;
  background: #121116;
}
.sg-assets-table {
  width: 100%;
  min-width: 880px;
  border-collapse: collapse;
  table-layout: fixed;
}
.sg-assets-table th {
  height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid var(--sg-border);
  color: var(--sg-muted);
  background: #17151b;
  font-size: 12px;
  font-weight: 500;
  text-align: left;
}
.sg-assets-table th.c-check,
.sg-assets-table td.c-check {
  width: 40px;
  padding-right: 0;
}
.sg-assets-table th.c-type {
  width: 96px;
}
.sg-assets-table th.c-owner {
  width: 72px;
}
.sg-assets-table th.c-time {
  width: 104px;
}
.sg-assets-table th.c-status {
  width: 104px;
}
.sg-assets-table th.c-vis {
  width: 128px;
}
.sg-assets-table th.c-menu,
.sg-assets-table td.c-menu {
  width: 60px;
  padding-right: 16px;
  padding-left: 8px;
}
.sg-assets-table td {
  height: 60px;
  overflow: hidden;
  padding: 8px 12px;
  border-bottom: 1px solid #232129;
  color: var(--sg-fg-2);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-assets-table tbody tr:last-of-type td {
  border-bottom: 0;
}
.sg-assets-row {
  cursor: pointer;
}
.sg-assets-row:hover td {
  background: #17151c;
}
.sg-asset-check {
  display: inline-flex;
  cursor: pointer;
}
.sg-asset-check input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--sg-accent);
  cursor: pointer;
}
.sg-asset-name {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.sg-asset-icn {
  width: 32px;
  height: 32px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 7px;
}
.sg-asset-icn.sm {
  width: 24px;
  height: 24px;
  border-radius: 6px;
}
.sg-asset-icn.violet {
  color: #b79aff;
  background: rgba(124, 60, 255, 0.16);
}
.sg-asset-icn.blue {
  color: #7fb2ff;
  background: rgba(63, 138, 255, 0.16);
}
.sg-asset-icn.green {
  color: #54d6a6;
  background: rgba(67, 209, 158, 0.14);
}
.sg-asset-icn.teal {
  color: #4fd6cf;
  background: rgba(45, 212, 191, 0.14);
}
.sg-asset-icn.orange {
  color: #ffab6b;
  background: rgba(255, 145, 74, 0.14);
}
.sg-asset-icn.purple {
  color: #c4a5ff;
  background: rgba(168, 110, 255, 0.16);
}
.sg-asset-icn.red {
  color: #ff8d8d;
  background: rgba(255, 107, 107, 0.14);
}
.sg-asset-icn.gray {
  color: #9a96ad;
  background: rgba(154, 150, 173, 0.16);
}
.sg-asset-icn.cyan {
  color: #6fd3f7;
  background: rgba(56, 189, 248, 0.14);
}
.sg-asset-name-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sg-asset-title {
  display: block;
  overflow: hidden;
  color: var(--sg-fg);
  font-size: 13.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-asset-tags {
  display: flex;
  gap: 4px;
  overflow: hidden;
}
.sg-asset-tag {
  flex: none;
  padding: 0 7px;
  border: 0;
  border-radius: 4px;
  color: #8d89a0;
  background: #1e1b26;
  font-size: 10.5px;
  line-height: 18px;
}
.sg-owner-stack {
  display: inline-flex;
  align-items: center;
  min-width: 28px;
  padding-left: 2px;
}
.sg-owner-stack > * + * {
  margin-left: -8px;
}
.sg-owner-avatar {
  width: 28px;
  height: 28px;
  display: grid;
  flex: none;
  place-items: center;
  border: 2px solid #121116;
  border-radius: 50%;
  color: #fff;
  background: #40586d;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
  cursor: default;
}
.sg-assets-row:hover .sg-owner-avatar {
  border-color: #17151c;
}
.sg-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.sg-status-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
}
.sg-status-dot.ok {
  background: #43d19e;
  box-shadow: 0 0 6px rgba(67, 209, 158, 0.5);
}
.sg-status-dot.warn {
  background: #ffb14a;
}
.sg-status-dot.muted {
  background: #8a8794;
}
.sg-status-dot.err {
  background: #ff5d66;
}
.sg-vis {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  overflow: hidden;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-vis.public {
  color: #54d6a6;
}
.sg-vis.link {
  color: #a994e9;
}
.sg-asset-more {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 6px;
  color: var(--sg-muted);
  background: transparent;
  cursor: pointer;
}
.c-menu .sg-asset-more {
  margin-left: auto;
}
.sg-asset-more:hover {
  color: var(--sg-fg);
  background: #221f2b;
}
.sg-asset-menu {
  display: flex;
  flex-direction: column;
  padding: 5px;
  border: 1px solid #332d45;
  border-radius: 8px;
  background: #17151f;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
}
.sg-asset-menu button {
  padding: 7px 12px;
  border: 0;
  border-radius: 5px;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.sg-asset-menu button:hover {
  color: var(--sg-fg);
  background: #221f2d;
}
.sg-asset-menu button.danger {
  color: #ff8089;
}

/* Pager */
.sg-pager {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 4px 0;
}
.sg-pager-total {
  color: var(--sg-muted);
  font-size: 12.5px;
}
.sg-pager-pages {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 auto;
}
.sg-page-btn {
  min-width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 12.5px;
  cursor: pointer;
}
.sg-page-btn:hover:not(:disabled) {
  color: var(--sg-fg);
  background: #1a1820;
}
.sg-page-btn.active {
  border-color: transparent;
  color: #fff;
  background: var(--sg-accent);
}
.sg-page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.sg-page-ellipsis {
  padding: 0 3px;
  color: var(--sg-muted);
}
.sg-pager-size {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--sg-muted);
  font-size: 12.5px;
}
.sg-pager-size-select.ant-select {
  width: 92px;
}
.sg-pager-size-select .ant-select-selector {
  border-radius: 6px !important;
  background: #141218 !important;
}

/* Right rail */
.sg-assets-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 14px;
  min-width: 0;
}
.sg-side-card {
  padding: 14px 14px 16px;
  border: 1px solid #272430;
  border-radius: 8px;
  background: #121116;
}
.sg-side-title {
  margin: 0 0 10px;
  font-size: 13.5px;
}
.sg-qf-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sg-qf-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 7px 9px;
  border: 0;
  border-radius: 7px;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.sg-qf-item:hover {
  color: var(--sg-fg);
  background: #1a1820;
}
.sg-qf-item.active {
  color: #c6b1ff;
  background: #211a30;
}
.sg-qf-icn {
  width: 26px;
  height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: #a887ff;
  background: rgba(124, 60, 255, 0.14);
}
.sg-qf-count {
  margin-left: auto;
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-qf-item.active .sg-qf-count {
  color: #9b7fff;
}
.sg-storage-num {
  margin-top: 8px;
  color: var(--sg-fg);
  font-size: 17px;
  font-weight: 650;
}
.sg-storage-num em {
  color: var(--sg-muted);
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
}
.sg-storage-bar {
  margin: 10px 0 6px;
}
.sg-storage-bar .ant-progress-text {
  display: none;
}
.sg-storage-bar .ant-progress-bg {
  background: linear-gradient(90deg, #367cff, #744cff) !important;
}
.sg-side-link {
  padding: 0;
  border: 0;
  color: #a994e9;
  background: transparent;
  font-size: 12.5px;
  cursor: pointer;
}
.sg-side-link:hover {
  color: #c9b8ff;
}
.sg-recent-list {
  display: flex;
  flex-direction: column;
}
.sg-recent-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 6px 0;
  border: 0;
  color: var(--sg-fg-2);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.sg-recent-item:hover {
  color: var(--sg-fg);
}
.sg-recent-name {
  min-width: 0;
  overflow: hidden;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-recent-time {
  flex: none;
  margin-left: auto;
  color: var(--sg-muted);
  font-size: 11px;
}
.sg-tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sg-tag-cloud .sg-tag {
  padding: 3px 9px;
  border: 0;
  border-radius: 6px;
  color: #b79aff;
  background: rgba(124, 60, 255, 0.13);
  font-size: 12px;
  line-height: 1.45;
  cursor: pointer;
  transition:
    color 120ms ease,
    background 120ms ease;
}
.sg-tag-cloud .sg-tag:hover {
  color: #d5c4ff;
  background: rgba(124, 60, 255, 0.22);
}
.sg-tag-cloud em {
  font-style: normal;
  opacity: 0.7;
  margin-left: 3px;
}
`);
