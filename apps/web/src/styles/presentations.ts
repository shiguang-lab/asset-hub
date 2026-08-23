import { createGlobalStyle, css } from "antd-style";

export const PresentationsGlobalStyles = createGlobalStyle(css`
/* Online presentations workspace: reference layout 2026-08-13. */
.sg-presentation-page {
  min-width: 0;
  color: var(--sg-fg);
}
.sg-presentation-heading,
.sg-presentation-title,
.sg-presentation-heading-actions,
.sg-presentation-name,
.sg-presentation-creator,
.sg-presentation-row-actions,
.sg-presentation-pagination,
.sg-presentation-pagination > div,
.sg-presentation-quickstart > div,
.sg-presentation-side-title,
.sg-presentation-source {
  display: flex;
  align-items: center;
}
.sg-presentation-heading {
  min-height: 62px;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 16px;
}
.sg-presentation-title {
  min-width: 0;
  gap: 12px;
}
.sg-presentation-title > span {
  display: inline-flex;
  width: 42px;
  height: 42px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: #b99cff;
  background: rgba(124, 60, 255, 0.15);
}
.sg-presentation-title h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 0;
}
.sg-presentation-title p {
  margin: 5px 0 0;
  color: var(--sg-muted);
  font-size: 14px;
}
.sg-presentation-heading-actions {
  flex: none;
  gap: 8px;
}
.sg-presentation-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 12px;
  align-items: start;
}
.sg-presentation-layout > main {
  min-width: 0;
}
.sg-presentation-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.sg-presentation-stats article {
  display: flex;
  min-width: 0;
  min-height: 98px;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: var(--sg-bg-2);
}
.sg-presentation-stats article > span {
  display: inline-flex;
  width: 38px;
  height: 38px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
}
.sg-presentation-stats article > span.violet {
  color: #b99cff;
  background: rgba(124, 60, 255, 0.15);
}
.sg-presentation-stats article > span.blue {
  color: #80a7ff;
  background: rgba(75, 116, 220, 0.14);
}
.sg-presentation-stats article > span.cyan {
  color: #65c1ca;
  background: rgba(52, 158, 170, 0.14);
}
.sg-presentation-stats article > span.orange {
  color: #efab67;
  background: rgba(205, 116, 46, 0.14);
}
.sg-presentation-stats article > div {
  min-width: 0;
}
.sg-presentation-stats small,
.sg-presentation-stats strong,
.sg-presentation-stats p {
  display: block;
}
.sg-presentation-stats small {
  color: var(--sg-muted);
  font-size: 13px;
}
.sg-presentation-stats strong {
  margin-top: 3px;
  overflow: hidden;
  font-size: 20px;
  line-height: 1.1;
  text-overflow: ellipsis;
}
.sg-presentation-stats p {
  display: flex;
  align-items: center;
  gap: 3px;
  margin: 5px 0 0;
  color: var(--sg-success);
  font-size: 12px;
}
.sg-presentation-toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  padding: 12px 0;
}
.sg-presentation-search {
  display: flex;
  width: 220px;
  height: 34px;
  flex: none;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid var(--sg-border);
  border-radius: 5px;
  color: var(--sg-muted);
  background: var(--sg-bg-2);
}
.sg-presentation-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--sg-fg);
  background: transparent;
  font-size: 13px;
}
.sg-presentation-search input::placeholder {
  color: var(--sg-muted);
}
.sg-presentation-select.ant-select {
  width: 96px;
  flex: none;
}
.sg-presentation-own {
  display: flex;
  flex: none;
  align-items: center;
  gap: 5px;
  color: var(--sg-fg-2);
  font-size: 13px;
  white-space: nowrap;
}
.sg-presentation-own input {
  accent-color: var(--sg-accent);
}
.sg-presentation-view-switch {
  display: flex;
  height: 34px;
  padding: 0;
  margin-left: auto;
  overflow: hidden;
  flex: none;
  border: 1px solid var(--sg-border);
  border-radius: 5px;
}
.sg-presentation-view-switch legend {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.sg-presentation-view-switch button,
.sg-presentation-row-actions button,
.sg-presentation-pagination button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  color: var(--sg-muted);
  background: transparent;
  cursor: pointer;
}
.sg-presentation-view-switch button {
  width: 34px;
  border-right: 1px solid var(--sg-border);
}
.sg-presentation-view-switch button:last-of-type {
  border-right: 0;
}
.sg-presentation-view-switch button.active {
  color: #b99cff;
  background: rgba(124, 60, 255, 0.12);
}
.sg-presentation-table-wrap {
  overflow-x: auto;
}
.sg-presentation-name {
  min-width: 0;
  gap: 9px;
}
.sg-presentation-name > div {
  min-width: 0;
  flex: 1;
}
.sg-presentation-name > div > button,
.sg-presentation-grid article > div > button {
  display: block;
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  border: 0;
  color: var(--sg-fg);
  background: transparent;
  font-size: 13px;
  font-weight: 650;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.sg-presentation-name > div > button:hover,
.sg-presentation-grid article > div > button:hover {
  color: #b99cff;
}
.sg-presentation-name > div > span {
  display: flex;
  gap: 4px;
  margin-top: 5px;
}
.sg-presentation-name small {
  max-width: 70px;
  overflow: hidden;
  padding: 2px 5px;
  border-radius: 3px;
  color: var(--sg-muted);
  background: #1d1a23;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-presentation-thumb {
  position: relative;
  display: inline-flex;
  width: 110px;
  aspect-ratio: 16 / 9;
  flex: none;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 4px;
  color: #fff;
  background: #312168;
}
.sg-presentation-thumb::before,
.sg-presentation-thumb::after,
.sg-presentation-thumb > i {
  position: absolute;
  border: 1px solid rgba(255, 255, 255, 0.2);
  content: "";
}
.sg-presentation-thumb::before {
  top: 11px;
  right: 11px;
  width: 31px;
  height: 19px;
}
.sg-presentation-thumb::after {
  top: 17px;
  right: 17px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
}
.sg-presentation-thumb > i {
  top: 12px;
  left: 11px;
  width: 24px;
  height: 4px;
  border: 0;
  background: rgba(255, 255, 255, 0.75);
  box-shadow: 0 8px rgba(255, 255, 255, 0.28);
}
.sg-presentation-thumb > b,
.sg-presentation-thumb > small {
  position: relative;
  z-index: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-presentation-thumb > b {
  font-size: 12px;
}
.sg-presentation-thumb > small {
  margin-top: 2px;
  opacity: 0.62;
  font-size: 11px;
}
.sg-presentation-thumb.tone-1 {
  color: #38324b;
  background: #eeedf6;
}
.sg-presentation-thumb.tone-2 {
  background: #11565b;
}
.sg-presentation-thumb.tone-3 {
  color: #34303d;
  background: #d8e7ec;
}
.sg-presentation-favorite {
  display: inline-flex;
  flex: none;
  padding: 3px;
  border: 0;
  color: #5f5a6c;
  background: transparent;
  cursor: pointer;
}
.sg-presentation-favorite.active {
  color: #f0b44d;
}
.sg-presentation-favorite.active svg {
  fill: currentColor;
}
.sg-presentation-source,
.sg-presentation-creator {
  gap: 5px;
  white-space: nowrap;
}
.sg-presentation-source {
  color: #9f84e9;
}
.sg-presentation-creator {
  overflow: hidden;
  text-overflow: ellipsis;
}
.sg-presentation-row-actions {
  gap: 5px;
}
.sg-presentation-row-actions button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--sg-border);
  border-radius: 4px;
}
.sg-presentation-row-actions button:hover {
  border-color: #5e467f;
  color: #b99cff;
}
.sg-presentation-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.sg-presentation-grid article {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: var(--sg-bg-2);
}
.sg-presentation-grid .sg-presentation-thumb {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--sg-border);
  border-radius: 0;
  padding: 16px;
}
.sg-presentation-grid .sg-presentation-thumb > b {
  font-size: 12px;
}
.sg-presentation-grid article > div {
  padding: 10px;
}
.sg-presentation-grid article p {
  display: -webkit-box;
  min-height: 30px;
  overflow: hidden;
  margin: 6px 0;
  color: var(--sg-muted);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.sg-presentation-grid article > div > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-presentation-empty {
  min-height: 270px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: var(--sg-bg-2);
}
.sg-presentation-pagination {
  justify-content: flex-end;
  gap: 10px;
  min-height: 54px;
  color: var(--sg-muted);
  font-size: 13px;
}
.sg-presentation-pagination > span {
  margin-right: auto;
}
.sg-presentation-pagination > div {
  gap: 5px;
}
.sg-presentation-pagination button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--sg-border);
  border-radius: 4px;
}
.sg-presentation-pagination button.active {
  border-color: var(--sg-accent);
  color: #c8b3ff;
  background: rgba(124, 60, 255, 0.12);
}
.sg-presentation-pagination button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.sg-presentation-page-size.ant-select {
  width: 92px;
}
.sg-presentation-quickstart {
  padding: 14px 16px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: rgba(124, 60, 255, 0.045);
}
.sg-presentation-quickstart > div {
  gap: 7px;
  color: #b99cff;
}
.sg-presentation-quickstart strong {
  color: var(--sg-fg);
  font-size: 13px;
}
.sg-presentation-quickstart ol {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 13px 0 0;
  padding: 0;
  list-style: none;
}
.sg-presentation-quickstart li {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}
.sg-presentation-quickstart li > span {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #c5b1ff;
  background: rgba(124, 60, 255, 0.15);
  font-size: 12px;
}
.sg-presentation-quickstart li > div {
  min-width: 0;
  flex: 1;
}
.sg-presentation-quickstart li b,
.sg-presentation-quickstart li small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-presentation-quickstart li b {
  font-size: 13px;
}
.sg-presentation-quickstart li small {
  margin-top: 3px;
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-presentation-quickstart li > svg {
  flex: none;
  color: #8f6be4;
}
.sg-presentation-side {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}
.sg-presentation-side > section {
  overflow: hidden;
  padding: 14px;
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: var(--sg-bg-2);
}
.sg-presentation-side-title {
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.sg-presentation-side-title h2 {
  margin: 0;
  font-size: 14px;
}
.sg-presentation-side-title > button {
  padding: 0;
  border: 0;
  color: #a47fff;
  background: transparent;
  font-size: 12px;
  cursor: pointer;
}
.sg-presentation-range.ant-select {
  width: 78px;
}
.sg-presentation-chart {
  position: relative;
  height: 164px;
  padding: 5px 0 24px 28px;
}
.sg-presentation-chart > span {
  position: absolute;
  left: 0;
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-presentation-chart > span:nth-of-type(1) {
  top: 3px;
}
.sg-presentation-chart > span:nth-of-type(2) {
  top: 31px;
}
.sg-presentation-chart > span:nth-of-type(3) {
  top: 59px;
}
.sg-presentation-chart > span:nth-of-type(4) {
  top: 87px;
}
.sg-presentation-chart > span:nth-of-type(5) {
  top: 115px;
}
.sg-presentation-chart svg {
  width: 100%;
  height: 120px;
  border-bottom: 1px solid var(--sg-border);
  background: repeating-linear-gradient(
    to bottom,
    transparent 0 27px,
    rgba(255, 255, 255, 0.04) 28px
  );
}
.sg-presentation-chart > div {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-presentation-analytics dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--sg-border);
}
.sg-presentation-analytics dl > div {
  min-width: 0;
  padding: 0 7px;
  border-right: 1px solid var(--sg-border);
}
.sg-presentation-analytics dl > div:first-of-type {
  padding-left: 0;
}
.sg-presentation-analytics dl > div:last-of-type {
  padding-right: 0;
  border-right: 0;
}
.sg-presentation-analytics dt {
  overflow: hidden;
  color: var(--sg-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-presentation-analytics dd {
  margin: 4px 0 2px;
  overflow: hidden;
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-presentation-analytics dl small {
  color: var(--sg-success);
  font-size: 12px;
}
.sg-presentation-top-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sg-presentation-top-list li {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
}
.sg-presentation-top-list li > b {
  color: #b99cff;
  font-size: 13px;
}
.sg-presentation-top-list li > button {
  overflow: hidden;
  padding: 0;
  border: 0;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 12px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.sg-presentation-top-list li > span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-presentation-recent {
  display: grid;
  gap: 9px;
}
.sg-presentation-recent > button {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.sg-presentation-recent .sg-presentation-thumb {
  width: 54px;
  padding: 4px;
}
.sg-presentation-recent .sg-presentation-thumb > b,
.sg-presentation-recent .sg-presentation-thumb > small {
  display: none;
}
.sg-presentation-recent > button > span {
  min-width: 0;
}
.sg-presentation-recent b,
.sg-presentation-recent small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-presentation-recent b {
  color: var(--sg-fg-2);
  font-size: 12px;
}
.sg-presentation-recent small {
  margin-top: 4px;
  color: var(--sg-muted);
  font-size: 12px;
}

.sg-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}


/* ============ 在线演示编辑器（三栏 + WPS 风格工作区） ============ */
/* 三栏布局：左缩略图栏固定宽，中工作区自适应，右属性面板固定宽 */
.sg-slide-editor {
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr) 300px;
  gap: 12px;
  align-items: stretch;
  flex: 1;
}
.sg-slide-list {
  width: 184px;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 10px 8px;
  overflow: auto;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
}
.sg-slide-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px 10px;
  font-size: 13px;
  color: var(--sg-fg-2);
}
.sg-slide-list-head strong {
  font-weight: 650;
}
/* 每个缩略图项：相对定位，承载“分割线插入”按钮 */
.sg-slide-item {
  position: relative;
  display: block;
}
/* 分割线插入按钮：默认隐藏，hover 到项上或分割线时浮现（对齐业内 slice 间 ＋） */
.sg-slide-insert {
  position: absolute;
  top: -11px;
  left: 50%;
  z-index: 2;
  display: flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  transform: translateX(-50%) scale(0.6);
  border: 1px solid var(--sg-border);
  border-radius: 50%;
  color: var(--sg-muted);
  background: var(--sg-bg-2);
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.12s ease, transform 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.sg-slide-item:hover > .sg-slide-insert,
.sg-slide-insert:hover {
  opacity: 1;
  transform: translateX(-50%) scale(1);
  color: #b99cff;
  border-color: #5e467f;
}
.sg-slide-thumb {
  position: relative;
  display: block;
  width: 100%;
  margin: 4px 0;
  padding: 0;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: 6px;
  background: #0d0c10;
  cursor: pointer;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.sg-slide-thumb:hover {
  border-color: #3a3346;
}
.sg-slide-thumb.active {
  border-color: #7c5cff;
  box-shadow: 0 0 0 2px rgba(124, 92, 255, 0.25);
}
.sg-slide-thumb-frame {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
  pointer-events: none;
  background: #fff;
}
.sg-slide-thumb-no {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 1;
  padding: 1px 5px;
  border-radius: 3px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.sg-slide-thumb-label {
  display: block;
  padding: 4px 6px;
  overflow: hidden;
  color: var(--sg-fg-2);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 列表底部固定“新建页面”入口 */
.sg-slide-add {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  padding: 9px 0;
  border: 1px dashed var(--sg-border);
  border-radius: 6px;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
}
.sg-slide-add:hover {
  color: #b99cff;
  border-color: #5e467f;
  background: rgba(124, 60, 255, 0.08);
}
/* 中间工作区：WPS/PowerPoint 网页版风格——中性工作区底色，画布居中浮于其上 */
.sg-slide-workarea {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  overflow: auto;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background:
    radial-gradient(circle at 50% 40%, rgba(124, 92, 255, 0.05), transparent 60%),
    #0b0a0e;
}
/* 16:9 画布舞台：等比缩放填满可用区域，四周留工作区边距、带阴影 */
.sg-slide-stage {
  width: 100%;
  max-width: min(100%, calc((100vh - 260px) * 16 / 9));
  aspect-ratio: 16 / 9;
  margin: auto;
  border-radius: 6px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.sg-slide-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}
.sg-editor-hint {
  flex: none;
  color: var(--sg-muted);
  font-size: 12px;
  text-align: center;
}
/* 空状态：无页面时的引导卡片 */
.sg-slide-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 320px;
}
.sg-slide-empty-card {
  text-align: center;
  padding: 40px 48px;
  border: 1px dashed color-mix(in srgb, var(--sg-primary) 35%, transparent);
  border-radius: 16px;
  background: rgba(124, 92, 255, 0.04);
  max-width: 420px;
}
.sg-slide-empty-card h3 {
  margin: 0 0 10px;
  font-size: 20px;
  color: var(--sg-text-primary);
}
.sg-slide-empty-card p {
  margin: 0 0 20px;
  color: var(--sg-muted);
  font-size: 14px;
  line-height: 1.6;
}

/* ============ 演示编辑器：右侧属性面板（跟随选区 + 分组折叠） ============ */
.sg-editor-right {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 14px;
  overflow: auto;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
  width: 300px;
}
.sg-editor-right h4 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 650;
  color: var(--sg-fg-2);
}
.sg-el-section {
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--sg-border);
}
.sg-el-section:last-of-type {
  border-bottom: 0;
  margin-bottom: 0;
  padding-bottom: 0;
}
.sg-el-full {
  width: 100%;
}
.sg-el-empty {
  padding: 14px;
  border: 1px dashed var(--sg-border);
  border-radius: 8px;
}
.sg-el-empty-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sg-fg);
}
.sg-el-multi-bar {
  padding: 6px 0;
}
.sg-el-multi-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.sg-el-overview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 12px 0 0;
}
.sg-el-overview div {
  padding: 8px 10px;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  background: var(--sg-bg);
}
.sg-el-overview dt {
  color: var(--sg-muted);
  font-size: 11px;
}
.sg-el-overview dd {
  margin: 3px 0 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-el-inspector {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sg-el-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.sg-el-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  color: #b99cff;
  background: rgba(124, 60, 255, 0.14);
  font-size: 12px;
  font-weight: 600;
}
.sg-el-id {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-el-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}
.sg-el-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sg-el-field > .sg-el-label {
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-el-foot {
  margin-top: auto;
  padding-top: 12px;
  text-align: left;
}

.sg-el-hint-inline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sg-el-raw {
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--sg-muted);
}
.sg-el-raw > summary {
  cursor: pointer;
  user-select: none;
}
.sg-el-raw > summary:hover {
  color: var(--sg-primary);
}

.sg-el-color-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.sg-el-swatch {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid var(--sg-border);
  cursor: pointer;
  padding: 0;
  transition: transform 0.12s ease;
}
.sg-el-swatch:hover {
  transform: scale(1.12);
}
.sg-el-swatch.active {
  outline: 2px solid var(--sg-primary);
  outline-offset: 2px;
}
.sg-el-color-input {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--sg-border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
/* 主题配色预设：mini 预览条（背景/表面/主色 3 段）+ 名称，选中态 outline，自定义入口同形态 */
.sg-el-palette-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sg-el-palette-reset {
  padding: 0;
  height: auto;
  font-size: 12px;
}
.sg-el-palette-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.sg-el-palette {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}
.sg-el-palette-swatch {
  display: flex;
  width: 52px;
  height: 22px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--sg-border);
  transition: transform 0.12s ease;
}
.sg-el-palette-swatch > span {
  flex: 1;
}
.sg-el-palette-name {
  font-size: 11px;
  line-height: 1;
  color: var(--sg-muted);
}
.sg-el-palette:hover .sg-el-palette-swatch {
  transform: scale(1.06);
}
.sg-el-palette.active .sg-el-palette-swatch {
  outline: 2px solid var(--sg-primary);
  outline-offset: 1px;
}
/* 图片外观开关行（圆角外的边框 / 投影复选） */
.sg-el-switch-row {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16px;
}
.sg-el-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--sg-text-primary);
  cursor: pointer;
  user-select: none;
}
.sg-el-switch input {
  width: 15px;
  height: 15px;
  accent-color: var(--sg-primary);
  cursor: pointer;
}
.sg-el-pos-row {
  flex-direction: row;
  gap: 12px;
}
.sg-el-pos-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sg-el-pos-col .sg-el-label {
  font-size: 12px;
}
.sg-el-hint-sm {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--sg-muted);
}
.sg-el-z-row {
  flex-direction: row;
  gap: 8px;
}

@media (min-width: 1440px) {
  .sg-presentation-layout {
    gap: 16px;
  }
  .sg-presentation-stats {
    gap: 12px;
  }
}
@media (max-width: 1180px) {
  .sg-presentation-toolbar {
    flex-wrap: wrap;
  }
  .sg-presentation-view-switch {
    margin-left: 0;
  }
}
@media (max-width: 760px) {
  .sg-presentation-heading {
    align-items: flex-start;
  }
  .sg-presentation-heading-actions {
    display: none;
  }
  .sg-presentation-title h1 {
    font-size: 21px;
  }
  .sg-presentation-title p {
    white-space: normal;
  }
  .sg-presentation-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sg-presentation-stats article {
    min-height: 84px;
    padding: 10px;
  }
  .sg-presentation-stats article > span {
    width: 32px;
    height: 32px;
  }
  .sg-presentation-search {
    width: 100%;
    flex-basis: 100%;
  }
  .sg-presentation-select.ant-select {
    min-width: 0;
    width: auto;
    flex: 1;
  }
  .sg-presentation-own {
    order: 5;
  }
  .sg-presentation-view-switch {
    margin-left: auto;
  }
  .sg-presentation-grid {
    grid-template-columns: 1fr;
  }
  .sg-presentation-pagination {
    flex-wrap: wrap;
  }
  .sg-presentation-quickstart ol {
    grid-template-columns: 1fr;
  }
  .sg-presentation-quickstart li > svg {
    display: none;
  }
  .sg-presentation-side {
    display: flex;
  }
}
`);
