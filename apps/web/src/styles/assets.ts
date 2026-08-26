import { createStyles } from "antd-style";

export const useAssetsStyles = createStyles(({ css }) => ({
  root: css`
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
.sg-docs-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
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
  min-width: 0;
}
.sg-assets-row {
  cursor: pointer;
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
  `,
}));
