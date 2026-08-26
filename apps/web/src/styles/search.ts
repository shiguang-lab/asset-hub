import { createStyles } from "antd-style";

export const useSearchStyles = createStyles(({ css }) => ({
  root: css`
/* Global search workspace: reference layout 2026-08-13. */
.sg-header .sg-header-tools {
  position: relative;
}
.sg-header .sg-search {
  position: absolute;
  top: 50%;
  right: calc(100% + 14px);
  z-index: 2;
  transform: translateY(-50%);
  transition:
    width 240ms ease,
    border-color 160ms ease,
    background-color 160ms ease;
  will-change: width;
}
.sg-header.search-mode .sg-breadcrumb {
  visibility: hidden;
}
.sg-header.search-mode .sg-search {
  width: min(810px, 52vw);
  max-width: 810px;
  height: 40px;
  border-color: #373241;
  background: #151821;
}
.sg-header.search-mode .sg-search .ant-input {
  font-size: 15px;
}
.sg-search-suffix {
  position: relative;
  display: inline-flex;
  width: 60px;
  height: 25px;
  align-items: center;
  justify-content: flex-end;
}
.sg-search-suffix > button {
  position: absolute;
  left: 0;
  display: inline-flex;
  width: 25px;
  height: 25px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: var(--sg-muted);
  background: transparent;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;
}
.sg-search-suffix.is-active > button {
  opacity: 1;
  pointer-events: auto;
}
.sg-search-suffix > button:hover {
  color: var(--sg-fg);
  background: var(--sg-bg-3);
}
.sg-search-suffix .sg-kbd {
  position: absolute;
  right: 0;
}
.sg-search-profile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.sg-search-content {
  min-height: calc(100vh - 60px);
  padding: var(--sg-page-gutter);
}
.sg-global-search {
  position: relative;
  min-width: 0;
  color: var(--sg-fg);
}
.sg-global-search-tabs {
  display: flex;
  height: 62px;
  align-items: end;
  gap: 28px;
  border-bottom: 1px solid var(--sg-border);
}
.sg-global-search-tabs button {
  position: relative;
  display: inline-flex;
  height: 56px;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 0 2px;
  border: 0;
  color: var(--sg-muted);
  background: transparent;
  font-size: 14px;
  cursor: pointer;
}
.sg-global-search-tabs button > span {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 4px;
  color: #8d889c;
  background: #1a1820;
  font-size: 11px;
  text-align: center;
}
.sg-global-search-tabs button.active {
  color: #c4adff;
}
.sg-global-search-tabs button.active::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: #8c52ff;
  content: "";
}
.sg-global-search-filters {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
}
.sg-global-search-filters > .ant-select {
  width: 112px;
  flex: none;
}
.sg-global-search-filters .ant-select-selector {
  padding-inline: 11px !important;
}
.sg-global-search-filters .ant-select-selection-item,
.sg-global-search-filters .ant-select-selection-placeholder {
  font-size: 13px;
}
.sg-global-search-mine.ant-checkbox-wrapper {
  display: inline-flex;
  flex: none;
  align-items: center;
  margin-left: 2px;
  color: var(--sg-fg-2);
  font-size: 13px;
}
.sg-global-search-sort {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  color: var(--sg-muted);
  font-size: 13px;
}
.sg-global-search-sort .ant-select {
  width: 112px;
}
.sg-global-search-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(330px, 38%);
  gap: 14px;
  align-items: start;
}
.sg-global-search-results {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: #101017;
}
.sg-global-search-results > section {
  padding: 11px 10px 0;
}
.sg-global-search-results > section + section {
  padding-top: 7px;
}
.sg-global-search-results h2 {
  margin: 0 0 7px 3px;
  color: var(--sg-fg-2);
  font-size: 13px;
  font-weight: 650;
}
.sg-global-search-result {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  min-width: 0;
  align-items: center;
  gap: 9px;
  min-height: 74px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: #14131a;
}
.sg-global-search-result + .sg-global-search-result {
  margin-top: 6px;
}
.sg-global-search-result:hover,
.sg-global-search-result.selected {
  border-color: #342c45;
  background: #181620;
}
.sg-global-search-result.featured {
  grid-template-columns: 38px minmax(0, 1fr) 136px;
  min-height: 104px;
}
.sg-global-search-icon {
  display: inline-flex;
  width: 36px;
  height: 36px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
}
button.sg-global-search-icon {
  cursor: pointer;
}
.sg-global-search-icon.violet,
.sg-global-search-icon.purple {
  color: #c0a8ff;
  background: rgba(124, 60, 255, 0.18);
}
.sg-global-search-icon.green {
  color: #72d1a2;
  background: rgba(38, 153, 103, 0.18);
}
.sg-global-search-icon.orange {
  color: #ef9f5f;
  background: rgba(204, 103, 38, 0.18);
}
.sg-global-search-icon.blue {
  color: #75a4eb;
  background: rgba(54, 112, 194, 0.18);
}
.sg-global-search-result > div {
  min-width: 0;
}
.sg-global-search-result-title {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  padding: 0;
  border: 0;
  color: var(--sg-fg);
  background: transparent;
  font-size: 14px;
  font-weight: 650;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.sg-global-search-result-title > span {
  flex: none;
  padding: 2px 5px;
  border-radius: 3px;
  color: #b99cff;
  background: rgba(124, 60, 255, 0.12);
  font-size: 11px;
  font-weight: 500;
}
.sg-global-search-result p {
  display: -webkit-box;
  overflow: hidden;
  margin: 5px 0;
  color: var(--sg-fg-2);
  font-size: 13px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.sg-global-search-result small {
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-global-search-visual {
  position: relative;
  display: flex;
  width: 136px;
  aspect-ratio: 16 / 9;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  padding: 10px;
  border: 1px solid #34265d;
  border-radius: 5px;
  color: #fff;
  background: #201044;
}
.sg-global-search-visual small,
.sg-global-search-visual b {
  position: relative;
  z-index: 1;
}
.sg-global-search-visual small {
  color: #9e83d7;
  font-size: 9px;
}
.sg-global-search-visual b {
  margin-top: 3px;
  font-size: 11px;
}
.sg-global-search-visual i {
  position: absolute;
  right: 9px;
  bottom: 11px;
  width: 55px;
  height: 22px;
  border-top: 2px solid #a46aff;
  transform: skewY(-12deg);
}
.sg-global-search-status {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 3px 6px;
  border-radius: 4px;
  color: var(--sg-success);
  background: rgba(52, 199, 137, 0.1);
  font-size: 11px;
}
.sg-global-search-more {
  display: flex;
  width: 100%;
  height: 42px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 10px;
  border: 0;
  border-top: 1px solid var(--sg-border);
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}
.sg-global-search-preview {
  position: sticky;
  top: 0;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: #12141c;
}
.sg-global-search-preview > header {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) repeat(3, 28px);
  align-items: center;
  gap: 7px;
  padding: 14px;
}
.sg-global-search-preview > header > div {
  min-width: 0;
}
.sg-global-search-preview > header h2 {
  margin: 0;
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-global-search-preview > header p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--sg-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-global-search-preview > header > button {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: var(--sg-muted);
  background: transparent;
  cursor: pointer;
}
.sg-global-search-preview > header > button:hover,
.sg-global-search-preview > header > button.active {
  color: #c0a8ff;
  background: rgba(124, 60, 255, 0.1);
}
.sg-global-search-preview > header > button.active svg {
  fill: currentColor;
}
.sg-global-search-preview-body {
  min-height: 430px;
  padding: 18px 17px;
  color: var(--sg-fg-2);
}
.sg-global-search-preview-body h3 {
  margin: 0 0 10px;
  color: var(--sg-fg);
  font-size: 15px;
}
.sg-global-search-preview-body p,
.sg-global-search-preview-body li {
  font-size: 13px;
  line-height: 1.8;
}
.sg-global-search-preview-body ul,
.sg-global-search-preview-body ol {
  margin: 8px 0 0;
  padding-left: 18px;
}
.sg-global-search-chart {
  margin: 14px 0 18px;
  padding: 11px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  background: #10121a;
}
.sg-global-search-chart > span {
  color: var(--sg-fg-2);
  font-size: 12px;
}
.sg-global-search-chart svg {
  display: block;
  width: 100%;
  height: 120px;
  margin-top: 6px;
  border-bottom: 1px solid var(--sg-border);
  background: repeating-linear-gradient(
    to bottom,
    transparent 0 29px,
    rgba(255, 255, 255, 0.035) 30px
  );
}
.sg-global-search-chart > div {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  color: var(--sg-muted);
  font-size: 10px;
}
.sg-global-search-preview-empty {
  display: flex;
  min-height: 260px;
  align-items: center;
  justify-content: center;
  color: var(--sg-muted);
  font-size: 13px;
}
.sg-global-search-related {
  display: grid;
  gap: 7px;
}
.sg-global-search-related button {
  padding: 9px;
  border: 1px solid var(--sg-border);
  border-radius: 5px;
  color: var(--sg-fg-2);
  background: #171820;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.sg-global-search-preview > footer {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--sg-border);
}
.sg-global-search-start,
.sg-global-search-loading {
  display: flex;
  min-height: 500px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  color: var(--sg-muted);
  background: #101017;
}
.sg-global-search-start > span {
  display: inline-flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #b99cff;
  background: rgba(124, 60, 255, 0.12);
}
.sg-global-search-start h1 {
  margin: 14px 0 6px;
  color: var(--sg-fg);
  font-size: 18px;
}
.sg-global-search-start p {
  margin: 0;
  font-size: 13px;
}
.sg-global-search-start > div {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}
.sg-global-search-start > div button {
  padding: 7px 10px;
  border: 1px solid var(--sg-border);
  border-radius: 5px;
  color: var(--sg-fg-2);
  background: var(--sg-bg-2);
  font-size: 13px;
  cursor: pointer;
}
.sg-global-search-loading {
  gap: 10px;
  font-size: 13px;
}
.sg-global-search-loading svg {
  color: #b99cff;
  animation: sg-spin 1s linear infinite;
}
.sg-global-search-ask {
  position: fixed;
  right: 24px;
  bottom: 22px;
  z-index: 20;
  display: inline-flex;
  height: 40px;
  align-items: center;
  gap: 7px;
  padding: 0 16px;
  border: 1px solid #372e54;
  border-radius: 20px;
  color: #e1d8f8;
  background: #1c1830;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  font-size: 13px;
  cursor: pointer;
}

@media (min-width: 1440px) {
  .sg-global-search-layout {
    grid-template-columns: minmax(0, 1fr) 450px;
    gap: 16px;
  }
}
@media (max-width: 1100px) {
  .sg-global-search-layout {
    grid-template-columns: minmax(0, 1fr) 310px;
  }
  .sg-global-search-filters {
    flex-wrap: wrap;
  }
  .sg-global-search-sort {
    margin-left: 0;
  }
}
@media (max-width: 760px) {
  .sg-header .sg-search {
    position: static;
    transform: none;
  }
  .sg-header.search-mode .sg-search {
    width: auto;
    min-width: 0;
    flex: 1 1 auto;
  }
  .sg-search-suffix .sg-kbd {
    display: none;
  }
  .sg-search-content {
    padding-inline: var(--sg-page-gutter);
  }
  .sg-global-search-tabs {
    gap: 18px;
  }
  .sg-global-search-filters {
    flex-wrap: nowrap;
  }
  .sg-global-search-filters > .ant-select {
    width: 112px;
  }
  .sg-global-search-mine.ant-checkbox-wrapper,
  .sg-global-search-sort {
    flex: none;
  }
  .sg-global-search-layout {
    grid-template-columns: 1fr;
  }
  .sg-global-search-preview {
    display: none;
  }
  .sg-global-search-result.featured {
    grid-template-columns: 36px minmax(0, 1fr);
  }
  .sg-global-search-visual {
    display: none;
  }
  .sg-global-search-start,
  .sg-global-search-loading {
    min-height: 430px;
    padding-inline: 20px;
    text-align: center;
  }
  .sg-global-search-start > div {
    flex-wrap: wrap;
    justify-content: center;
  }
}
  `,
}));
