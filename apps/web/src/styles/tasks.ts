import { createGlobalStyle, css } from "antd-style";

export const TasksGlobalStyles = createGlobalStyle(css`
/* Task center and task workspace: reference layout 2026-08-13. */
.sg-task-center,
.sg-task-new-page,
.sg-task-detail-page {
  min-width: 0;
  color: var(--sg-fg);
}
.sg-task-page-head {
  margin-bottom: 12px;
}
.sg-task-page-head h1,
.sg-task-new-head h1 {
  margin: 0;
  color: var(--sg-fg);
  font-size: 27px;
  line-height: 34px;
}
.sg-task-page-head p,
.sg-task-new-head p {
  margin: 3px 0 0;
  color: var(--sg-fg-2);
  font-size: 12px;
}
.sg-task-center-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 14px;
  align-items: start;
}
.sg-task-center-main,
.sg-task-detail-main,
.sg-task-new-main {
  min-width: 0;
}
.sg-task-tabs {
  display: flex;
  height: 43px;
  gap: 26px;
  border-bottom: 1px solid var(--sg-border);
}
.sg-task-tabs button,
.sg-task-detail-tabs button {
  position: relative;
  border: 0;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}
.sg-task-tabs button span {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  margin-left: 5px;
  padding: 0 6px;
  border-radius: 10px;
  background: #1b1921;
  font-size: 9px;
}
.sg-task-tabs button.active,
.sg-task-detail-tabs button.active {
  color: #b38fff;
}
.sg-task-tabs button.active::after,
.sg-task-detail-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--sg-accent);
  content: "";
}
.sg-task-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 0 12px;
}
.sg-task-search,
.sg-task-resource-search,
.sg-task-source-head label {
  display: flex;
  min-width: 0;
  height: 34px;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  color: var(--sg-muted);
  background: var(--sg-bg-2);
}
.sg-task-search {
  width: 240px;
}
.sg-task-search input,
.sg-task-resource-search input,
.sg-task-source-head input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--sg-fg);
  background: transparent;
  font-size: 11px;
}
.sg-task-filter-select.ant-select {
  width: 140px;
}
.sg-task-filter-select .ant-select-selector {
  height: 34px;
  border-color: var(--sg-border);
  border-radius: 6px;
  background: var(--sg-bg-2);
}
.sg-task-filter-select .ant-select-selection-item {
  line-height: 32px;
  color: var(--sg-fg-2);
  font-size: 11px;
}
.sg-task-refresh {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: none;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  color: var(--sg-fg-2);
  background: var(--sg-bg-2);
  cursor: pointer;
}
.sg-task-refresh.loading svg {
  animation: sg-task-spin 900ms linear infinite;
}
@keyframes sg-task-spin {
  to {
    transform: rotate(360deg);
  }
}
.sg-task-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.sg-task-row {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-task-row:hover {
  border-color: #3a3545;
  background: #151319;
}
.sg-task-row-hit {
  position: absolute;
  inset: 0;
  z-index: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.sg-task-row-top,
.sg-task-row-foot,
.sg-task-stage-strip,
.sg-task-row-copy > div,
.sg-task-progress-summary strong,
.sg-task-side-title,
.sg-task-recent-list button,
.sg-task-output-mini button,
.sg-task-schedule-entry,
.sg-schedule-form,
.sg-schedule-list > div,
.sg-task-description-field,
.sg-task-ai-optimize,
.sg-task-choice-grid button,
.sg-task-resource-list button,
.sg-task-notify-setting,
.sg-task-new-footer,
.sg-task-template-item,
.sg-task-history-item,
.sg-task-detail-title-row,
.sg-task-detail-title > div,
.sg-task-detail-hero-actions,
.sg-task-detail-meta,
.sg-task-stage-hero,
.sg-task-stage-hero > div,
.sg-task-process-timeline header,
.sg-task-panel-title,
.sg-task-live-log p,
.sg-task-preview-toolbar,
.sg-task-real-outputs > div:not(.sg-task-panel-title),
.sg-task-source-head,
.sg-task-sources > article,
.sg-task-report-toolbar,
.sg-task-report-block,
.sg-task-report-outputs > div,
.sg-task-team,
.sg-task-detail-sticky-actions {
  display: flex;
  align-items: center;
}
.sg-task-row-top {
  position: relative;
  z-index: 1;
  min-width: 0;
  gap: 13px;
  padding: 14px 16px 10px;
  pointer-events: none;
}
.sg-task-type-icon {
  display: inline-flex;
  width: 48px;
  height: 48px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #fff;
}
.sg-task-type-icon.violet,
.sg-task-template-item > span.violet {
  background: linear-gradient(145deg, #5630c9, #7c43f3);
}
.sg-task-type-icon.blue,
.sg-task-template-item > span.blue {
  background: linear-gradient(145deg, #2453a7, #3479ea);
}
.sg-task-type-icon.green,
.sg-task-template-item > span.green {
  background: linear-gradient(145deg, #147453, #2eb784);
}
.sg-task-type-icon.orange,
.sg-task-template-item > span.orange {
  background: linear-gradient(145deg, #a65317, #ed8d2c);
}
.sg-task-type-icon.cyan {
  background: linear-gradient(145deg, #157384, #29aabc);
}
.sg-task-row-copy {
  min-width: 0;
  flex: 1;
}
.sg-task-row-copy > div {
  gap: 8px;
}
.sg-task-row-copy strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-row-copy p {
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--sg-fg-2);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-status-pill {
  display: inline-flex;
  height: 21px;
  flex: none;
  align-items: center;
  padding: 0 8px;
  border-radius: 5px;
  color: #a98bff;
  background: rgba(124, 60, 255, 0.16);
  font-size: 9.5px;
  font-weight: 500;
}
.sg-task-status-pill.completed {
  color: var(--sg-success);
  background: rgba(67, 209, 158, 0.12);
}
.sg-task-status-pill.partial_completed {
  color: var(--sg-warning);
  background: rgba(255, 177, 74, 0.13);
}
.sg-task-status-pill.failed,
.sg-task-status-pill.cancelled {
  color: #ff6573;
  background: rgba(255, 82, 96, 0.12);
}
.sg-task-status-pill.created,
.sg-task-status-pill.pending {
  color: var(--sg-fg-2);
  background: #211f27;
}
.sg-task-tags {
  display: flex;
  max-width: 100%;
  gap: 5px;
  margin-top: 6px;
  overflow: hidden;
}
.sg-task-tags span {
  flex: none;
  padding: 2px 7px;
  border-radius: 4px;
  color: #a8a4b5;
  background: #1d1b23;
  font-size: 9px;
}
.sg-task-progress-summary {
  width: 230px;
  flex: none;
}
.sg-task-progress-summary strong {
  gap: 6px;
  color: var(--sg-fg);
  font-size: 18px;
}
.sg-task-progress-summary strong.complete {
  color: var(--sg-success);
  font-size: 12px;
}
.sg-task-progress-summary strong small {
  color: var(--sg-fg-2);
  font-size: 9px;
  font-weight: 400;
}
.sg-task-progress-summary > span {
  display: block;
  margin-top: 5px;
  color: var(--sg-muted);
  font-size: 9.5px;
}
.sg-task-progress-track {
  height: 5px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: #24212d;
}
.sg-task-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6e35ef, #914cff);
}
.sg-task-progress-track.warning i {
  background: #ed8d2c;
}
.sg-task-stage-strip {
  position: relative;
  z-index: 1;
  justify-content: space-between;
  gap: 7px;
  margin: 0 14px 9px;
  padding: 8px 14px;
  border: 1px solid #24212d;
  border-radius: 6px;
  pointer-events: none;
}
.sg-task-stage-strip > span {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 6px;
  color: var(--sg-muted);
  font-size: 9.5px;
  white-space: nowrap;
}
.sg-task-stage-strip > span > i {
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 1px solid #5c586a;
  border-radius: 50%;
  font-size: 8px;
  font-style: normal;
}
.sg-task-stage-strip > span.done {
  color: var(--sg-fg-2);
}
.sg-task-stage-strip > span.done > i {
  border-color: var(--sg-success);
  color: #07130f;
  background: var(--sg-success);
}
.sg-task-stage-strip > span.current {
  color: var(--sg-fg);
}
.sg-task-stage-strip > span.current > i {
  border-color: var(--sg-accent);
  color: #fff;
  background: var(--sg-accent);
}
.sg-task-stage-strip > span > svg {
  margin-left: auto;
  color: #4e4a58;
}
.sg-task-row-foot {
  position: relative;
  z-index: 2;
  gap: 18px;
  min-height: 36px;
  padding: 7px 14px;
  border-top: 1px solid #24212d;
  color: var(--sg-muted);
  font-size: 9.5px;
}
.sg-task-row-foot > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.sg-task-row-foot-end {
  margin-left: auto;
}
.sg-task-inline-actions {
  display: flex;
  gap: 7px;
}
.sg-task-more {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--sg-fg-2);
  background: transparent;
  cursor: pointer;
}
.sg-task-empty {
  display: flex;
  min-height: 280px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  color: var(--sg-muted);
  background: var(--sg-bg-2);
}
.sg-task-empty strong {
  color: var(--sg-fg);
  font-size: 13px;
}
.sg-task-empty span {
  font-size: 10.5px;
}

.sg-task-center-side,
.sg-task-detail-side,
.sg-task-new-side {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}
.sg-task-side-card,
.sg-task-new-side > section {
  overflow: hidden;
  padding: 14px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-task-side-title {
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 11px;
}
.sg-task-side-title h2 {
  margin: 0;
  color: var(--sg-fg);
  font-size: 12px;
  font-weight: 680;
}
.sg-task-side-title > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--sg-fg-2);
  font-size: 9px;
}
.sg-task-side-title button {
  padding: 0;
  border: 0;
  color: #a47fff;
  background: transparent;
  font-size: 9px;
  cursor: pointer;
}
.sg-task-overview-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  overflow: hidden;
  border: 1px solid #24212d;
  border-radius: 6px;
}
.sg-task-overview-grid > div {
  display: flex;
  min-height: 60px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #24212d;
  border-bottom: 1px solid #24212d;
}
.sg-task-overview-grid > div:nth-of-type(3n) {
  border-right: 0;
}
.sg-task-overview-grid > div:nth-of-type(n + 4) {
  border-bottom: 0;
}
.sg-task-overview-grid strong {
  font-size: 18px;
}
.sg-task-overview-grid strong.violet {
  color: #8c56ff;
}
.sg-task-overview-grid strong.green {
  color: var(--sg-success);
}
.sg-task-overview-grid strong.red {
  color: #ff5462;
}
.sg-task-overview-grid strong.orange {
  color: var(--sg-warning);
}
.sg-task-overview-grid span {
  margin-top: 3px;
  color: var(--sg-fg-2);
  font-size: 9px;
}
.sg-task-recent-list button,
.sg-task-output-mini button {
  width: 100%;
  min-width: 0;
  gap: 8px;
  padding: 8px 0;
  border: 0;
  border-bottom: 1px solid #24212d;
  color: var(--sg-fg-2);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.sg-task-recent-list button:last-of-type,
.sg-task-output-mini button:last-of-type {
  border-bottom: 0;
}
.sg-task-recent-list button > span,
.sg-task-output-mini button > span {
  display: inline-flex;
  width: 29px;
  height: 29px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: #fff;
}
.sg-task-recent-list .violet,
.sg-task-output-mini .violet {
  background: #6130d5;
}
.sg-task-recent-list .green,
.sg-task-output-mini .green {
  background: #258e68;
}
.sg-task-recent-list .blue,
.sg-task-output-mini .blue {
  background: #2d65c7;
}
.sg-task-output-mini .red {
  background: #ca465b;
}
.sg-task-output-mini .orange {
  background: #c66c26;
}
.sg-task-recent-list button > i,
.sg-task-output-mini button > i {
  min-width: 0;
  flex: 1;
  font-style: normal;
}
.sg-task-recent-list b,
.sg-task-output-mini b {
  display: block;
  overflow: hidden;
  color: var(--sg-fg);
  font-size: 10px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-recent-list small,
.sg-task-output-mini small {
  display: block;
  margin-top: 3px;
  color: var(--sg-muted);
  font-size: 8.5px;
}
.sg-task-recent-list > p {
  color: var(--sg-muted);
  font-size: 10px;
}
.sg-task-notice-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.sg-task-notice-list li {
  display: grid;
  grid-template-columns: 7px 1fr;
  gap: 3px 7px;
  margin-bottom: 8px;
  color: var(--sg-fg-2);
  font-size: 9px;
  line-height: 14px;
}
.sg-task-notice-list li > i {
  width: 6px;
  height: 6px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--sg-success);
}
.sg-task-notice-list li > i.red {
  background: #ff5462;
}
.sg-task-notice-list li > i.blue {
  background: #4f83e8;
}
.sg-task-notice-list time {
  grid-column: 2;
  color: var(--sg-muted);
  font-size: 8px;
}
.sg-task-settings-card dl,
.sg-task-info-list {
  margin: 0;
}
.sg-task-settings-card dl > div,
.sg-task-info-list > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
  font-size: 9.5px;
}
.sg-task-settings-card dt,
.sg-task-info-list dt {
  color: var(--sg-muted);
}
.sg-task-settings-card dd,
.sg-task-info-list dd {
  margin: 0;
  color: var(--sg-fg-2);
  text-align: right;
}
.sg-task-info-list dd.priority {
  color: var(--sg-warning);
}
.sg-task-settings-card .ant-switch {
  min-width: 30px;
  transform: scale(0.8);
  transform-origin: right center;
}
.sg-task-schedule-entry {
  width: 100%;
  gap: 7px;
  padding: 9px 0 0;
  border: 0;
  border-top: 1px solid #24212d;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 9.5px;
  cursor: pointer;
}
.sg-task-schedule-entry span {
  margin-left: auto;
}
.sg-schedule-form {
  gap: 8px;
}
.sg-schedule-form > * {
  min-width: 0;
  flex: 1;
}
.sg-schedule-list {
  margin-top: 16px;
}
.sg-schedule-list > div {
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sg-border);
}
.sg-schedule-list > div > span {
  min-width: 0;
  flex: 1;
}
.sg-schedule-list strong,
.sg-schedule-list small {
  display: block;
}
.sg-schedule-list strong {
  color: var(--sg-fg);
  font-size: 11px;
}
.sg-schedule-list small {
  margin-top: 3px;
  overflow: hidden;
  color: var(--sg-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-schedule-list button {
  border: 0;
  color: #ff6573;
  background: transparent;
  cursor: pointer;
}

/* Task creation */
.sg-task-new-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}
.sg-task-new-main {
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: #0f0e13;
}
.sg-task-new-head {
  padding: 16px 18px 6px;
}
.sg-task-new-head h1 {
  font-size: 17px;
}
.sg-task-wizard-steps {
  display: flex;
  margin: 0;
  padding: 18px 24px;
  list-style: none;
}
.sg-task-wizard-steps li {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 8px;
  color: var(--sg-muted);
  font-size: 10px;
}
.sg-task-wizard-steps li > i {
  display: inline-flex;
  width: 23px;
  height: 23px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 1px solid #5c5868;
  border-radius: 50%;
  font-size: 9px;
  font-style: normal;
}
.sg-task-wizard-steps li > b {
  height: 1px;
  flex: 1;
  margin: 0 10px;
  background: #302d38;
}
.sg-task-wizard-steps li.active {
  color: var(--sg-fg);
}
.sg-task-wizard-steps li.active > i {
  border-color: var(--sg-accent);
  color: #fff;
  background: var(--sg-accent);
}
.sg-task-wizard-steps li.done > i {
  border-color: var(--sg-success);
  color: #07130f;
  background: var(--sg-success);
}
.sg-task-new-section-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 16px;
}
.sg-task-new-section {
  position: relative;
  padding: 15px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: var(--sg-bg-2);
}
.sg-task-new-main > .sg-task-new-section {
  margin: 0 16px 16px;
}
.sg-task-section-title {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 12px;
}
.sg-task-section-title > i {
  display: inline-flex;
  width: 20px;
  height: 20px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #d6c8ff;
  background: rgba(124, 60, 255, 0.22);
  font-size: 9px;
  font-style: normal;
}
.sg-task-section-title h2 {
  margin: 0;
  font-size: 12px;
}
.sg-task-section-title p {
  margin: 4px 0 0;
  color: var(--sg-muted);
  font-size: 9.5px;
}
.sg-task-description-field {
  position: relative;
  flex-direction: column;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  background: #0f0e13;
}
.sg-task-description-field textarea {
  min-height: 96px;
  resize: vertical;
  padding: 11px;
  border: 0;
  outline: 0;
  color: var(--sg-fg);
  background: transparent;
  font: 11px / 1.7 var(--sg-font);
}
.sg-task-description-field > span {
  padding: 0 10px 7px;
  color: var(--sg-muted);
  font-size: 8px;
  text-align: right;
}
.sg-task-ai-optimize {
  width: max-content;
  gap: 5px;
  margin: 7px 0 12px auto;
  padding: 5px 9px;
  border: 1px solid #60429c;
  border-radius: 5px;
  color: #af8cff;
  background: transparent;
  font-size: 9px;
  cursor: pointer;
}
.sg-task-new-two-col,
.sg-task-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sg-task-new-two-col > div > span,
.sg-task-config-grid > div > span {
  display: block;
  margin-bottom: 6px;
  color: var(--sg-fg-2);
  font-size: 9.5px;
}
.sg-task-choice-grid {
  display: grid;
  gap: 8px;
}
.sg-task-choice-grid.five {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.sg-task-choice-grid.six {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
.sg-task-choice-grid button {
  position: relative;
  min-width: 0;
  min-height: 58px;
  gap: 8px;
  padding: 9px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  color: var(--sg-fg-2);
  background: #0f0e13;
  text-align: left;
  cursor: pointer;
}
.sg-task-choice-grid button.selected {
  border-color: var(--sg-accent);
  color: #b697ff;
  background: rgba(124, 60, 255, 0.09);
}
.sg-task-choice-grid button > span {
  min-width: 0;
}
.sg-task-choice-grid button b,
.sg-task-choice-grid button small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-choice-grid button b {
  color: var(--sg-fg);
  font-size: 9.5px;
}
.sg-task-choice-grid button small {
  margin-top: 4px;
  color: var(--sg-muted);
  font-size: 8px;
}
.sg-task-choice-grid button > svg:last-of-type {
  position: absolute;
  top: 7px;
  right: 7px;
  color: #a57fff;
}
.sg-task-resource-search {
  max-width: 360px;
  margin-bottom: 10px;
}
.sg-task-resource-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.sg-task-resource-list button {
  min-width: 0;
  gap: 9px;
  padding: 10px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  color: var(--sg-fg-2);
  background: #0f0e13;
  text-align: left;
  cursor: pointer;
}
.sg-task-resource-list button.selected {
  border-color: var(--sg-accent);
}
.sg-task-resource-list button > span {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: #a98aff;
  background: rgba(124, 60, 255, 0.15);
}
.sg-task-resource-list button > i {
  min-width: 0;
  flex: 1;
  font-style: normal;
}
.sg-task-resource-list b,
.sg-task-resource-list small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-resource-list b {
  color: var(--sg-fg);
  font-size: 10px;
}
.sg-task-resource-list small {
  margin-top: 4px;
  color: var(--sg-muted);
  font-size: 8px;
}
.sg-task-notify-setting {
  justify-content: space-between;
  gap: 10px;
  margin-top: 13px;
  padding: 11px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
}
.sg-task-notify-setting > span {
  display: flex;
  align-items: center;
  gap: 9px;
}
.sg-task-notify-setting i {
  font-style: normal;
}
.sg-task-notify-setting b,
.sg-task-notify-setting small {
  display: block;
}
.sg-task-notify-setting b {
  font-size: 10px;
}
.sg-task-notify-setting small {
  margin-top: 3px;
  color: var(--sg-muted);
  font-size: 8.5px;
}
.sg-task-confirm dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
.sg-task-confirm dl > div {
  padding: 10px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
}
.sg-task-confirm dt {
  margin-bottom: 5px;
  color: var(--sg-muted);
  font-size: 9px;
}
.sg-task-confirm dd {
  margin: 0;
  color: var(--sg-fg-2);
  font-size: 10px;
  line-height: 1.5;
}
.sg-task-credit-estimate {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 12px;
  border-radius: 6px;
  color: #b595ff;
  background: rgba(124, 60, 255, 0.1);
}
.sg-task-credit-estimate b,
.sg-task-credit-estimate small {
  display: block;
}
.sg-task-credit-estimate b {
  font-size: 10px;
}
.sg-task-credit-estimate small {
  margin-top: 3px;
  color: var(--sg-muted);
  font-size: 8px;
}
.sg-task-new-footer {
  justify-content: space-between;
  padding: 13px 16px;
  border-top: 1px solid var(--sg-border);
}
.sg-task-new-footer .ant-btn {
  min-width: 90px;
}
.sg-task-new-footer .ant-btn-primary {
  min-width: 160px;
}
.sg-task-new-side > section {
  padding: 14px;
}
.sg-task-template-item,
.sg-task-history-item {
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
.sg-task-template-item:last-of-type,
.sg-task-history-item:last-of-type {
  border-bottom: 0;
}
.sg-task-template-item > span {
  display: inline-flex;
  width: 37px;
  height: 37px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: #fff;
}
.sg-task-template-item > i {
  min-width: 0;
  flex: 1;
  font-style: normal;
}
.sg-task-template-item b,
.sg-task-template-item small,
.sg-task-template-item em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sg-task-template-item b {
  color: var(--sg-fg);
  font-size: 10px;
}
.sg-task-template-item small {
  margin-top: 3px;
  color: var(--sg-fg-2);
  font-size: 8px;
  line-height: 13px;
}
.sg-task-template-item em {
  margin-top: 4px;
  color: var(--sg-muted);
  font-size: 8px;
  font-style: normal;
  white-space: nowrap;
}
.sg-task-history-item > span {
  min-width: 0;
  flex: 1;
}
.sg-task-history-item b,
.sg-task-history-item small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-history-item b {
  color: var(--sg-fg);
  font-size: 9.5px;
}
.sg-task-history-item small {
  margin-top: 3px;
  color: var(--sg-muted);
  font-size: 8px;
}
.sg-task-tip-card h2 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 8px;
  font-size: 12px;
}
.sg-task-tip-card h2 svg {
  color: var(--sg-warning);
}
.sg-task-tip-card ul {
  margin: 0;
  padding-left: 17px;
  color: var(--sg-fg-2);
  font-size: 9px;
  line-height: 1.8;
}

/* Task detail */
.sg-task-detail-hero {
  padding: 14px 16px 0;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-task-detail-title-row {
  min-width: 0;
  gap: 13px;
}
.sg-task-detail-title {
  min-width: 0;
  flex: 1;
}
.sg-task-detail-title > div {
  gap: 8px;
}
.sg-task-detail-title h1 {
  margin: 0;
  overflow: hidden;
  font-size: 19px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-detail-title p {
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--sg-fg-2);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-detail-progress {
  width: 250px;
  flex: none;
}
.sg-task-detail-progress strong {
  font-size: 19px;
}
.sg-task-detail-progress > div {
  height: 5px;
  margin: 7px 0;
  overflow: hidden;
  border-radius: 3px;
  background: #24212d;
}
.sg-task-detail-progress > div i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #6e35ef, #914cff);
}
.sg-task-detail-progress span {
  color: var(--sg-muted);
  font-size: 9.5px;
}
.sg-task-detail-hero-actions {
  gap: 7px;
  margin-left: 12px;
}
.sg-task-detail-meta {
  gap: 20px;
  margin: 10px 0 12px 61px;
  color: var(--sg-muted);
  font-size: 9px;
}
.sg-task-stage-hero {
  justify-content: space-between;
  padding: 11px 14px;
  border-top: 1px solid var(--sg-border);
}
.sg-task-stage-hero > div {
  min-width: 0;
  flex: 1;
  gap: 9px;
  color: var(--sg-muted);
}
.sg-task-stage-hero > div > i {
  display: inline-flex;
  width: 23px;
  height: 23px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 1px solid #5c5868;
  border-radius: 50%;
  font-size: 9px;
  font-style: normal;
}
.sg-task-stage-hero > div > span {
  min-width: 0;
}
.sg-task-stage-hero b,
.sg-task-stage-hero small {
  display: block;
  white-space: nowrap;
}
.sg-task-stage-hero b {
  color: var(--sg-fg-2);
  font-size: 10px;
}
.sg-task-stage-hero small {
  margin-top: 3px;
  font-size: 8px;
}
.sg-task-stage-hero > div.done,
.sg-task-stage-hero > div.completed {
  color: var(--sg-success);
}
.sg-task-stage-hero > div.completed > i {
  border-color: var(--sg-success);
  color: #07130f;
  background: var(--sg-success);
}
.sg-task-stage-hero > div.running > i {
  border-color: var(--sg-accent);
  color: #fff;
  background: var(--sg-accent);
  box-shadow: 0 0 0 5px rgba(124, 60, 255, 0.12);
}
.sg-task-stage-hero > div > svg {
  margin-left: auto;
  color: #494553;
}
.sg-task-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 12px;
  align-items: start;
  margin-top: 12px;
}
.sg-task-detail-main {
  position: relative;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-task-detail-tabs {
  display: flex;
  height: 44px;
  gap: 22px;
  padding: 0 14px;
  overflow-x: auto;
  border-bottom: 1px solid var(--sg-border);
}
.sg-task-detail-tabs button {
  flex: none;
}
.sg-task-process-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 10px;
  padding: 12px;
}
.sg-task-process-timeline,
.sg-task-live-log,
.sg-task-process-preview {
  min-width: 0;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: #0f0e13;
}
.sg-task-process-timeline {
  padding: 12px 14px;
}
.sg-task-process-timeline article {
  position: relative;
  display: grid;
  grid-template-columns: 23px 1fr;
  gap: 9px;
  min-height: 64px;
}
.sg-task-process-timeline article::after {
  position: absolute;
  top: 23px;
  bottom: 0;
  left: 11px;
  width: 1px;
  background: #3a3545;
  content: "";
}
.sg-task-process-timeline article:last-of-type::after {
  display: none;
}
.sg-task-process-timeline article > i {
  display: inline-flex;
  width: 23px;
  height: 23px;
  z-index: 1;
  align-items: center;
  justify-content: center;
  border: 1px solid #4b4755;
  border-radius: 50%;
  color: var(--sg-muted);
  background: #0f0e13;
  font-size: 9px;
  font-style: normal;
}
.sg-task-process-timeline article.completed > i {
  border-color: var(--sg-success);
  color: #07130f;
  background: var(--sg-success);
}
.sg-task-process-timeline article.running > i {
  border-color: var(--sg-accent);
  color: #fff;
  background: var(--sg-accent);
}
.sg-task-process-timeline article > div {
  min-width: 0;
  padding-bottom: 12px;
}
.sg-task-process-timeline header {
  min-width: 0;
  gap: 7px;
}
.sg-task-process-timeline header strong {
  overflow: hidden;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-process-timeline header time {
  margin-left: auto;
  color: var(--sg-muted);
  font-size: 8px;
}
.sg-task-process-timeline article p {
  margin: 4px 0;
  color: var(--sg-muted);
  font-size: 9px;
}
.sg-task-step-progress {
  display: grid;
  grid-template-columns: 70px 1fr;
  align-items: center;
  gap: 7px;
  color: var(--sg-fg-2);
  font-size: 8.5px;
}
.sg-task-step-progress > i {
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: #282530;
}
.sg-task-step-progress > i b {
  display: block;
  height: 100%;
  background: var(--sg-accent);
}
.sg-task-live-log {
  padding: 12px 14px;
}
.sg-task-panel-title {
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.sg-task-panel-title h3 {
  margin: 0;
  font-size: 11px;
}
.sg-task-panel-title > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--sg-success);
  font-size: 8.5px;
}
.sg-task-panel-title > span i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sg-success);
}
.sg-task-panel-title button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  color: #a783ff;
  background: transparent;
  font-size: 8.5px;
  cursor: pointer;
}
.sg-task-live-log p {
  display: grid;
  grid-template-columns: 38px 7px minmax(0, 1fr) auto;
  gap: 7px;
  margin: 0;
  padding: 6px 0;
  color: var(--sg-fg-2);
  font-size: 8.5px;
}
.sg-task-live-log p time {
  color: var(--sg-muted);
}
.sg-task-live-log p > i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sg-success);
}
.sg-task-live-log p > i.current {
  background: var(--sg-accent);
}
.sg-task-live-log p b {
  font-weight: 500;
}
.sg-task-live-log > .ant-btn {
  display: block;
  margin: 14px auto 0;
}
.sg-task-process-preview {
  grid-column: 1 / -1;
  padding: 12px;
}
.sg-task-preview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}
.sg-task-preview-grid > article {
  min-width: 0;
  height: 130px;
  padding: 10px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
}
.sg-task-preview-grid h4 {
  margin: 0 0 8px;
  font-size: 9.5px;
}
.sg-task-mini-bars,
.sg-task-large-bars,
.sg-task-report-bars {
  display: flex;
  height: 85px;
  align-items: flex-end;
  justify-content: space-around;
  gap: 7px;
}
.sg-task-mini-bars i,
.sg-task-large-bars i,
.sg-task-report-bars i {
  display: block;
  width: 14px;
  min-height: 6px;
  background: linear-gradient(#8c5bf5, #5930c8);
}
.sg-task-mini-donut,
.sg-task-large-donut,
.sg-task-report-donut {
  display: flex;
  height: 90px;
  align-items: center;
  justify-content: center;
}
.sg-task-mini-donut i,
.sg-task-large-donut i,
.sg-task-report-donut i {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: conic-gradient(#6d42dd 0 32%, #3689dd 32% 58%, #45b78a 58% 78%, #e6953e 78%);
  mask: radial-gradient(circle, transparent 0 45%, #000 47%);
}
.sg-task-mini-line {
  display: flex;
  height: 85px;
  align-items: flex-end;
  gap: 8px;
  padding: 10px;
  background: linear-gradient(160deg, transparent 48%, #7548df 49% 51%, transparent 52%);
}
.sg-task-mini-line i {
  width: 6px;
  height: 6px;
  margin-bottom: calc(var(--i, 1) * 8px);
  border-radius: 50%;
  background: #8e62ed;
}
.sg-task-preview-grid table {
  width: 100%;
  color: var(--sg-fg-2);
  font-size: 8px;
}
.sg-task-preview-grid td {
  padding: 5px;
  border-bottom: 1px solid var(--sg-border);
}

.sg-task-findings,
.sg-task-output-preview,
.sg-task-sources,
.sg-task-settings {
  padding: 13px;
}
.sg-task-findings > section,
.sg-task-settings > section {
  padding: 13px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: #0f0e13;
}
.sg-task-findings > section h2,
.sg-task-settings h2,
.sg-task-source-head h2 {
  margin: 0 0 7px;
  font-size: 12px;
}
.sg-task-findings > section p,
.sg-task-settings > section > p {
  margin: 0;
  color: var(--sg-fg-2);
  font-size: 9.5px;
  line-height: 1.65;
}
.sg-task-finding-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin-top: 10px;
}
.sg-task-finding-grid article {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: #0f0e13;
}
.sg-task-finding-grid article > span {
  color: #8c5cff;
}
.sg-task-finding-grid h3 {
  margin: 7px 0;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-finding-grid strong {
  font-size: 22px;
}
.sg-task-finding-grid p {
  margin: 5px 0 9px;
  color: var(--sg-muted);
  font-size: 8.5px;
}
.sg-task-finding-grid button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  color: #9e76fa;
  background: transparent;
  font-size: 8.5px;
  cursor: pointer;
}
.sg-task-preview-toolbar {
  justify-content: space-between;
  margin-bottom: 10px;
}
.sg-task-preview-toolbar > div {
  display: flex;
  gap: 7px;
}
.sg-task-preview-toolbar > div button {
  padding: 7px 12px;
  border: 1px solid var(--sg-border);
  border-radius: 5px;
  color: var(--sg-fg-2);
  background: #0f0e13;
  font-size: 9px;
  cursor: pointer;
}
.sg-task-preview-toolbar > div button.active {
  border-color: var(--sg-accent);
  color: #b99cff;
  background: rgba(124, 60, 255, 0.12);
}
.sg-task-preview-body {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: #0f0e13;
}
.sg-task-preview-body > nav {
  padding: 12px;
  border-right: 1px solid var(--sg-border);
}
.sg-task-preview-body > nav h3 {
  margin: 0 0 9px;
  font-size: 11px;
}
.sg-task-preview-body > nav button {
  display: block;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 4px;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 8.5px;
  text-align: left;
  cursor: pointer;
}
.sg-task-preview-body > nav button.active {
  color: #b99cff;
  background: rgba(124, 60, 255, 0.14);
}
.sg-task-preview-body > article {
  min-width: 0;
  padding: 15px;
}
.sg-task-preview-body > article h2 {
  margin: 0 0 7px;
  font-size: 15px;
}
.sg-task-preview-body > article > p {
  margin: 0 0 12px;
  color: var(--sg-fg-2);
  font-size: 9px;
  line-height: 1.6;
}
.sg-task-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.sg-task-kpi-grid > div {
  padding: 10px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
}
.sg-task-kpi-grid span,
.sg-task-kpi-grid i {
  display: block;
  color: var(--sg-muted);
  font-size: 8px;
  font-style: normal;
}
.sg-task-kpi-grid strong {
  display: block;
  margin: 6px 0;
  font-size: 17px;
}
.sg-task-kpi-grid strong small {
  margin-left: 3px;
  font-size: 8px;
  font-weight: 400;
}
.sg-task-kpi-grid i {
  color: var(--sg-success);
}
.sg-task-preview-charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin-top: 9px;
}
.sg-task-preview-charts > section {
  padding: 10px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
}
.sg-task-preview-charts h3 {
  margin: 0;
  font-size: 9px;
}
.sg-task-large-bars i {
  position: relative;
  width: 22px;
}
.sg-task-large-bars i span {
  position: absolute;
  top: 100%;
  left: 50%;
  margin-top: 5px;
  color: var(--sg-muted);
  font-size: 7px;
  transform: translateX(-50%);
}
.sg-task-large-donut i {
  width: 90px;
  height: 90px;
}
.sg-task-real-outputs {
  margin-top: 10px;
  padding: 11px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: #0f0e13;
}
.sg-task-real-outputs > div:not(.sg-task-panel-title) {
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--sg-border);
}
.sg-task-real-outputs > div > span {
  min-width: 0;
  flex: 1;
}
.sg-task-real-outputs b,
.sg-task-real-outputs small {
  display: block;
}
.sg-task-real-outputs b {
  font-size: 9.5px;
}
.sg-task-real-outputs small,
.sg-task-real-outputs > p {
  color: var(--sg-muted);
  font-size: 8.5px;
}
.sg-task-source-head {
  justify-content: space-between;
  margin-bottom: 10px;
}
.sg-task-source-head label {
  width: 220px;
}
.sg-task-sources > article {
  gap: 10px;
  padding: 11px;
  border-top: 1px solid var(--sg-border);
}
.sg-task-sources > article > span {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: #9d79f6;
  background: rgba(124, 60, 255, 0.12);
}
.sg-task-sources > article > div {
  min-width: 0;
  flex: 1;
}
.sg-task-sources strong,
.sg-task-sources p,
.sg-task-sources small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-sources strong {
  font-size: 10px;
}
.sg-task-sources p {
  margin: 3px 0;
  color: var(--sg-fg-2);
  font-size: 8.5px;
}
.sg-task-sources small {
  color: var(--sg-muted);
  font-size: 8px;
}
.sg-task-sources > article > b {
  color: var(--sg-success);
  font-size: 8.5px;
  font-weight: 500;
}
.sg-task-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sg-task-settings dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}
.sg-task-settings dl > div {
  padding: 9px;
  border: 1px solid var(--sg-border);
  border-radius: 5px;
}
.sg-task-settings dt {
  margin-bottom: 4px;
  color: var(--sg-muted);
  font-size: 8.5px;
}
.sg-task-settings dd {
  margin: 0;
  color: var(--sg-fg-2);
  font-size: 9.5px;
}

.sg-task-report {
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
  min-height: 660px;
  background: #0b0a0f;
}
.sg-task-report-outline {
  padding: 16px 12px;
  border-right: 1px solid var(--sg-border);
  background: #0f0e13;
}
.sg-task-report-outline > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  color: var(--sg-muted);
}
.sg-task-report-outline h3 {
  margin: 0;
  color: var(--sg-fg);
  font-size: 12px;
}
.sg-task-report-outline nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sg-task-report-outline button {
  display: flex;
  width: 100%;
  min-height: 30px;
  align-items: center;
  gap: 6px;
  padding: 6px 7px;
  border: 0;
  border-radius: 4px;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 9px;
  text-align: left;
  cursor: pointer;
}
.sg-task-report-outline button:hover,
.sg-task-report-outline button.selected,
.sg-task-report-outline button.active {
  color: #b99cff;
  background: rgba(124, 60, 255, 0.14);
}
.sg-task-report-outline button.done > svg {
  color: var(--sg-success);
}
.sg-task-report-outline button > span {
  display: inline-flex;
  width: 13px;
  height: 13px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  background: var(--sg-accent);
  font-size: 7px;
}
.sg-task-report-outline button b {
  overflow: hidden;
  flex: 1;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-task-report-outline button.child {
  padding-left: 29px;
  color: var(--sg-muted);
}
.sg-task-report-outline button.child.selected {
  color: #b99cff;
}
.sg-task-report-viewer {
  min-width: 0;
  overflow: hidden;
  background: #0b0a0f;
}
.sg-task-report-toolbar {
  display: grid;
  grid-template-columns: 1fr auto auto 1fr;
  min-height: 44px;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--sg-border);
  color: var(--sg-fg-2);
  font-size: 9px;
}
.sg-task-report-toolbar-start,
.sg-task-report-toolbar-end,
.sg-task-report-page-control,
.sg-task-report-zoom {
  display: flex;
  align-items: center;
}
.sg-task-report-toolbar-start,
.sg-task-report-toolbar-end {
  gap: 3px;
}
.sg-task-report-toolbar-end {
  justify-content: flex-end;
}
.sg-task-report-toolbar button {
  display: inline-flex;
  height: 28px;
  min-width: 28px;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 9px;
  cursor: pointer;
}
.sg-task-report-toolbar button:hover {
  border-color: var(--sg-border);
  color: var(--sg-fg);
  background: #18161d;
}
.sg-task-report-page-control,
.sg-task-report-zoom {
  height: 28px;
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 4px;
  background: #111016;
}
.sg-task-report-page-control input {
  width: 34px;
  height: 100%;
  padding: 0;
  border: 0;
  color: var(--sg-fg);
  background: #18161d;
  font-size: 9px;
  text-align: center;
  appearance: textfield;
}
.sg-task-report-page-control input::-webkit-inner-spin-button {
  appearance: none;
}
.sg-task-report-page-control span {
  padding: 0 8px;
}
.sg-task-report-zoom button:nth-of-type(2) {
  min-width: 46px;
  border-inline: 1px solid var(--sg-border);
  border-radius: 0;
}
.sg-task-report-canvas {
  height: 616px;
  overflow: auto;
  padding: 12px;
  background: #08070b;
}
.sg-task-report-canvas > article {
  width: min(100%, 760px);
  min-height: 780px;
  margin: 0 auto;
  padding: 28px 30px;
  color: #201d29;
  background: #faf9fc;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.28);
  transform-origin: top center;
  transition: transform 160ms ease;
}
.sg-task-report-canvas > article > h1 {
  margin: 0 0 14px;
  color: #5437b3;
  font-size: 22px;
}
.sg-task-report-canvas > article > h2 {
  margin: 0 0 15px;
  color: #5437b3;
  font-size: 13px;
}
.sg-task-report-block {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) minmax(180px, 0.9fr);
  min-height: 126px;
  align-items: center;
  gap: 10px;
  margin-top: 11px;
  padding: 12px;
  border: 1px solid #ded9eb;
  border-radius: 7px;
  background: #fff;
}
.sg-task-report-block > span {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: #7657d8;
  background: #eeebfb;
}
.sg-task-report-block > div:nth-of-type(2) {
  min-width: 0;
}
.sg-task-report-block h3 {
  margin: 0;
  font-size: 11px;
}
.sg-task-report-block p {
  margin: 6px 0 0;
  color: #615b6d;
  font-size: 8.5px;
  line-height: 1.65;
}
.sg-task-report-bars {
  position: relative;
  display: flex;
  height: 84px;
  align-items: flex-end;
  justify-content: space-around;
  gap: 10px;
  padding: 20px 8px 14px;
  border-bottom: 1px solid #d8d4e2;
}
.sg-task-report-bars > b,
.sg-task-report-donut-wrap > b,
.sg-task-report-line-chart > b {
  position: absolute;
  top: 0;
  left: 4px;
  color: #6c6676;
  font-size: 7.5px;
  font-weight: 600;
}
.sg-task-report-bars i {
  position: relative;
  display: block;
  width: 20px;
  min-height: 18px;
  background: linear-gradient(180deg, #9a83ed, #6f55cd);
}
.sg-task-report-bars small {
  position: absolute;
  top: 100%;
  left: 50%;
  color: #615b6d;
  font-size: 6.5px;
  transform: translateX(-50%);
}
.sg-task-report-bars em {
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  color: #504a59;
  font-size: 6.5px;
  font-style: normal;
  transform: translateX(-50%);
}
.sg-task-report-donut-wrap,
.sg-task-report-line-chart {
  position: relative;
  min-height: 88px;
  padding-top: 18px;
}
.sg-task-report-donut {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sg-task-report-donut > i {
  display: block;
  width: 58px;
  height: 58px;
  flex: none;
  border-radius: 50%;
  background: conic-gradient(
    #7358d3 0 42%,
    #9d86ee 42% 63%,
    #4f9bc5 63% 78%,
    #efa458 78% 90%,
    #78bf9b 90%
  );
  box-shadow: inset 0 0 0 15px #fff;
}
.sg-task-report-donut ul {
  display: grid;
  gap: 3px;
  margin: 0;
  padding: 0;
  color: #5f5968;
  font-size: 6.5px;
  list-style: none;
}
.sg-task-report-donut li::before {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 4px;
  border-radius: 50%;
  background: #8267dd;
  content: "";
}
.sg-task-report-line-chart > div {
  position: relative;
  height: 68px;
  border-bottom: 1px solid #d8d4e2;
  background: linear-gradient(180deg, transparent, rgba(123, 86, 222, 0.08));
}
.sg-task-report-line-chart > div::after {
  position: absolute;
  right: 8%;
  bottom: 13px;
  left: 8%;
  height: 2px;
  background: #8c6ae8;
  content: "";
  transform: rotate(-9deg);
}
.sg-task-report-line-chart i {
  position: absolute;
  z-index: 1;
  width: 6px;
  height: 6px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #7657d8;
  box-shadow: 0 0 0 1px #7657d8;
}
.sg-task-report-line-chart em,
.sg-task-report-line-chart small {
  position: absolute;
  left: 50%;
  font-size: 6px;
  font-style: normal;
  transform: translateX(-50%);
}
.sg-task-report-line-chart em {
  bottom: 8px;
  color: #403a49;
}
.sg-task-report-line-chart small {
  top: 12px;
  color: #6c6676;
}
.sg-task-report-rings {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 8px;
}
.sg-task-report-rings > i {
  position: relative;
  display: flex;
  width: 54px;
  height: 54px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: conic-gradient(#7758dd var(--ring-progress), #e1dceb 0);
  box-shadow: inset 0 0 0 10px #fff;
  font-style: normal;
}
.sg-task-report-rings b {
  font-size: 8px;
}
.sg-task-report-rings small {
  position: absolute;
  top: calc(100% + 3px);
  color: #6c6676;
  font-size: 6px;
}
.sg-task-report-files .sg-task-side-title > div p {
  margin: 4px 0 0;
  color: var(--sg-muted);
  font-size: 8.5px;
}
.sg-task-report-files > .sg-button {
  width: 100%;
  margin-top: 10px;
  color: #ad8cff;
}
.sg-task-report-summary .sg-task-info-list {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--sg-border);
}
.sg-task-report-team {
  margin-top: 11px;
}
.sg-task-report-team > span {
  display: block;
  margin-bottom: 8px;
  color: var(--sg-muted);
  font-size: 9px;
}
.sg-task-report-team .sg-task-team {
  display: flex;
  align-items: center;
}
.sg-task-report-team .sg-task-team > b {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  margin-left: 2px;
  border-radius: 50%;
  color: var(--sg-fg-2);
  background: #262330;
  font-size: 8px;
}
.sg-task-report-notify > div:last-of-type {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--sg-fg-2);
  font-size: 9px;
}

.sg-task-team .ant-avatar {
  margin-right: -6px;
  border: 2px solid var(--sg-bg-2);
}
.sg-task-team button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  border: 1px dashed #534e60;
  border-radius: 50%;
  color: var(--sg-fg-2);
  background: transparent;
  cursor: pointer;
}
.sg-task-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.sg-task-quick-actions button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--sg-fg-2);
  background: #18161d;
  font-size: 9.5px;
  cursor: pointer;
}
.sg-task-quick-actions button:hover {
  border-color: var(--sg-border);
  color: var(--sg-fg);
}
.sg-task-quick-actions button.danger {
  color: #ff6573;
}
.sg-task-detail-sticky-actions {
  position: sticky;
  bottom: 0;
  z-index: 5;
  justify-content: flex-end;
  gap: 9px;
  padding: 10px 13px;
  border-top: 1px solid var(--sg-border);
  background: rgba(18, 17, 22, 0.95);
  backdrop-filter: blur(10px);
}
.sg-task-detail-sticky-actions > span {
  margin-right: auto;
  color: var(--sg-muted);
  font-size: 9px;
}

@media (max-width: 1320px) {
  .sg-task-center-layout {
    grid-template-columns: minmax(0, 1fr) 270px;
  }
  .sg-task-search {
    width: auto;
    flex: 1;
  }
  .sg-task-filter-select.ant-select {
    width: 110px;
  }
  .sg-task-progress-summary {
    width: 180px;
  }
  .sg-task-new-layout {
    grid-template-columns: minmax(0, 1fr) 285px;
  }
  .sg-task-choice-grid.five {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .sg-task-choice-grid.six {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .sg-task-detail-layout {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
  .sg-task-detail-hero-actions {
    display: none;
  }
}
@media (max-width: 1050px) {
  .sg-task-center-layout,
  .sg-task-new-layout,
  .sg-task-detail-layout {
    grid-template-columns: 1fr;
  }
  .sg-task-center-side,
  .sg-task-new-side,
  .sg-task-detail-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sg-task-detail-progress {
    width: 220px;
  }
}
@media (max-width: 760px) {
  .sg-task-toolbar {
    flex-wrap: wrap;
  }
  .sg-task-search {
    width: 100%;
    flex-basis: 100%;
  }
  .sg-task-filter-select.ant-select {
    min-width: 0;
    flex: 1;
  }
  .sg-task-row-top {
    align-items: flex-start;
  }
  .sg-task-progress-summary {
    width: 90px;
  }
  .sg-task-progress-summary strong {
    font-size: 14px;
  }
  .sg-task-stage-strip {
    display: none;
  }
  .sg-task-row-foot {
    flex-wrap: wrap;
    gap: 7px;
  }
  .sg-task-row-foot-end {
    margin-left: 0;
  }
  .sg-task-center-side,
  .sg-task-new-side,
  .sg-task-detail-side {
    display: flex;
  }
  .sg-task-choice-grid.five,
  .sg-task-choice-grid.six,
  .sg-task-resource-list,
  .sg-task-config-grid,
  .sg-task-confirm dl {
    grid-template-columns: 1fr;
  }
  .sg-task-wizard-steps {
    padding-inline: 14px;
  }
  .sg-task-wizard-steps li > span {
    display: none;
  }
  .sg-task-new-two-col {
    grid-template-columns: 1fr;
  }
  .sg-task-detail-title-row {
    flex-wrap: wrap;
  }
  .sg-task-detail-title {
    width: calc(100% - 62px);
    flex: none;
  }
  .sg-task-detail-progress {
    width: 100%;
    margin-left: 61px;
  }
  .sg-task-detail-meta {
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-left: 0;
  }
  .sg-task-stage-hero {
    overflow-x: auto;
  }
  .sg-task-stage-hero > div {
    min-width: 115px;
  }
  .sg-task-process-grid {
    grid-template-columns: 1fr;
  }
  .sg-task-process-preview {
    grid-column: auto;
  }
  .sg-task-preview-grid,
  .sg-task-finding-grid,
  .sg-task-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sg-task-preview-body {
    grid-template-columns: 1fr;
  }
  .sg-task-preview-body > nav {
    display: none;
  }
  .sg-task-report {
    grid-template-columns: 1fr;
  }
  .sg-task-report > aside {
    display: none;
  }
  .sg-task-report-toolbar {
    grid-template-columns: auto auto auto 1fr;
    gap: 3px;
    padding-inline: 6px;
  }
  .sg-task-report-toolbar-start button:first-of-type,
  .sg-task-report-toolbar-end button:first-of-type {
    display: none;
  }
  .sg-task-report-page-control span {
    padding-inline: 5px;
    white-space: nowrap;
  }
  .sg-task-report-zoom button {
    padding-inline: 4px;
  }
  .sg-task-report-zoom button:nth-of-type(2) {
    min-width: 40px;
  }
  .sg-task-report-canvas {
    padding: 12px;
  }
  .sg-task-report-canvas > article {
    padding: 22px 18px;
  }
  .sg-task-report-block {
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: start;
  }
  .sg-task-report-block > div:nth-of-type(3) {
    grid-column: 1 / -1;
    margin-top: 8px;
  }
  .sg-task-report-rings > i {
    width: 48px;
    height: 48px;
  }
  .sg-task-detail-sticky-actions > span {
    display: none;
  }
}
`);
