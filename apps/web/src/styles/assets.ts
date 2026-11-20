import { createStyles } from "antd-style";

export const useAssetsStyles = createStyles(({ css }) => ({
  root: css`
/* V6 Assets Studio + Shared Asset / Owner Avatar Primitives */
.sg-assets,
.zx-ast-studio {
  width: 100%;
}

.zx-ast-studio {
  flex: 1;
  padding: 34px 44px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-sizing: border-box;
}

.zx-ast-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.zx-ast-head h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 770;
  letter-spacing: -0.025em;
  color: var(--sg-fg);
}
.zx-ast-head p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sg-muted);
}

.zx-storage-pill {
  height: 36px;
  padding: 0 15px;
  border-radius: 999px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--sg-fg-2);
}
.zx-storage-pill b {
  color: var(--sg-fg);
  font-weight: 680;
}
.zx-mini-meter {
  width: 68px;
  height: 5px;
  border-radius: 999px;
  background: var(--zx-border);
  overflow: hidden;
}
.zx-mini-meter i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--zx-prog-grad);
}

.zx-type-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.zx-type-seg {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border);
}
.zx-t-pill {
  height: 31px;
  padding: 0 12px;
  border-radius: 10px;
  border: 0;
  background: transparent;
  font-size: 12.5px;
  font-weight: 540;
  color: var(--sg-fg-2);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}
.zx-t-pill:hover {
  color: var(--sg-fg);
}
.zx-t-pill small {
  color: var(--sg-muted);
  font-size: 11.5px;
}
.zx-t-pill.active {
  background: var(--zx-active-pill);
  box-shadow: var(--zx-active-shadow);
  color: var(--sg-fg);
  font-weight: 680;
}
.zx-t-pill.active small {
  color: var(--zx-brand);
}

.zx-qf-pill {
  height: 33px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px solid var(--zx-border);
  background: var(--zx-surface-subtle);
  color: var(--sg-fg-2);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}
.zx-qf-pill:hover {
  border-color: var(--zx-border-strong);
  color: var(--sg-fg);
}
.zx-qf-pill.active {
  background: var(--zx-brand-soft);
  border-color: var(--zx-brand-border);
  color: #E9D5FF;
}

/* 3 Spotlight Recent-Open Cards */
.zx-spot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.zx-spot-card {
  border-radius: 18px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border);
  box-shadow: var(--zx-card-shadow);
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: transform 150ms ease, border-color 150ms ease;
}
.zx-spot-card:hover {
  transform: translateY(-2px);
  border-color: var(--zx-brand-border);
}
.zx-spot-thumb {
  width: 108px;
  height: 74px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid var(--zx-border);
}

/* Floating Borderless Glass Asset Rows */
.zx-strip-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.zx-asset-strip {
  min-height: 68px;
  padding: 10px 20px;
  border-radius: 16px;
  background: var(--zx-surface-card);
  border: 1px solid var(--zx-border);
  box-shadow: var(--zx-card-shadow);
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) 112px 124px 146px 132px auto;
  align-items: center;
  gap: 14px;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 150ms ease, transform 150ms ease;
}
.zx-asset-strip:hover {
  border-color: var(--zx-brand-border);
  transform: translateX(2px);
}

/* Shared classes used by OwnerAvatar, asset-row, and secondary pages */
.sg-assets-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.sg-assets-head .sg-h1 {
  margin: 0 0 5px;
  font-size: 26px;
}
.sg-assets-sub {
  margin: 0;
  color: var(--sg-muted);
  font-size: 13px;
}
.sg-assets-head-btn.ant-btn {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 15px;
  border-color: var(--zx-border-strong);
  border-radius: 999px;
  color: var(--sg-fg);
  background: var(--zx-surface-subtle);
  font-size: 13px;
  font-weight: 560;
}
.sg-assets-head-btn.ant-btn:hover {
  color: #fff !important;
  border-color: var(--zx-brand-border) !important;
  background: var(--zx-brand-soft) !important;
}

.sg-asset-name {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.sg-asset-icn {
  width: 34px;
  height: 34px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 10px;
}
.sg-asset-icn.sm {
  width: 24px;
  height: 24px;
  border-radius: 7px;
}
.sg-asset-icn.violet,
.sg-asset-icn.purple {
  color: #D8B4FE;
  background: rgba(168, 85, 247, 0.20);
}
.sg-asset-icn.blue {
  color: #A5B4FC;
  background: rgba(99, 102, 241, 0.20);
}
.sg-asset-icn.green {
  color: #6EE7B7;
  background: rgba(16, 185, 129, 0.20);
}
.sg-asset-icn.teal,
.sg-asset-icn.cyan {
  color: #7DD3FC;
  background: rgba(14, 165, 233, 0.20);
}
.sg-asset-icn.orange {
  color: #FCD34D;
  background: rgba(245, 158, 11, 0.20);
}
.sg-asset-icn.red {
  color: #FDA4AF;
  background: rgba(244, 63, 94, 0.20);
}
.sg-asset-icn.gray {
  color: #CBD5E1;
  background: rgba(148, 163, 184, 0.16);
}
.sg-asset-name-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sg-asset-title {
  display: block;
  overflow: hidden;
  color: var(--sg-fg);
  font-size: 13.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-owner-stack {
  display: inline-flex;
  align-items: center;
  min-width: 24px;
}
.sg-owner-stack > * + * {
  margin-left: -8px;
}
.sg-owner-avatar {
  width: 24px;
  height: 24px;
  display: grid;
  flex: none;
  place-items: center;
  border: 2px solid #13172B;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, #6366F1, #A855F7);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
  cursor: default;
}
.sg-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.sg-status-dot {
  width: 7.5px;
  height: 7.5px;
  flex: none;
  border-radius: 50%;
}
.sg-status-dot.ok {
  background: #34D399;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.45);
}
.sg-status-dot.warn {
  background: #FBBF24;
}
.sg-status-dot.muted {
  background: #94A3B8;
}
.sg-status-dot.err {
  background: #FB7185;
}
.sg-vis {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  overflow: hidden;
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-vis.public {
  color: #6EE7B7;
}
.sg-vis.link {
  color: #7DD3FC;
}
.sg-asset-more {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--zx-border);
  border-radius: 99px;
  color: var(--sg-fg-2);
  background: var(--zx-surface-subtle);
  cursor: pointer;
}
.sg-asset-more:hover {
  color: #fff;
  border-color: var(--zx-brand-border);
}

@media (max-width: 1280px) {
  .zx-ast-studio {
    padding: 28px 24px;
  }
  .zx-spot-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .zx-asset-strip {
    grid-template-columns: minmax(0, 1fr) 96px 116px 36px;
  }
  .zx-asset-strip > .hide-md {
    display: none;
  }
}
@media (max-width: 760px) {
  .zx-spot-grid {
    grid-template-columns: 1fr;
  }
}
  `,
}));
