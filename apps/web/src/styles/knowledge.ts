import { createStyles } from "antd-style";

export const useKnowledgeStyles = createStyles(({ css }) => ({
  root: css`
/* V6 Knowledge Base: NotebookLM Bookshelf + Conversational Spotlight Inspector */
.zx-kb-studio {
  flex: 1;
  width: 100%;
  padding: 34px 44px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
}

.zx-kb-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.zx-kb-top h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 770;
  letter-spacing: -0.025em;
  color: var(--sg-fg);
}

.zx-kb-split {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 392px;
  gap: 24px;
  align-items: start;
  min-height: 0;
}
.zx-kb-shelf-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.zx-kb-filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

/* NotebookLM 2x3 Tactile Knowledge Cards */
.zx-notebook-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-content: start;
}
.zx-nb-card {
  border-radius: 20px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border);
  box-shadow: var(--zx-card-shadow);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  text-align: left;
  color: inherit;
  min-height: 196px;
  transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
}
.zx-nb-card:hover {
  transform: translateY(-2px);
  border-color: var(--zx-border-strong);
}
.zx-nb-card.selected {
  background: linear-gradient(
    145deg,
    rgba(168, 85, 247, 0.22) 0%,
    rgba(56, 189, 248, 0.10) 52%,
    rgba(18, 22, 38, 0.90) 100%
  );
  border-color: rgba(192, 132, 252, 0.55);
  box-shadow: 0 0 0 2px var(--zx-brand-soft), var(--zx-card-shadow);
}
.zx-nb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.zx-nb-title {
  font-size: 15.5px;
  font-weight: 720;
  color: var(--sg-fg);
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.zx-nb-title > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.zx-nb-desc {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--sg-muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.zx-nb-foot {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--zx-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--sg-fg-2);
}
.zx-av-group {
  display: flex;
  align-items: center;
}
.zx-av-group > * + * {
  margin-left: -6px;
}

/* Right Conversational Knowledge Spotlight Drawer */
.zx-kb-inspector {
  position: sticky;
  top: 20px;
  border-radius: 22px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border-strong);
  box-shadow: var(--zx-card-shadow);
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
}
.zx-kb-subtabs {
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid var(--zx-border);
  padding: 10px 0 9px;
}
.zx-kb-subtab {
  border: 0;
  padding: 0;
  background: transparent;
  font-size: 12.5px;
  color: var(--sg-muted);
  cursor: pointer;
}
.zx-kb-subtab:hover {
  color: var(--sg-fg-2);
}
.zx-kb-subtab.active {
  color: var(--zx-brand);
  font-weight: 700;
}

.zx-ask-box {
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    rgba(251, 113, 133, 0.14),
    rgba(168, 85, 247, 0.20),
    rgba(56, 189, 248, 0.14)
  );
  border: 1px solid var(--zx-brand-border);
  margin: 14px 0;
}
.zx-ask-form {
  margin-top: 9px;
  height: 36px;
  padding: 0 6px 0 12px;
  border-radius: 999px;
  background: var(--zx-canvas-solid);
  border: 1px solid var(--zx-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.zx-ask-form input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--sg-fg);
  font-size: 12px;
}
.zx-ask-form input::placeholder {
  color: var(--sg-muted);
}
.zx-ask-submit {
  height: 26px;
  padding: 0 12px;
  border-radius: 999px;
  border: 0;
  background: var(--zx-cta-bg);
  color: #fff;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  flex-shrink: 0;
}
.zx-ask-answer {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--zx-canvas-solid);
  border: 1px solid var(--zx-border);
  font-size: 12px;
  line-height: 1.55;
  color: var(--sg-fg-2);
}

.zx-chip-4 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.zx-stat-chip {
  padding: 11px 13px;
  border-radius: 13px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
  min-width: 0;
}
.zx-stat-chip small {
  font-size: 11.5px;
  color: var(--sg-muted);
  display: block;
}
.zx-stat-chip strong {
  font-size: 14px;
  font-weight: 720;
  color: var(--sg-fg);
  margin-top: 3px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.zx-dist-bar {
  height: 9px;
  border-radius: 999px;
  overflow: hidden;
  display: flex;
  gap: 2px;
  margin: 10px 0;
}
.zx-src-item {
  width: 100%;
  padding: 9px 0;
  border: 0;
  border-bottom: 1px solid var(--zx-border);
  background: transparent;
  color: var(--sg-fg-2);
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
}
.zx-src-item:hover {
  color: var(--sg-fg);
}
.zx-src-item:last-child {
  border-bottom: 0;
}

@media (max-width: 1280px) {
  .zx-kb-studio {
    padding: 28px 24px;
  }
  .zx-kb-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .zx-kb-inspector {
    position: static;
  }
}
@media (max-width: 760px) {
  .zx-notebook-grid {
    grid-template-columns: 1fr;
  }
}
  `,
}));
