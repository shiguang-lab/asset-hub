import { createGlobalStyle, css } from "antd-style";

export const UiControlsGlobalStyles = createGlobalStyle(css`
/* ---------------- buttons ---------------- */
.sg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--sg-border);
  background: var(--sg-bg-2);
  color: var(--sg-fg);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.sg-btn:hover {
  border-color: var(--sg-accent);
  color: var(--sg-accent);
}
.sg-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.sg-btn-primary {
  background: var(--sg-accent);
  border-color: var(--sg-accent);
  color: #fff;
}
.sg-btn-primary:hover {
  background: var(--sg-accent-2);
  border-color: var(--sg-accent-2);
  color: #fff;
}
.sg-btn-danger {
  color: var(--sg-danger);
  border-color: var(--sg-danger);
}
.sg-btn-ghost {
  background: transparent;
  border-color: transparent;
}
.sg-btn-sm {
  padding: 5px 10px;
  font-size: 12px;
  border-radius: 7px;
}
.sg-btn-lg {
  padding: 10px 18px;
  font-size: 14px;
}

/* ---------------- inputs ---------------- */
.sg-input,
.sg-textarea,
.sg-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--sg-border);
  border-radius: 8px;
  background: var(--sg-bg-2);
  color: var(--sg-fg);
  font-size: 13.5px;
  font-family: var(--sg-font);
  outline: none;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.sg-input:focus,
.sg-textarea:focus,
.sg-select:focus {
  border-color: var(--sg-accent);
  box-shadow: 0 0 0 3px var(--sg-accent-soft);
}
.sg-textarea {
  resize: vertical;
  min-height: 96px;
  font-family: var(--sg-mono);
  font-size: 13px;
  line-height: 1.65;
}
.sg-label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--sg-fg-2);
  margin: 0 0 6px;
}
.sg-field {
  margin-bottom: 16px;
}
.sg-hint {
  font-size: 12px;
  color: var(--sg-muted);
  margin-top: 4px;
}

/* ---------------- cards ---------------- */
.sg-card {
  background: var(--sg-bg-2);
  border: 1px solid var(--sg-border);
  border-radius: var(--sg-radius);
  padding: 18px;
}
.sg-card.hoverable {
  cursor: pointer;
  transition:
    border-color 0.15s,
    transform 0.15s;
}
.sg-card.hoverable:hover {
  border-color: var(--sg-accent);
  transform: translateY(-1px);
}
.sg-stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sg-stat-card .label {
  color: var(--sg-muted);
  font-size: 12.5px;
}
.sg-stat-card .value {
  font-size: 24px;
  font-weight: 750;
}
.sg-stat-card .delta {
  font-size: 12px;
  color: var(--sg-success);
}

/* ---------------- badges & tags ---------------- */
.sg-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  padding: 2px 9px;
  font-size: 11.5px;
  font-weight: 600;
  background: var(--sg-bg-3);
  color: var(--sg-fg-2);
}
.sg-badge-accent {
  background: var(--sg-accent-soft);
  color: var(--sg-accent);
}
.sg-badge-success {
  background: rgba(48, 164, 108, 0.12);
  color: var(--sg-success);
}
.sg-badge-warning {
  background: rgba(245, 165, 36, 0.14);
  color: #b87800;
}
.sg-badge-danger {
  background: rgba(229, 72, 77, 0.12);
  color: var(--sg-danger);
}
.sg-tag {
  display: inline-flex;
  align-items: center;
  background: var(--sg-bg-3);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
}

/* ---------------- layout helpers ---------------- */
.sg-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sg-row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sg-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sg-grid {
  display: grid;
  gap: 16px;
}
.sg-mt {
  margin-top: 16px;
}
.sg-mb {
  margin-bottom: 16px;
}
.sg-mt-sm {
  margin-top: 8px;
}
.sg-mb-sm {
  margin-bottom: 8px;
}
.sg-flex-1 {
  flex: 1;
  min-width: 0;
}
.sg-wrap {
  flex-wrap: wrap;
}
.sg-center {
  display: flex;
  align-items: center;
  justify-content: center;
}
.sg-spacer {
  flex: 1;
}

/* ---------------- tabs ---------------- */
.sg-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--sg-border);
  margin-bottom: 16px;
}
.sg-tab {
  padding: 9px 14px;
  font-size: 13.5px;
  font-weight: 550;
  color: var(--sg-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.sg-tab:hover {
  color: var(--sg-fg);
}
.sg-tab.active {
  color: var(--sg-accent);
  border-bottom-color: var(--sg-accent);
}

/* ---------------- tables ---------------- */
.sg-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.sg-table th {
  text-align: left;
  padding: 9px 12px;
  color: var(--sg-muted);
  font-weight: 600;
  font-size: 12px;
  border-bottom: 1px solid var(--sg-border);
  background: var(--sg-bg-3);
  white-space: nowrap;
}
.sg-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--sg-border);
  vertical-align: middle;
}
.sg-table tr:hover td {
  background: var(--sg-bg-3);
}
`);
