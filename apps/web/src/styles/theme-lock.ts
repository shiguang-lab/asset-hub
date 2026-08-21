import { createGlobalStyle, css } from "antd-style";

export const ThemeLockGlobalStyles = createGlobalStyle(css`
/* Theme lock: keep the workstation on the original near-black dark palette. */
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
  --sg-success: #43d19e;
  --sg-warning: #ffb14a;
  --sg-sidebar-w: 266px;
}

body,
.sg-shell {
  background: var(--sg-bg);
}

.sg-sidebar.ant-layout-sider {
  width: 266px !important;
  max-width: 266px !important;
  min-width: 266px !important;
  flex: 0 0 266px !important;
  padding: 20px 12px 18px;
  background: #0e0d12 !important;
  border-right: 1px solid #24212a !important;
}
.sg-sidebar-logo {
  min-height: 60px;
  padding: 4px 13px 24px;
  gap: 12px;
  color: #f4f3fb;
}
.sg-sidebar-logo-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.15;
}
.sg-sidebar-logo-copy b {
  font-size: 16px;
  font-weight: 700;
}
.sg-sidebar-logo-copy small {
  color: #777489;
  font-size: 11px;
  white-space: nowrap;
}
.sg-brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: linear-gradient(145deg, #6d59ff, #4d35d7);
  box-shadow: 0 0 20px rgba(92, 69, 255, 0.25);
}
.sg-nav.ant-menu {
  margin-top: 10px;
  flex: 1 1 auto !important;
}
.sg-nav.ant-menu .ant-menu-item {
  height: 48px;
  line-height: 48px;
  margin: 0 0 2px;
  padding-inline: 14px !important;
  border-radius: 8px;
  color: #aaa6b9;
  font-size: 15px;
}
.sg-nav.ant-menu .ant-menu-item .ant-menu-item-icon {
  color: #aaa6b9;
}
.sg-nav.ant-menu .ant-menu-item:hover {
  color: #f4f3fb;
  background: #19171d;
}
.sg-nav.ant-menu .ant-menu-item-selected {
  color: #b79aff;
  background: #211a30;
  box-shadow: inset 1px 0 #844bff;
}
.sg-nav.ant-menu .ant-menu-item-selected .ant-menu-item-icon {
  color: #b79aff;
}
.sg-sidebar-footer {
  flex: none;
  margin-top: auto;
  padding-top: 10px;
}
.sg-sidebar-settings {
  height: 42px;
  margin: 0 10px 10px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 8px;
  color: #aaa6b9;
  text-decoration: none;
  transition:
    color 140ms ease,
    background 140ms ease;
}
.sg-sidebar-settings:hover,
.sg-sidebar-settings.active {
  color: #f4f3fb;
  background: #19171d;
}
.sg-sidebar-settings.active {
  color: #b79aff;
  background: #211a30;
  box-shadow: inset 1px 0 #844bff;
}
.sg-sidebar-settings span {
  flex: 1;
  font-size: 14px;
}
.sg-sidebar-settings > svg:last-child {
  color: #777489;
}
.sg-credits-box {
  display: block;
  margin: 0 10px;
  min-height: 76px;
  padding: 15px 16px;
  border: 1px solid #2a2731;
  border-radius: 10px;
  color: inherit;
  background: #141218;
  text-decoration: none;
}
.sg-credits-box::after {
  display: none;
}
.sg-credits-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sg-credits-percent {
  color: #a887ff;
  font-size: 12px;
  font-weight: 600;
}
.sg-credits-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #b8b5c9;
  font-size: 12px;
}
.sg-credits-progress {
  height: 6px;
  margin-top: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: #282530;
}
.sg-credits-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #7c3cff;
}
.sg-credits-buy {
  display: none;
}
.sg-nav-secondary {
  display: none;
}
.sg-team-box {
  margin: 0 10px;
  min-height: 85px;
  padding: 13px 12px;
  border: 1px solid #2a2731;
  border-radius: 10px;
  color: #f4f3fb;
  background: #141218;
}
.sg-team-box > span:not(.ant-avatar) {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 5px;
}
.sg-team-box strong {
  font-size: 13px;
  font-weight: 600;
}
.sg-team-box small {
  width: max-content;
  margin-top: 0;
  padding: 2px 6px;
  border-radius: 4px;
  color: #a887ff;
  background: rgba(124, 60, 255, 0.15);
  font-size: 10px;
}
.sg-header {
  height: 60px;
  min-height: 60px;
  padding: 0 24px !important;
  border-bottom: 1px solid #24212a;
  background: #0e0d12 !important;
}
.sg-header-tools {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto;
  flex: none;
}
.sg-search {
  width: 549px;
  height: 36px;
  border-radius: 9px;
  border-color: #2a2731;
  background: #141218;
  margin: 0;
}
.sg-search.ant-input-affix-wrapper {
  padding: 0 13px;
}
.sg-search .ant-input {
  color: #f4f3fb;
  font-size: 14px;
}
.sg-search .ant-input::placeholder {
  color: #777489;
}
.sg-search .ant-input-prefix {
  color: #b8b5c9;
}
.sg-kbd {
  color: #9e9aae;
  background: #1e1b26;
}
.sg-header-actions {
  gap: 18px !important;
  width: auto;
}
.sg-header-notifications.ant-btn,
.sg-document-import.ant-btn {
  width: 36px;
  height: 36px;
  color: #b8b5c9;
}
.sg-create-button.ant-btn {
  width: 104px;
  min-width: 104px;
  height: 36px;
  border-radius: 9px;
  border-color: #8147ff;
  background: linear-gradient(145deg, #7337ef, #5b2bc7);
  font-size: 14px;
}
.sg-header-user {
  width: 36px;
  height: 36px;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #f4f3fb;
  background: transparent;
  cursor: pointer;
}
.sg-header-account-avatar {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(196, 178, 255, 0.44);
  border-radius: 8px;
  color: #fff;
  background: linear-gradient(135deg, #a33cff, #635cff 58%, #52a2ff);
  box-shadow: 0 5px 16px rgba(105, 78, 255, 0.28);
  font-size: 11px;
  font-weight: 700;
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    transform 140ms ease;
}
.sg-header-user:hover .sg-header-account-avatar,
.sg-header-user:focus-visible .sg-header-account-avatar {
  border-color: rgba(226, 216, 255, 0.82);
  box-shadow: 0 7px 20px rgba(105, 78, 255, 0.48);
  transform: translateY(-1px);
}
.sg-header-user:focus-visible {
  outline: 2px solid #7c3cff;
  outline-offset: 2px;
}
.sg-space-switcher.ant-btn {
  max-width: 176px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border-radius: 7px;
  color: #b8b5c9;
}
.sg-space-switcher.ant-btn > span:not(.ant-btn-icon) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-space-switcher.ant-btn:hover,
.sg-space-switcher.ant-btn:focus-visible {
  color: #f4f3fb !important;
  background: #1a181f !important;
}
.sg-space-dropdown .ant-dropdown-menu {
  min-width: 220px;
}
.sg-user-menu-identity {
  min-width: 178px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sg-user-menu-identity strong {
  overflow: hidden;
  color: #f4f3fb;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-user-menu-identity small {
  overflow: hidden;
  color: #777489;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-user-dropdown .ant-dropdown-menu-item-disabled {
  cursor: default !important;
  opacity: 1;
}
.sg-content {
  max-width: none;
  padding: 24px;
}

.sg-docs .sg-assets-head {
  align-items: flex-start;
  margin-bottom: 10px;
}
.sg-docs .sg-assets-head > .ant-btn {
  display: none;
}
.sg-docs .sg-assets-head .sg-h1 {
  margin-bottom: 1px;
  color: #f4f3fb;
  font-size: 28px;
  font-weight: 700;
  line-height: 34px;
}
.sg-docs .sg-assets-sub {
  color: #777489;
  font-size: 15px;
  line-height: 23px;
}
.sg-docs-stats {
  gap: 17px;
  margin-bottom: 22px;
}
.sg-docs-stat {
  min-height: 88px;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  padding: 15px 16px;
  border-color: #2a2731;
  border-radius: 11px;
  background: #121116;
}
.sg-docs-stat-icon {
  width: 57px;
  height: 57px;
  display: grid;
  flex: none;
  place-items: center;
  border: 1px solid rgba(116, 105, 255, 0.18);
  border-radius: 12px;
  color: #9a82ff;
  background: rgba(104, 78, 233, 0.13);
}
.sg-docs-stat-icon.blue {
  color: #6d9eff;
  background: rgba(67, 117, 229, 0.14);
}
.sg-docs-stat-icon.green {
  color: #42d8a2;
  background: rgba(31, 195, 142, 0.12);
}
.sg-docs-stat-icon.orange {
  color: #ffad39;
  background: rgba(214, 125, 27, 0.13);
}
.sg-docs-stat-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sg-docs-stat .label {
  color: #afbdcc;
  font-size: 13px;
}
.sg-docs-stat .value {
  color: #e9f0f8;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
}
.sg-docs-tabs {
  gap: 28px;
  margin-bottom: 14px;
  border-bottom: 1px solid #1d344b;
  height: 36px;
}
.sg-docs-tab {
  position: relative;
  padding: 8px 0 7px;
  border: 0;
  border-radius: 0;
  color: #8294a9;
  background: transparent;
  font-size: 14px;
}
.sg-docs-tab:hover {
  color: #ccd8e4;
  border-color: transparent;
}
.sg-docs-tab.active {
  color: #a487ff;
  background: transparent;
  border-color: transparent;
  font-weight: 600;
}
.sg-docs-tab.active::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: #8a69ff;
}
.sg-assets-toolbar {
  gap: 16px;
  margin-bottom: 22px;
}
.sg-assets-search.ant-input-affix-wrapper {
  width: 312px;
  height: 41px;
  border-radius: 8px;
  border-color: #20384f;
  background: #0e2034;
}
.sg-assets-select.ant-select {
  width: 168px;
  height: 41px;
}
.sg-assets-select:nth-of-type(2) {
  width: 151px;
}
.sg-assets-select:nth-of-type(3) {
  width: 180px;
}
.sg-assets-select .ant-select-selector {
  height: 41px !important;
  border-radius: 8px !important;
  border-color: #20384f !important;
  background: #0e2034 !important;
}
.sg-assets-select .ant-select-selection-item {
  color: #c4d0dd;
}
.sg-docs-view-toggle {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  border: 1px solid #20384f;
  border-radius: 8px;
  background: #0e2034;
}
.sg-docs-view-toggle button {
  width: 60px;
  height: 39px;
  display: grid;
  place-items: center;
  border: 0;
  color: #788ca2;
  background: transparent;
  cursor: pointer;
}
.sg-docs-view-toggle button + button {
  border-left: 1px solid #20384f;
}
.sg-docs-view-toggle button.active {
  color: #a183ff;
  background: rgba(111, 79, 240, 0.15);
}
.sg-docs-recent-section,
.sg-docs-all-section {
  margin-top: 0;
}
.sg-docs-recent-section .sg-row-between,
.sg-docs-all-section .sg-row-between {
  margin-bottom: 11px !important;
}
.sg-docs-all-section .sg-row-between {
  margin-bottom: 2px !important;
}
.sg-docs-recent-section .sg-row-between {
  margin-bottom: 6px !important;
}
.sg-docs .sg-h3 {
  color: #dbe5ef;
  font-size: 16px;
  font-weight: 650;
}
.sg-side-link {
  color: #a0aec0;
  font-size: 12px;
}
.sg-docs-recent-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 17px;
}
.sg-docs-recent-card {
  min-height: 81px;
  padding: 13px 14px;
  border-color: #20384f;
  border-radius: 11px;
  background: #0e2034;
}
.sg-docs-recent-card:hover {
  border-color: #5d4cb4;
  background: #10243b;
}
.sg-docs-recent-card .sg-asset-icn {
  width: 57px;
  height: 57px;
  border-radius: 12px;
}
.sg-docs-recent-card {
  min-height: 81px;
  padding-block: 11px;
}
.sg-docs-recent-title {
  color: #e0e8f1;
  font-size: 14px;
}
.sg-docs-recent-meta {
  color: #8092a7;
  font-size: 12px;
}
.sg-docs-recent-meta .sg-badge {
  margin-left: 3px;
}
.sg-docs-all-section {
  margin-top: 25px;
}
.sg-docs-table-wrap {
  overflow: hidden;
  border: 1px solid #20384f;
  border-radius: 10px;
  background: #0b1c30;
}
.sg-docs-table {
  min-width: 1040px;
}
.sg-docs-table th {
  height: 55px;
  padding: 0 14px;
  border-bottom-color: #20384f;
  color: #778ca2;
  font-size: 12px;
  background: transparent;
}
.sg-docs-table th.c-owner {
  width: 72px;
}
.sg-docs-table th.c-time {
  width: 128px;
}
.sg-docs-table th.c-vis {
  width: 137px;
}
.sg-docs-table th.c-rel {
  width: 168px;
}
.sg-docs-table th.c-menu {
  width: 180px;
}
.sg-docs-table td {
  height: 58px;
  padding: 9px 14px;
  border-bottom-color: #1d344b;
  color: #aebdce;
  font-size: 13px;
}
.sg-docs-table tbody tr:hover td {
  background: #10243a;
}
.sg-asset-name {
  gap: 12px;
}
.sg-docs-table .sg-asset-icn {
  width: 40px;
  height: 40px;
  border-radius: 9px;
}
.sg-asset-title {
  color: #dfe8f2;
  font-size: 14px;
  font-weight: 600;
}
.sg-docs-desc {
  color: #7f92a7;
  font-size: 12px;
}
.sg-owner-avatar {
  width: 25px;
  height: 25px;
  color: #eaf1f8;
  background: #3c536a;
  font-size: 11px;
}
.sg-owner {
  gap: 8px;
  color: #c3cfdb;
}
.sg-vis {
  font-size: 12px;
}
.sg-vis.public {
  color: #27d098;
}
.sg-vis.link {
  color: #64a0ff;
}
.sg-badge-success {
  color: #18cc8f;
  background: rgba(20, 191, 126, 0.1);
}
.sg-docs-actions {
  gap: 5px;
}
.sg-docs-action-btn.ant-btn,
.sg-asset-more {
  width: 35px;
  height: 32px;
  border: 1px solid #263e56;
  border-radius: 7px;
  color: #91a3b6;
  background: #10253b;
}
.sg-docs-action-btn.ant-btn:hover,
.sg-asset-more:hover {
  color: #b49aff !important;
  border-color: #5f4bc3 !important;
  background: rgba(111, 79, 240, 0.15) !important;
}
.sg-docs-action-btn.ai.ant-btn {
  color: #a283ff;
}

@media (max-width: 1100px) {
  .sg-sidebar.ant-layout-sider {
    width: 78px !important;
    max-width: 78px !important;
    min-width: 78px !important;
    flex-basis: 78px !important;
  }
  .sg-sidebar-logo-copy,
  .sg-nav.ant-menu .ant-menu-title-content,
  .sg-credits-box,
  .sg-sidebar-settings span,
  .sg-sidebar-settings > svg:last-child,
  .sg-team-box > span:not(.ant-avatar),
  .sg-team-box > svg {
    display: none;
  }
  .sg-sidebar-logo {
    justify-content: center;
    padding-inline: 0;
  }
  .sg-nav.ant-menu .ant-menu-item {
    padding-inline: 0 !important;
    justify-content: center;
  }
  .sg-team-box {
    justify-content: center;
    margin-inline: 8px;
    padding-inline: 0;
  }
  .sg-sidebar-settings {
    justify-content: center;
    margin-inline: 8px;
    padding-inline: 0;
  }
  .sg-search {
    width: min(549px, 52vw);
  }
}
@media (max-width: 760px) {
  .sg-sidebar.ant-layout-sider {
    display: none;
  }
  .sg-header {
    height: 64px;
    min-height: 64px;
    padding: 0 14px !important;
  }
  .sg-search {
    width: auto;
    flex: 1;
  }
  .sg-content {
    padding: 20px 14px 40px;
  }
  .sg-docs-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sg-docs-recent-grid {
    grid-template-columns: 1fr;
  }
  .sg-assets-toolbar {
    align-items: stretch;
  }
  .sg-assets-search.ant-input-affix-wrapper {
    width: 100%;
  }
  .sg-assets-select.ant-select {
    flex: 1;
    width: auto !important;
  }
  .sg-docs-view-toggle {
    margin-left: 0;
  }
}

/* Theme lock: do not reintroduce the blue/navy surfaces above. */
.sg-shell.ant-layout,
.sg-shell .ant-layout,
.sg-content-shell,
body {
  background: #0b0a0f !important;
}
.sg-sidebar.ant-layout-sider,
.sg-header {
  background: #0e0d12 !important;
  border-color: #24212a !important;
}
.sg-search,
.sg-assets-search.ant-input-affix-wrapper,
.sg-assets-select .ant-select-selector,
.sg-docs-view-toggle,
.sg-docs-recent-card,
.sg-docs-stat,
.sg-docs-table-wrap {
  border-color: #2a2731 !important;
  background: #121116 !important;
}
.sg-docs-recent-card:hover,
.sg-docs-table tbody tr:hover td {
  background: #17151c !important;
}
.sg-docs-table th,
.sg-docs-table td,
.sg-docs-tabs {
  border-color: #2a2731;
}
.sg-docs-action-btn.ant-btn,
.sg-asset-more {
  border-color: #332f3c;
  background: #151319;
}
.sg-credits-box,
.sg-team-box {
  border-color: #2a2731;
  background: #141218;
}
`);
