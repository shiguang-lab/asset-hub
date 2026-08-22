import { createGlobalStyle, css } from "antd-style";

export const KnowledgeGlobalStyles = createGlobalStyle(css`
/* Knowledge workspace: reference layout 2026-08-13. */
.sg-knowledge-page {
  min-width: 0;
  color: var(--sg-fg);
}
.sg-knowledge-head,
.sg-knowledge-head > div,
.sg-knowledge-stat,
.sg-knowledge-stat-copy,
.sg-knowledge-toolbar,
.sg-knowledge-toolbar-tail,
.sg-knowledge-view-toggle,
.sg-knowledge-search,
.sg-knowledge-row,
.sg-knowledge-row-primary,
.sg-knowledge-row-copy,
.sg-knowledge-owner > div,
.sg-knowledge-detail-head,
.sg-knowledge-detail-head > div,
.sg-knowledge-availability,
.sg-knowledge-meta-grid dd,
.sg-knowledge-chart,
.sg-knowledge-recent > div,
.sg-knowledge-recent > button,
.sg-knowledge-panel-list > button,
.sg-knowledge-pagination,
.sg-knowledge-detail-actions {
  display: flex;
  align-items: center;
}
.sg-knowledge-head {
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}
.sg-knowledge-head > div {
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}
.sg-knowledge-head .sg-h1 {
  margin: 0;
  color: var(--sg-fg);
  font-size: 28px;
  font-weight: 700;
  line-height: 34px;
}
.sg-knowledge-head p {
  margin: 0;
  color: var(--sg-fg-2);
  font-size: 13px;
}
.sg-knowledge-help,
.sg-knowledge-edit-link,
.sg-knowledge-recent > div > button {
  padding: 0;
  border: 0;
  color: #a982ff;
  background: transparent;
  cursor: pointer;
}
.sg-knowledge-help {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  white-space: nowrap;
}
.sg-knowledge-help:hover,
.sg-knowledge-edit-link:hover,
.sg-knowledge-recent > div > button:hover {
  color: #c5acff;
}

.sg-knowledge-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.sg-knowledge-stat {
  min-width: 0;
  min-height: 98px;
  gap: 14px;
  padding: 15px 16px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-knowledge-stat-icon,
.sg-knowledge-item-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.sg-knowledge-stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
}
.sg-knowledge-stat-icon.violet,
.sg-knowledge-item-icon.violet {
  background: linear-gradient(145deg, #4e2bac, #6f3cf0);
}
.sg-knowledge-stat-icon.blue,
.sg-knowledge-item-icon.blue {
  background: linear-gradient(145deg, #184c9e, #2e6ede);
}
.sg-knowledge-stat-icon.green,
.sg-knowledge-item-icon.green {
  background: linear-gradient(145deg, #147053, #2ba777);
}
.sg-knowledge-stat-icon.orange,
.sg-knowledge-item-icon.orange {
  background: linear-gradient(145deg, #92511b, #d77b27);
}
.sg-knowledge-stat-icon.rose,
.sg-knowledge-item-icon.rose {
  background: linear-gradient(145deg, #a52d4d, #d65070);
}
.sg-knowledge-stat-copy {
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
  column-gap: 8px;
}
.sg-knowledge-stat-copy > span {
  width: 100%;
  color: var(--sg-fg-2);
  font-size: 12px;
}
.sg-knowledge-stat-copy strong {
  color: var(--sg-fg);
  font-size: 22px;
  font-weight: 680;
  line-height: 30px;
  white-space: nowrap;
}
.sg-knowledge-stat-copy small {
  overflow: hidden;
  color: var(--sg-success);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-knowledge-stat:nth-of-type(3) small {
  color: var(--sg-muted);
}

.sg-knowledge-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 350px;
  gap: 14px;
  align-items: start;
}
.sg-knowledge-main {
  min-width: 0;
}
.sg-knowledge-toolbar {
  min-width: 0;
  gap: 8px;
  margin-bottom: 12px;
}
.sg-knowledge-select.ant-select {
  width: 126px;
  flex: none;
}
.sg-knowledge-sort.ant-select {
  width: 112px;
  flex: none;
}
.sg-knowledge-select .ant-select-selector,
.sg-knowledge-sort .ant-select-selector {
  height: 34px;
  border-color: var(--sg-border);
  border-radius: 6px;
  background: var(--sg-bg-2);
}
.sg-knowledge-select .ant-select-selection-item,
.sg-knowledge-sort .ant-select-selection-item {
  line-height: 32px !important;
  color: var(--sg-fg-2);
  font-size: 12px;
}
.sg-knowledge-search {
  min-width: 150px;
  width: 220px;
  height: 34px;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  color: var(--sg-muted);
  background: var(--sg-bg-2);
}
.sg-knowledge-search:focus-within {
  border-color: var(--sg-accent);
}
.sg-knowledge-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--sg-fg);
  background: transparent;
  font-size: 12px;
}
.sg-knowledge-search input::placeholder {
  color: var(--sg-muted);
}
.sg-knowledge-toolbar-tail {
  min-width: 0;
  gap: 8px;
  margin-left: auto;
}
.sg-knowledge-view-toggle {
  height: 34px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  background: var(--sg-bg-2);
}
.sg-knowledge-view-toggle button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-right: 1px solid var(--sg-border);
  color: var(--sg-muted);
  background: transparent;
  cursor: pointer;
}
.sg-knowledge-view-toggle button:last-of-type {
  border-right: 0;
}
.sg-knowledge-view-toggle button:hover {
  color: var(--sg-fg);
}
.sg-knowledge-view-toggle button.active {
  color: #c8b2ff;
  background: rgba(124, 60, 255, 0.2);
}

.sg-knowledge-list {
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-knowledge-row {
  width: 100%;
  min-width: 0;
  min-height: 98px;
  gap: 15px;
  padding: 12px 12px 12px 14px;
  border-bottom: 1px solid var(--sg-border);
  border-top: 0;
  border-right: 0;
  border-left: 0;
  color: inherit;
  background: var(--sg-bg-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 150ms ease,
    box-shadow 150ms ease;
}
.sg-knowledge-row:last-of-type {
  border-bottom: 0;
}
.sg-knowledge-row:hover {
  background: #17151c;
}
.sg-knowledge-row.selected {
  background: #15121c;
  box-shadow:
    inset 2px 0 var(--sg-accent),
    inset 0 0 0 1px rgba(124, 60, 255, 0.65);
}
.sg-knowledge-row-primary {
  min-width: 220px;
  flex: 1;
  gap: 12px;
}
.sg-knowledge-item-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
}
.sg-knowledge-row-copy {
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
}
.sg-knowledge-row-copy > strong {
  display: flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  overflow: hidden;
  color: var(--sg-fg);
  font-size: 13.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-knowledge-row-copy > strong svg {
  flex: none;
  color: #ffb94b;
}
.sg-knowledge-row-copy > span:not(.sg-knowledge-tags) {
  display: block;
  max-width: 100%;
  margin-top: 3px;
  overflow: hidden;
  color: var(--sg-fg-2);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-knowledge-tags {
  display: flex;
  max-width: 100%;
  gap: 5px;
  margin-top: 6px;
  overflow: hidden;
}
.sg-knowledge-tags i,
.sg-knowledge-tags > span,
.sg-knowledge-detail-tags span {
  flex: none;
  padding: 2px 7px;
  border-radius: 4px;
  color: #aaa6ba;
  background: #1c1a22;
  font-size: 9.5px;
  font-style: normal;
  line-height: 16px;
}
.sg-knowledge-owner,
.sg-knowledge-updated,
.sg-knowledge-status {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 7px;
}
.sg-knowledge-owner {
  width: 92px;
}
.sg-knowledge-updated {
  width: 126px;
}
.sg-knowledge-status {
  width: 76px;
}
.sg-knowledge-owner > span,
.sg-knowledge-updated > span,
.sg-knowledge-status > span {
  color: var(--sg-muted);
  font-size: 10px;
}
.sg-knowledge-owner > div {
  min-height: 28px;
}
.sg-knowledge-owner .ant-avatar {
  margin-right: -5px;
  border: 2px solid var(--sg-bg-2);
  font-size: 10px !important;
}
.sg-knowledge-row.selected .sg-knowledge-owner .ant-avatar {
  border-color: #15121c;
}
.sg-knowledge-owner i {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  margin-left: 5px;
  border-radius: 50%;
  color: var(--sg-fg-2);
  background: #292633;
  font-size: 9px;
  font-style: normal;
}
.sg-knowledge-updated time {
  color: var(--sg-fg-2);
  font-size: 10.5px;
  white-space: nowrap;
}
.sg-knowledge-status b,
.sg-knowledge-availability {
  color: var(--sg-fg-2);
  font-size: 10.5px;
  font-weight: 500;
  white-space: nowrap;
}
.sg-knowledge-status b i,
.sg-knowledge-availability i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--sg-success);
}
.sg-knowledge-status.restricted b i,
.sg-knowledge-availability.restricted i {
  background: var(--sg-warning);
}
.sg-knowledge-more,
.sg-knowledge-card-more,
.sg-knowledge-detail-head > button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--sg-fg-2);
  background: transparent;
  cursor: pointer;
}
.sg-knowledge-more {
  width: 26px;
  height: 32px;
}
.sg-knowledge-more:hover,
.sg-knowledge-detail-head > button:hover {
  color: var(--sg-fg);
}
.sg-knowledge-list.compact .sg-knowledge-row {
  min-height: 70px;
  padding-block: 9px;
}
.sg-knowledge-list.compact .sg-knowledge-item-icon {
  width: 38px;
  height: 38px;
}

.sg-knowledge-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sg-knowledge-grid-card {
  width: 100%;
  display: flex;
  min-width: 0;
  min-height: 155px;
  flex-direction: column;
  padding: 14px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.sg-knowledge-grid-card:hover {
  background: #17151c;
}
.sg-knowledge-grid-card:focus-visible,
.sg-knowledge-row:focus-visible {
  outline: 2px solid var(--sg-accent);
  outline-offset: -2px;
}
.sg-knowledge-grid-card.selected {
  border-color: var(--sg-accent);
  box-shadow: inset 0 0 0 1px var(--sg-accent);
}
.sg-knowledge-grid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sg-knowledge-card-more {
  width: 28px;
  height: 28px;
}
.sg-knowledge-grid-card > strong {
  margin-top: 10px;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-knowledge-grid-card > p {
  display: -webkit-box;
  min-height: 32px;
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--sg-fg-2);
  font-size: 10.5px;
  line-height: 16px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.sg-knowledge-grid-meta {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 9px;
  color: var(--sg-muted);
  font-size: 9.5px;
}

.sg-knowledge-empty,
.sg-knowledge-detail-empty,
.sg-knowledge-panel-message {
  display: flex;
  min-height: 260px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--sg-muted);
  text-align: center;
}
.sg-knowledge-empty {
  min-height: 490px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-knowledge-empty strong,
.sg-knowledge-detail-empty strong,
.sg-knowledge-panel-message strong {
  color: var(--sg-fg);
  font-size: 13px;
}
.sg-knowledge-empty span,
.sg-knowledge-detail-empty span,
.sg-knowledge-panel-message p {
  margin: 0;
  font-size: 11px;
}
.sg-knowledge-pagination {
  justify-content: center;
  gap: 6px;
  margin-top: 13px;
}
.sg-knowledge-pagination button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sg-border);
  border-radius: 5px;
  color: var(--sg-fg-2);
  background: var(--sg-bg-2);
  font-size: 11px;
  cursor: pointer;
}
.sg-knowledge-pagination button:hover:not(:disabled) {
  border-color: var(--sg-accent);
  color: var(--sg-fg);
}
.sg-knowledge-pagination button.active {
  border-color: var(--sg-accent);
  color: #fff;
  background: var(--sg-accent);
}
.sg-knowledge-pagination button:disabled {
  opacity: 0.35;
  cursor: default;
}

.sg-knowledge-detail {
  position: sticky;
  top: 0;
  min-width: 0;
  min-height: 632px;
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-knowledge-detail-head {
  min-height: 58px;
  gap: 8px;
  padding: 12px 13px;
}
.sg-knowledge-detail-head > div {
  min-width: 0;
  flex: 1;
  gap: 5px;
}
.sg-knowledge-detail-head > div strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-knowledge-detail-head > div svg {
  flex: none;
  color: #ffb94b;
}
.sg-knowledge-availability {
  flex: none;
  padding: 3px 7px;
  border-radius: 5px;
  background: #181b1c;
}
.sg-knowledge-detail-head > button {
  width: 26px;
  height: 30px;
}
.sg-knowledge-detail-body {
  min-height: 486px;
  padding: 14px 15px;
}
.sg-knowledge-detail-description {
  margin: 0;
  color: var(--sg-fg-2);
  font-size: 11px;
  line-height: 18px;
}
.sg-knowledge-edit-link {
  margin-top: 5px;
  font-size: 10px;
}
.sg-knowledge-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 15px;
  margin: 14px 0 0;
  padding: 12px 0;
  border-top: 1px solid var(--sg-border);
  border-bottom: 1px solid var(--sg-border);
}
.sg-knowledge-meta-grid div {
  min-width: 0;
}
.sg-knowledge-meta-grid dt {
  margin-bottom: 4px;
  color: var(--sg-muted);
  font-size: 9.5px;
}
.sg-knowledge-meta-grid dd {
  min-width: 0;
  gap: 6px;
  margin: 0;
  overflow: hidden;
  color: var(--sg-fg-2);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-knowledge-meta-grid dd svg {
  flex: none;
  color: #8d6fe7;
}
.sg-knowledge-detail-tags,
.sg-knowledge-distribution,
.sg-knowledge-recent {
  padding-top: 12px;
}
.sg-knowledge-detail-tags h3,
.sg-knowledge-distribution h3,
.sg-knowledge-recent h3,
.sg-knowledge-panel-list h3,
.sg-knowledge-activity h3 {
  margin: 0 0 9px;
  color: var(--sg-fg);
  font-size: 11px;
  font-weight: 650;
}
.sg-knowledge-detail-tags > div {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.sg-knowledge-chart {
  gap: 18px;
}
.sg-knowledge-chart > i {
  width: 88px;
  height: 88px;
  flex: none;
  border-radius: 50%;
  background: conic-gradient(
    #6542db 0 35%,
    #2e9bd0 35% 60%,
    #4cba8c 60% 74%,
    #e8a446 74% 83%,
    #68bfd0 83% 92%,
    #9e96ad 92%
  );
  mask: radial-gradient(circle at center, transparent 0 48%, #000 50%);
}
.sg-knowledge-chart ul {
  min-width: 0;
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sg-knowledge-chart li {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  color: var(--sg-fg-2);
  font-size: 9px;
}
.sg-knowledge-chart li b {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
}
.sg-knowledge-chart li span {
  margin-left: auto;
  color: var(--sg-muted);
  white-space: nowrap;
}
.sg-knowledge-chart .pdf {
  background: #6542db;
}
.sg-knowledge-chart .word {
  background: #2e9bd0;
}
.sg-knowledge-chart .excel {
  background: #4cba8c;
}
.sg-knowledge-chart .ppt {
  background: #e8a446;
}
.sg-knowledge-chart .web {
  background: #68bfd0;
}
.sg-knowledge-chart .other {
  background: #9e96ad;
}
.sg-knowledge-recent {
  margin-top: 12px;
  border-top: 1px solid var(--sg-border);
}
.sg-knowledge-recent > div {
  justify-content: space-between;
}
.sg-knowledge-recent > div > button {
  font-size: 9.5px;
}
.sg-knowledge-recent > button {
  width: 100%;
  min-width: 0;
  height: 26px;
  gap: 7px;
  padding: 0;
  border: 0;
  color: var(--sg-fg-2);
  background: transparent;
  cursor: pointer;
}
.sg-knowledge-recent > button:hover {
  color: var(--sg-fg);
}
.sg-knowledge-recent > button > span {
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  color: white;
}
.sg-knowledge-recent .type-0 {
  background: #cc3a5d;
}
.sg-knowledge-recent .type-1 {
  background: #28a36d;
}
.sg-knowledge-recent .type-2 {
  background: #2e68cc;
}
.sg-knowledge-recent .type-3 {
  background: #d8782c;
}
.sg-knowledge-recent .type-4 {
  background: #7443d3;
}
.sg-knowledge-recent > button b {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 9.5px;
  font-weight: 500;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-knowledge-recent > button time {
  flex: none;
  color: var(--sg-muted);
  font-size: 9px;
}
.sg-knowledge-detail-actions {
  gap: 10px;
  padding: 12px 15px;
  border-top: 1px solid var(--sg-border);
}
.sg-knowledge-detail-actions .ant-btn {
  min-width: 0;
  flex: 1;
}
.sg-knowledge-panel-list > h3 {
  margin-bottom: 12px;
}
.sg-knowledge-panel-list > button {
  width: 100%;
  min-width: 0;
  gap: 9px;
  padding: 9px 0;
  border: 0;
  border-bottom: 1px solid var(--sg-border);
  color: var(--sg-fg-2);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.sg-knowledge-panel-list > button > span {
  min-width: 0;
  flex: 1;
}
.sg-knowledge-panel-list > button b,
.sg-knowledge-panel-list > button small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-knowledge-panel-list > button b {
  color: var(--sg-fg);
  font-size: 10.5px;
  font-weight: 550;
}
.sg-knowledge-panel-list > button small {
  margin-top: 3px;
  color: var(--sg-muted);
  font-size: 9px;
}
.sg-knowledge-panel-list > p {
  color: var(--sg-muted);
  font-size: 11px;
}
.sg-knowledge-panel-message {
  min-height: 420px;
}
.sg-knowledge-panel-message > svg {
  color: #9d79f6;
}
.sg-knowledge-activity p {
  display: grid;
  grid-template-columns: 8px 1fr;
  gap: 0 8px;
  margin: 0;
  padding: 10px 0;
  border-bottom: 1px solid var(--sg-border);
  color: var(--sg-fg-2);
  font-size: 10.5px;
}
.sg-knowledge-activity p > i {
  width: 7px;
  height: 7px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--sg-accent);
}
.sg-knowledge-activity p time {
  grid-column: 2;
  margin-top: 3px;
  color: var(--sg-muted);
  font-size: 9px;
}

@media (max-width: 1450px) {
  .sg-knowledge-workspace {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
  .sg-knowledge-owner {
    display: none;
  }
  .sg-knowledge-select.ant-select {
    width: 108px;
  }
  .sg-knowledge-search {
    min-width: 90px;
    width: auto;
    flex: 1;
  }
  .sg-knowledge-sort.ant-select {
    width: 102px;
  }
}
@media (max-width: 1020px) {
  .sg-knowledge-workspace {
    grid-template-columns: 1fr;
  }
  .sg-knowledge-detail {
    position: static;
  }
  .sg-knowledge-owner {
    display: flex;
  }
}
@media (max-width: 760px) {
  .sg-knowledge-head {
    align-items: flex-start;
  }
  .sg-knowledge-head > div {
    display: block;
  }
  .sg-knowledge-head .sg-h1 {
    font-size: 24px;
  }
  .sg-knowledge-head p {
    margin-top: 4px;
  }
  .sg-knowledge-help {
    display: none;
  }
  .sg-knowledge-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sg-knowledge-stat {
    min-height: 82px;
    padding: 12px;
  }
  .sg-knowledge-stat-icon {
    width: 40px;
    height: 40px;
  }
  .sg-knowledge-stat-copy strong {
    font-size: 17px;
  }
  .sg-knowledge-toolbar {
    flex-wrap: wrap;
  }
  .sg-knowledge-select.ant-select {
    width: calc(50% - 4px);
  }
  .sg-knowledge-search {
    width: 100%;
    order: 3;
  }
  .sg-knowledge-toolbar-tail {
    width: 100%;
    margin-left: 0;
  }
  .sg-knowledge-sort.ant-select {
    margin-left: auto;
  }
  .sg-knowledge-grid {
    grid-template-columns: 1fr;
  }
  .sg-knowledge-row {
    gap: 9px;
  }
  .sg-knowledge-updated,
  .sg-knowledge-status,
  .sg-knowledge-owner {
    display: none;
  }
  .sg-knowledge-item-icon {
    width: 38px;
    height: 38px;
  }
  .sg-knowledge-list,
  .sg-knowledge-grid {
    min-height: 0;
  }
  .sg-knowledge-detail {
    min-height: 0;
  }
  .sg-knowledge-chart {
    align-items: flex-start;
  }
}
`);
