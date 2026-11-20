import { createStyles } from "antd-style";

export const useDocumentCardsStyles = createStyles(({ css }) => ({
  root: css`
/* V6 Craft-Style Paper Cover Gallery */
.zx-doc-gallery {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  align-content: start;
}

.zx-paper-card {
  border-radius: 20px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border);
  box-shadow: var(--zx-card-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease;
}
.zx-paper-card:hover {
  transform: translateY(-3px);
  border-color: var(--zx-brand-border);
}
.zx-paper-card.is-trashed {
  cursor: default;
}
.zx-paper-card.is-trashed:hover {
  transform: none;
  border-color: var(--zx-border-strong);
}

.zx-paper-preview {
  height: 132px;
  position: relative;
  border-bottom: 1px solid var(--zx-border);
  overflow: hidden;
}
.zx-float-vis {
  position: absolute;
  top: 11px;
  left: 12px;
  backdrop-filter: blur(12px);
}
.zx-float-acts {
  position: absolute;
  top: 11px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.zx-mini-act {
  width: 28px;
  height: 28px;
  border-radius: 99px;
  background: rgba(17, 20, 36, 0.88);
  border: 1px solid var(--zx-border-strong);
  color: var(--sg-fg-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: border-color 140ms ease, color 140ms ease, transform 140ms ease;
}
.zx-mini-act:hover {
  border-color: var(--zx-brand-border);
  color: #fff;
  transform: scale(1.05);
}
.zx-mini-act.ai {
  color: var(--zx-brand);
  border-color: var(--zx-brand-border);
}
.zx-mini-act.restore {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.36);
}
.zx-mini-act.restore:hover {
  color: #ecfdf5;
  background: rgba(6, 95, 70, 0.92);
  border-color: rgba(52, 211, 153, 0.75);
}
.zx-mini-act.danger {
  color: #fda4af;
  border-color: rgba(244, 63, 94, 0.36);
}
.zx-mini-act.danger:hover {
  color: #fff;
  background: rgba(190, 18, 60, 0.92);
  border-color: rgba(244, 63, 94, 0.85);
}

.zx-paper-body {
  padding: 16px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.zx-paper-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--sg-fg);
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.zx-paper-title > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zx-paper-desc {
  margin: 0;
  font-size: 12.5px;
  color: var(--sg-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 37px;
}
.zx-paper-foot {
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--sg-muted);
}

@media (max-width: 1180px) {
  .zx-doc-gallery {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .zx-doc-gallery {
    grid-template-columns: 1fr;
  }
}
  `,
}));
