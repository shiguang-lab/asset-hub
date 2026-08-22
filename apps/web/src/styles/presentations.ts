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
  font-size: 11px;
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
  font-size: 9px;
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
  font-size: 8px;
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
  font-size: 9px;
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
  font-size: 8.5px;
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
  border: 1px solid var(--sg-border);
  border-radius: 7px;
  background: var(--sg-bg-2);
}
.sg-presentation-table {
  width: 100%;
  min-width: 680px;
  border-collapse: collapse;
  table-layout: fixed;
}
.sg-presentation-table th,
.sg-presentation-table td {
  height: 58px;
  padding: 8px 9px;
  border-bottom: 1px solid var(--sg-border);
  color: var(--sg-fg-2);
  font-size: 8.5px;
  text-align: left;
}
.sg-presentation-table th {
  height: 34px;
  color: var(--sg-muted);
  background: #15131a;
  font-weight: 500;
}
.sg-presentation-table tbody tr:last-of-type td {
  border-bottom: 0;
}
.sg-presentation-table tbody tr:hover td {
  background: rgba(255, 255, 255, 0.018);
}
.sg-presentation-table th:nth-of-type(1) {
  width: 47%;
}
.sg-presentation-table th:nth-of-type(2) {
  width: 11%;
}
.sg-presentation-table th:nth-of-type(3) {
  width: 14%;
}
.sg-presentation-table th:nth-of-type(4) {
  width: 16%;
}
.sg-presentation-table th:nth-of-type(5) {
  width: 8%;
}
.sg-presentation-table th:nth-of-type(6) {
  width: 110px;
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
  font-size: 9.5px;
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
  font-size: 7px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-presentation-thumb {
  position: relative;
  display: inline-flex;
  width: 82px;
  aspect-ratio: 16 / 9;
  flex: none;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  padding: 7px;
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
  top: 8px;
  right: 8px;
  width: 23px;
  height: 14px;
}
.sg-presentation-thumb::after {
  top: 13px;
  right: 13px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
}
.sg-presentation-thumb > i {
  top: 9px;
  left: 8px;
  width: 18px;
  height: 3px;
  border: 0;
  background: rgba(255, 255, 255, 0.75);
  box-shadow: 0 6px rgba(255, 255, 255, 0.28);
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
  font-size: 6.5px;
}
.sg-presentation-thumb > small {
  margin-top: 2px;
  opacity: 0.62;
  font-size: 4px;
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
  font-size: 10px;
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
  font-size: 8px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.sg-presentation-grid article > div > span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--sg-muted);
  font-size: 8px;
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
  font-size: 8.5px;
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
  font-size: 10px;
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
  font-size: 8px;
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
  font-size: 8.5px;
}
.sg-presentation-quickstart li small {
  margin-top: 3px;
  color: var(--sg-muted);
  font-size: 7px;
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
  font-size: 11px;
}
.sg-presentation-side-title > button {
  padding: 0;
  border: 0;
  color: #a47fff;
  background: transparent;
  font-size: 8px;
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
  font-size: 6.5px;
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
  font-size: 6px;
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
  font-size: 7px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-presentation-analytics dd {
  margin: 4px 0 2px;
  overflow: hidden;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-presentation-analytics dl small {
  color: var(--sg-success);
  font-size: 7px;
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
  font-size: 9px;
}
.sg-presentation-top-list li > button {
  overflow: hidden;
  padding: 0;
  border: 0;
  color: var(--sg-fg-2);
  background: transparent;
  font-size: 8px;
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
  font-size: 7px;
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
  font-size: 8px;
}
.sg-presentation-recent small {
  margin-top: 4px;
  color: var(--sg-muted);
  font-size: 7px;
}

@media (min-width: 1440px) {
  .sg-presentation-layout {
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 16px;
  }
  .sg-presentation-stats {
    gap: 12px;
  }
}
@media (max-width: 1180px) {
  .sg-presentation-layout {
    grid-template-columns: 1fr;
  }
  .sg-presentation-side {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
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
  .sg-presentation-table {
    min-width: 0;
  }
  .sg-presentation-table th:nth-of-type(2),
  .sg-presentation-table th:nth-of-type(3),
  .sg-presentation-table th:nth-of-type(4),
  .sg-presentation-table th:nth-of-type(5),
  .sg-presentation-table td:nth-of-type(2),
  .sg-presentation-table td:nth-of-type(3),
  .sg-presentation-table td:nth-of-type(4),
  .sg-presentation-table td:nth-of-type(5) {
    display: none;
  }
  .sg-presentation-table th:nth-of-type(1) {
    width: auto;
  }
  .sg-presentation-table th:nth-of-type(6) {
    width: 86px;
  }
  .sg-presentation-table th:nth-of-type(6),
  .sg-presentation-table td:nth-of-type(6) {
    padding-inline: 4px;
  }
  .sg-presentation-table .sg-presentation-thumb {
    width: 62px;
  }
  .sg-presentation-table .sg-presentation-favorite {
    display: none;
  }
  .sg-presentation-table .sg-presentation-row-actions {
    gap: 3px;
  }
  .sg-presentation-table .sg-presentation-row-actions button {
    width: 25px;
    height: 25px;
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
