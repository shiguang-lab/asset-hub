import { createGlobalStyle, css } from "antd-style";

export const UiOverlaysGlobalStyles = createGlobalStyle(css`
/* ---------------- modal ---------------- */
.sg-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 20, 32, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}
.sg-modal {
  background: var(--sg-bg-2);
  border: 1px solid var(--sg-border);
  border-radius: 14px;
  width: 100%;
  max-width: 560px;
  max-height: 86vh;
  overflow: auto;
  box-shadow: var(--sg-shadow-lg);
}
.sg-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sg-border);
}
.sg-modal-body {
  padding: 20px;
}
.sg-modal-foot {
  padding: 14px 20px;
  border-top: 1px solid var(--sg-border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ---------------- dropdown ---------------- */
.sg-dropdown {
  position: relative;
  display: inline-block;
}
.sg-dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 200px;
  background: var(--sg-bg-2);
  border: 1px solid var(--sg-border);
  border-radius: 10px;
  box-shadow: var(--sg-shadow-lg);
  z-index: 60;
  padding: 6px;
}
.sg-dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--sg-fg);
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.sg-dropdown-item:hover {
  background: var(--sg-bg-3);
}
.sg-dropdown-item.danger {
  color: var(--sg-danger);
}

/* ---------------- toasts ---------------- */
.sg-toast-wrap {
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 200;
}
.sg-toast {
  background: var(--sg-bg-2);
  border: 1px solid var(--sg-border);
  border-left: 4px solid var(--sg-accent);
  border-radius: 10px;
  padding: 12px 16px;
  min-width: 240px;
  max-width: 380px;
  box-shadow: var(--sg-shadow-lg);
  font-size: 13px;
  animation: sg-in 0.2s ease;
}
.sg-toast.success {
  border-left-color: var(--sg-success);
}
.sg-toast.error {
  border-left-color: var(--sg-danger);
}
.sg-toast.warning {
  border-left-color: var(--sg-warning);
}
@keyframes sg-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes sg-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------------- progress ---------------- */
.sg-progress {
  height: 6px;
  background: var(--sg-bg-3);
  border-radius: 999px;
  overflow: hidden;
}
.sg-progress > div {
  height: 100%;
  background: var(--sg-accent);
  border-radius: 999px;
  transition: width 0.4s ease;
}

/* ---------------- skeleton & empty ---------------- */
.sg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: var(--sg-muted);
  text-align: center;
}
.sg-skeleton {
  background: linear-gradient(90deg, var(--sg-bg-3) 25%, var(--sg-bg-2) 50%, var(--sg-bg-3) 75%);
  background-size: 200% 100%;
  animation: sg-shimmer 1.4s infinite;
  border-radius: 6px;
}
@keyframes sg-shimmer {
  to {
    background-position: -200% 0;
  }
}
`);
