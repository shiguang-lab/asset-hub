import { createGlobalStyle, css } from "antd-style";

export const DocumentCardsGlobalStyles = createGlobalStyle(css`
/* Document card view */
.sg-docs-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.sg-doc-card {
  display: flex;
  min-width: 0;
  min-height: 202px;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
  cursor: pointer;
  outline: none;
  transition:
    border-color 150ms ease,
    background 150ms ease,
    transform 150ms ease;
}
.sg-doc-card:hover,
.sg-doc-card:focus-visible {
  border-color: var(--sg-accent);
  background: #17151c;
}
.sg-doc-card:focus-visible {
  box-shadow: 0 0 0 2px var(--sg-accent-soft);
}
.sg-doc-card-head,
.sg-doc-card-meta,
.sg-doc-card-foot {
  display: flex;
  align-items: center;
}
.sg-doc-card-head {
  gap: 9px;
}
.sg-doc-card-head .sg-asset-icn {
  width: 42px;
  height: 42px;
  flex: none;
  border-radius: 9px;
}
.sg-doc-card-type {
  color: var(--sg-muted);
  font-size: 11px;
}
.sg-doc-card-head .sg-asset-more {
  margin-left: auto;
}
.sg-doc-card-body {
  min-width: 0;
  margin-top: 14px;
}
.sg-doc-card-title {
  display: block;
  width: 100%;
  margin: 0;
  overflow: hidden;
  padding: 0;
  border: 0;
  color: var(--sg-fg);
  background: transparent;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.45;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.sg-doc-card-title:hover {
  color: var(--sg-accent);
}
.sg-doc-card-title:focus-visible {
  border-radius: 3px;
  outline: 2px solid var(--sg-accent);
  outline-offset: 2px;
}
.sg-doc-card-desc {
  display: -webkit-box;
  overflow: hidden;
  margin: 6px 0 0;
  color: var(--sg-muted);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.sg-doc-card-body .sg-asset-tags {
  margin-top: 7px;
}
.sg-doc-card-meta {
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 16px;
  color: var(--sg-muted);
  font-size: 12px;
}
.sg-doc-card-meta .sg-owner {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-doc-card-foot {
  min-width: 0;
  gap: 8px;
  margin-top: 12px;
  padding-top: 11px;
  border-top: 1px solid var(--sg-border);
}
.sg-doc-card-relations {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-doc-card-relations .sg-badge {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.sg-doc-card-foot .sg-docs-actions {
  flex: none;
}

@media (max-width: 1100px) {
  .sg-docs-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .sg-docs-grid {
    grid-template-columns: 1fr;
  }
}
`);
