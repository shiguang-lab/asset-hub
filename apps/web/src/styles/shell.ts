import { createGlobalStyle, css } from "antd-style";

export const ShellGlobalStyles = createGlobalStyle(css`
/* Dark workstation shell from the 16_14_39 reference. */
:root,
[data-theme="dark"] {
  --sg-fg: #f4f3fb;
  --sg-fg-2: #b8b5c9;
  --sg-muted: #777489;
  --sg-bg: #0b0a0f;
  --sg-bg-2: #121116;
  --sg-bg-3: #1a181f;
  --sg-border: #2a2731;
  --sg-accent: #7c3cff;
  --sg-accent-2: #965eff;
  --sg-accent-soft: rgba(124, 60, 255, 0.14);
  --sg-danger: #ff5d66;
  --sg-success: #43d19e;
  --sg-warning: #ffb14a;
  --sg-radius: 6px;
  --sg-radius-sm: 5px;
  --sg-shadow: 0 8px 26px rgba(0, 0, 0, 0.22);
  --sg-shadow-lg: 0 18px 60px rgba(0, 0, 0, 0.52);
  --sg-sidebar-w: 184px;
}

body {
  background: var(--sg-bg);
  font-size: 13px;
  line-height: 1.55;
}

button,
input,
textarea,
select {
  letter-spacing: 0;
}

.sg-shell {
  background: var(--sg-bg);
}
.sg-shell.ant-layout,
.sg-shell .ant-layout,
.sg-content-shell {
  background: var(--sg-bg) !important;
}
.sg-sidebar {
  padding: 14px 10px 12px;
  background: #0e0d12 !important;
  border-color: #24212a;
  overflow: hidden;
}
.sg-sidebar-logo {
  min-height: 44px;
  padding: 2px 7px 18px;
  font-size: 15px;
  gap: 9px;
}
.sg-brand-mark {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: white;
  background: #7137ff;
  box-shadow:
    inset -8px -8px 16px rgba(27, 5, 88, 0.38),
    0 0 18px rgba(124, 60, 255, 0.22);
}
.sg-nav-item {
  min-height: 36px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 5px;
  color: #aaa6b9;
  font-size: 12.5px;
  gap: 9px;
}
.sg-nav-item:hover {
  background: #19171d;
}
.sg-nav-item.active {
  color: #b79aff;
  background: #211a30;
  box-shadow: inset 2px 0 #844bff;
}
.sg-nav-icon {
  width: 17px;
  display: inline-flex;
}
.sg-credits-box {
  margin: 0 4px 10px;
  padding: 11px;
  border-radius: 6px;
  background: #141218;
}
.sg-credits-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.sg-credits-box::after {
  display: none;
}
.sg-credits-buy {
  color: #a887ff;
  font-size: 11px;
}
.sg-team-box {
  margin: 7px 2px 0;
  padding: 9px 5px 0;
  border: 0;
  border-top: 1px solid var(--sg-border);
  border-radius: 0;
  color: var(--sg-fg);
  text-decoration: none;
}
.sg-team-box span {
  display: flex;
  flex-direction: column;
  flex: 1;
  line-height: 1.25;
}
.sg-team-box small {
  color: var(--sg-muted);
  font-weight: 400;
  margin-top: 3px;
}

.sg-header {
  height: 60px;
  min-height: 60px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 24px !important;
  line-height: normal;
  box-sizing: border-box;
  border-color: #24212a;
  background: rgba(14, 13, 18, 0.94) !important;
  backdrop-filter: blur(14px);
}
.sg-breadcrumb {
  min-width: 130px;
  flex: 1;
}
.sg-search {
  width: min(340px, 30vw);
  height: 36px;
  min-height: 35px;
  flex: none;
  border-radius: 7px;
  border-color: var(--sg-border);
  background: #141218;
}
.sg-search.ant-input-affix-wrapper {
  padding: 0 13px;
}
.sg-search .ant-input {
  font-size: 14px;
}
.sg-header-actions {
  align-items: center;
  flex: none;
}
.sg-header-actions .ant-badge {
  display: inline-flex;
  align-items: center;
}
.sg-header-notifications.ant-btn,
.sg-document-import.ant-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--sg-fg-2);
  border-radius: 6px;
  background: transparent;
}
.sg-create-button.ant-btn {
  height: 36px;
  min-width: 104px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 13px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
}
.sg-header-actions > a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}
.sg-create-dropdown .ant-dropdown {
  margin-top: 8px;
}
.sg-create-popover {
  width: min(540px, calc(100vw - 28px));
  padding: 20px;
  border: 1px solid #332d45;
  border-radius: 14px;
  background: #17151f;
  box-shadow: 0 20px 52px rgba(0, 0, 0, 0.52);
}
.sg-create-popover h2 {
  margin: 0 0 16px;
  color: var(--sg-fg);
  font-size: 18px;
  font-weight: 650;
}
.sg-create-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.sg-create-card {
  min-width: 0;
  min-height: 78px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px;
  border: 1px solid #2d2939;
  border-radius: 10px;
  color: var(--sg-fg);
  background: #1c1925;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    transform 120ms ease;
}
.sg-create-card:hover {
  border-color: #6652a3;
  background: #242035;
  transform: translateY(-1px);
}
.sg-create-card-icon {
  width: 42px;
  height: 42px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
  color: #d9e7ff;
  background: linear-gradient(145deg, #3186e8, #2458cc);
  box-shadow: 0 5px 16px rgba(50, 111, 235, 0.22);
}
.sg-create-card-icon.green {
  color: #d5fff2;
  background: linear-gradient(145deg, #25d0ac, #079773);
  box-shadow: 0 5px 16px rgba(23, 196, 148, 0.2);
}
.sg-create-card-icon.violet {
  color: #eeeaff;
  background: linear-gradient(145deg, #8875ff, #5944d5);
  box-shadow: 0 5px 16px rgba(112, 88, 242, 0.22);
}
.sg-create-card-icon.orange {
  color: #fff5e7;
  background: linear-gradient(145deg, #ffbd54, #ed8d21);
  box-shadow: 0 5px 16px rgba(240, 146, 40, 0.2);
}
.sg-create-card-copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}
.sg-create-card-copy strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-create-card-copy small {
  overflow: hidden;
  color: var(--sg-muted);
  font-size: 11px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-create-card-arrow {
  flex: none;
  color: #8d87a5;
}
.sg-create-recent {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #2d2938;
}
.sg-create-recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 11px;
}
.sg-create-recent-head h3 {
  margin: 0;
  color: var(--sg-fg);
  font-size: 13px;
  font-weight: 620;
}
.sg-create-recent-head button {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 0;
  color: #a994e9;
  background: transparent;
  font-size: 11px;
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
  color: #c2b2ff;
}
.sg-create-template-grid img {
  width: 100%;
  height: 54px;
  display: block;
  object-fit: cover;
  border: 1px solid #302b42;
  border-radius: 6px;
  opacity: 0.82;
}
.sg-create-template-grid strong {
  display: block;
  overflow: hidden;
  margin-top: 6px;
  color: var(--sg-fg-2);
  font-size: 11px;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-header .spacer {
  display: block;
}
.sg-header-icon,
.sg-header-profile {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sg-fg-2);
  text-decoration: none;
}
.sg-header-icon {
  width: 34px;
  height: 34px;
}
.sg-header-icon i {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border: 2px solid var(--sg-bg-2);
  border-radius: 9px;
  color: #fff;
  background: #e53848;
  font: 600 9px / 13px var(--sg-font);
}
.sg-header-profile {
  gap: 6px;
}
.sg-content {
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 20px 24px 24px;
}

.sg-h1 {
  font-size: 23px;
  font-weight: 680;
}
.sg-h2 {
  font-size: 15px;
}
.sg-h3 {
  font-size: 13.5px;
}
.sg-eyebrow {
  letter-spacing: 0.1em;
  color: #a581ff;
}
.sg-btn {
  min-height: 34px;
  padding: 7px 12px;
  border-radius: 5px;
  background: #151319;
}
.sg-btn-primary {
  background: #7337ef;
  border-color: #8147ff;
  box-shadow: 0 4px 16px rgba(93, 35, 219, 0.2);
}
.sg-btn-sm {
  min-height: 28px;
  padding: 4px 9px;
}
.sg-input,
.sg-textarea,
.sg-select {
  border-radius: 5px;
  background: #111015;
}
.sg-card {
  padding: 15px;
  border-radius: 6px;
  background: #121116;
  box-shadow: none;
}
.sg-card.hoverable:hover {
  background: #17151c;
  transform: none;
}
.sg-tabs {
  margin-bottom: 14px;
}
.sg-tab {
  padding: 8px 12px;
  font-size: 12.5px;
}
.sg-table {
  font-size: 12.5px;
}
.sg-table th {
  padding: 8px 10px;
  background: #17151c;
}
.sg-table td {
  padding: 9px 10px;
}
.sg-table tr:hover td {
  background: #18161d;
}
.sg-badge {
  border-radius: 4px;
  padding: 1px 7px;
  font-size: 10.5px;
}
.sg-modal {
  border-radius: 7px;
  background: #121116;
}
.sg-dropdown-menu {
  border-radius: 6px;
  background: #151319;
}
.sg-editor-toolbar {
  border-radius: 6px 6px 0 0;
  background: #151319;
}
.sg-editor {
  border-radius: 0 0 6px 6px;
}
.sg-editor .cm-editor {
  min-height: 570px;
}
.sg-editor .cm-scroller {
  min-height: 570px;
}
.sg-editor:empty {
  min-height: 570px;
}
.sg-preview {
  background: #0f0e12;
}
.sg-slide-list,
.sg-editor-right {
  border-radius: 6px;
  background: #121116;
}
.sg-slide-canvas {
  border-radius: 6px;
  background: #0d0c10;
}
.sg-slide-frame {
  border-radius: 4px;
}

.sg-workflow-page {
  width: 100%;
}
.sg-workflow-page > .sg-h1 {
  margin-bottom: 8px;
}
.sg-workflow-page .sg-stepper {
  width: 100%;
  min-height: 66px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--sg-border);
}
.sg-workflow-page .sg-step {
  position: relative;
  justify-content: center;
  border-radius: 0;
  background: transparent;
}
.sg-workflow-page .sg-step:not(:last-of-type)::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -13px;
  width: 26px;
  height: 1px;
  background: #40384e;
}
.sg-workflow-page .sg-step.active {
  color: #a887ff;
}
.sg-workflow-page .sg-step .num {
  border: 1px solid #484250;
  background: #151319;
}
.sg-workflow-page .sg-step.active .num,
.sg-workflow-page .sg-step.done .num {
  color: #fff;
  border-color: #7c3cff;
  background: #7c3cff;
}
.sg-workflow-page > .sg-col > .sg-grid .sg-card {
  min-height: 146px;
}
.sg-research-workflow > .sg-card,
.sg-form-workflow > .sg-card {
  max-width: none;
  padding: 24px;
}
.sg-research-workflow > .sg-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 22px;
}
.sg-research-workflow > .sg-card > .sg-field:first-of-type,
.sg-research-workflow > .sg-card > .sg-row,
.sg-research-workflow > .sg-card > button,
.sg-research-workflow > .sg-card > p {
  grid-column: 1 / -1;
}
.sg-research-workflow > .sg-card > .sg-grid {
  display: contents;
}
`);
