import { createGlobalStyle, css } from "antd-style";

export const UiUtilitiesGlobalStyles = createGlobalStyle(css`
/* ---------------- markdown read ---------------- */
.sg-reader {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 0;
}

/* ---------------- switch ---------------- */
.sg-switch {
  position: relative;
  width: 40px;
  height: 22px;
  background: var(--sg-bg-3);
  border-radius: 999px;
  border: 1px solid var(--sg-border);
  cursor: pointer;
  transition: background 0.2s;
}
.sg-switch.on {
  background: var(--sg-accent);
  border-color: var(--sg-accent);
}
.sg-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}
.sg-switch.on::after {
  transform: translateX(18px);
}

.sg-kbd {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--sg-border);
  border-bottom-width: 2px;
  border-radius: 5px;
  padding: 1px 6px;
  font-size: 11px;
  color: var(--sg-muted);
  background: var(--sg-bg-2);
  font-family: var(--sg-mono);
}

/* ---------------- timeline / logs ---------------- */
.sg-timeline {
  position: relative;
  padding-left: 20px;
}
.sg-timeline::before {
  content: "";
  position: absolute;
  left: 6px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: var(--sg-border);
}
.sg-timeline-item {
  position: relative;
  padding: 6px 0 14px;
}
.sg-timeline-item::before {
  content: "";
  position: absolute;
  left: -18px;
  top: 10px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--sg-accent);
  border: 2px solid var(--sg-bg-2);
}
.sg-timeline-item.done::before {
  background: var(--sg-success);
}
.sg-timeline-item.pending::before {
  background: var(--sg-muted);
}

.sg-log-line {
  font-family: var(--sg-mono);
  font-size: 12.5px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--sg-border);
  color: var(--sg-fg-2);
}
.sg-log-time {
  color: var(--sg-muted);
  margin-right: 8px;
}
`);
