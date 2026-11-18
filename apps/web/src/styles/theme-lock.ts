import { createStyles } from "antd-style";

export const useThemeLockStyles = createStyles(({ css, token }) => {
  const appToken = token as typeof token & Record<string, string>;
  return {
    root: css`
/* V6 Aurora Nebula Glass C-End Theme System (Single Locked Dark Theme) */
& {
  --sg-fg: ${appToken.colorTextPrimary ?? "#F6F7FB"};
  --sg-fg-2: ${appToken.colorTextSecondary ?? "#B5BED2"};
  --sg-muted: ${appToken.colorTextMuted ?? "#7B859F"};
  --sg-bg: ${appToken.colorSurface ?? "#060811"};
  --sg-bg-2: ${appToken.colorSurfaceSecondary ?? "#13172B"};
  --sg-bg-3: ${appToken.colorSurfaceTertiary ?? "#191F38"};
  --sg-border: ${appToken.colorStroke ?? "rgba(255, 255, 255, 0.09)"};
  --sg-accent: ${appToken.colorAccent ?? "#C084FC"};
  --sg-accent-2: ${appToken.colorAccentHover ?? "#D8B4FE"};
  --sg-accent-soft: ${appToken.colorAccentSoft ?? "rgba(168, 85, 247, 0.20)"};
  --sg-danger: ${token.colorError};
  --sg-success: ${token.colorSuccess};
  --sg-warning: ${token.colorWarning};
  --sg-radius: 14px;
  --sg-radius-sm: 10px;
  --sg-shadow: 0 14px 32px -10px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.085);
  --sg-shadow-lg: 0 26px 64px rgba(0, 0, 0, 0.65);
  --sg-font:
    -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --sg-mono: "SF Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
  --sg-sidebar-w: 224px;
  --sg-page-gutter: 28px;

  /* V6 Studio Aurora Tokens */
  --zx-frame-bg:
    radial-gradient(760px 460px at 16% -6%, rgba(251, 113, 133, 0.36), transparent 72%),
    radial-gradient(880px 500px at 52% -10%, rgba(168, 85, 247, 0.42), transparent 74%),
    radial-gradient(760px 460px at 86% -6%, rgba(56, 189, 248, 0.34), transparent 72%),
    radial-gradient(620px 380px at 10% 96%, rgba(99, 102, 241, 0.18), transparent 74%),
    #060811;
  --zx-canvas-bg:
    radial-gradient(660px 360px at 24% -6%, rgba(251, 113, 133, 0.27), rgba(251, 146, 60, 0.07) 45%, transparent 74%),
    radial-gradient(780px 400px at 52% -8%, rgba(168, 85, 247, 0.34), rgba(99, 102, 241, 0.13) 48%, transparent 76%),
    radial-gradient(660px 360px at 80% -5%, rgba(56, 189, 248, 0.26), rgba(45, 212, 191, 0.07) 45%, transparent 74%),
    linear-gradient(180deg, rgba(16, 19, 35, 0.78) 0%, rgba(11, 14, 25, 0.93) 46%, rgba(9, 11, 20, 0.97) 100%);
  --zx-canvas-solid: #111424;
  --zx-canvas-border: rgba(255, 255, 255, 0.105);
  --zx-canvas-shadow: 0 26px 64px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.17);
  --zx-rail-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.065) 0%, rgba(255, 255, 255, 0.022) 100%);
  --zx-rail-border: rgba(255, 255, 255, 0.095);
  --zx-rail-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 18px 42px rgba(0, 0, 0, 0.45);
  --zx-surface-card: linear-gradient(165deg, rgba(31, 36, 60, 0.68) 0%, rgba(16, 19, 33, 0.86) 100%);
  --zx-surface-subtle: rgba(255, 255, 255, 0.05);
  --zx-border: rgba(255, 255, 255, 0.09);
  --zx-border-strong: rgba(255, 255, 255, 0.18);
  --zx-brand: #C084FC;
  --zx-brand-soft: rgba(168, 85, 247, 0.20);
  --zx-brand-border: rgba(192, 132, 252, 0.36);
  --zx-cta-bg: linear-gradient(135deg, #FB7185 0%, #A855F7 52%, #6366F1 100%);
  --zx-cta-shadow: 0 8px 22px -3px rgba(168, 85, 247, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.36);
  --zx-active-pill: linear-gradient(95deg, rgba(244, 114, 182, 0.18) 0%, rgba(168, 85, 247, 0.26) 48%, rgba(56, 189, 248, 0.14) 100%);
  --zx-active-shadow: 0 4px 16px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.19), 0 0 0 1px rgba(192, 132, 252, 0.28);
  --zx-card-shadow: 0 14px 32px -10px rgba(0, 0, 0, 0.52), inset 0 1px 0 rgba(255, 255, 255, 0.085);
  --zx-omni-rim: linear-gradient(120deg, rgba(251, 113, 133, 0.85) 0%, rgba(192, 132, 252, 0.85) 50%, rgba(56, 189, 248, 0.88) 100%);
  --zx-omni-bg: linear-gradient(180deg, rgba(24, 28, 48, 0.92) 0%, rgba(15, 18, 32, 0.96) 100%);
  --zx-omni-shadow: 0 26px 64px -12px rgba(139, 92, 246, 0.38), 0 10px 28px -8px rgba(244, 114, 182, 0.24);
  --zx-prog-grad: linear-gradient(90deg, #FB7185, #C084FC, #38BDF8);
}

.tabular {
  font-variant-numeric: tabular-nums;
}

/* Reusable C-End Pills, Jewels & Tactile Buttons */
.zx-btn-cta {
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--zx-cta-bg);
  box-shadow: var(--zx-cta-shadow);
  color: #fff;
  font-size: 13px;
  font-weight: 650;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 140ms ease, opacity 140ms ease;
}
.zx-btn-cta:hover {
  transform: translateY(-1px);
  opacity: 0.96;
  color: #fff;
}
.zx-btn-cta:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.zx-btn-glass {
  height: 36px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--zx-surface-subtle);
  border: 1px solid var(--zx-border-strong);
  color: var(--sg-fg);
  font-size: 12.5px;
  font-weight: 560;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 140ms ease, background 140ms ease;
}
.zx-btn-glass:hover {
  border-color: var(--zx-brand-border);
  background: rgba(255, 255, 255, 0.08);
  color: var(--sg-fg);
}

.zx-jewel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  flex-shrink: 0;
}
.zx-jewel.indigo,
.zx-jewel.blue {
  color: #A5B4FC;
  background: rgba(99, 102, 241, 0.20);
  border: 1px solid rgba(129, 140, 248, 0.30);
}
.zx-jewel.sky,
.zx-jewel.cyan,
.zx-jewel.teal {
  color: #7DD3FC;
  background: rgba(14, 165, 233, 0.20);
  border: 1px solid rgba(56, 189, 248, 0.30);
}
.zx-jewel.emerald,
.zx-jewel.green {
  color: #6EE7B7;
  background: rgba(16, 185, 129, 0.20);
  border: 1px solid rgba(52, 211, 153, 0.30);
}
.zx-jewel.violet,
.zx-jewel.purple {
  color: #D8B4FE;
  background: rgba(168, 85, 247, 0.22);
  border: 1px solid rgba(192, 132, 252, 0.32);
}
.zx-jewel.amber,
.zx-jewel.orange {
  color: #FCD34D;
  background: rgba(245, 158, 11, 0.20);
  border: 1px solid rgba(251, 191, 36, 0.30);
}
.zx-jewel.rose,
.zx-jewel.red {
  color: #FDA4AF;
  background: rgba(244, 63, 94, 0.20);
  border: 1px solid rgba(251, 113, 133, 0.30);
}
.zx-jewel.gray {
  color: #CBD5E1;
  background: rgba(148, 163, 184, 0.16);
  border: 1px solid rgba(148, 163, 184, 0.24);
}

.zx-pill {
  display: inline-flex;
  align-items: center;
  gap: 4.5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 620;
  white-space: nowrap;
}
.zx-pill.indigo,
.zx-pill.blue {
  background: rgba(99, 102, 241, 0.20);
  color: #C7D2FE;
}
.zx-pill.sky,
.zx-pill.cyan,
.zx-pill.teal {
  background: rgba(14, 165, 233, 0.20);
  color: #BAE6FD;
}
.zx-pill.emerald,
.zx-pill.green {
  background: rgba(16, 185, 129, 0.20);
  color: #A7F3D0;
}
.zx-pill.amber,
.zx-pill.orange {
  background: rgba(245, 158, 11, 0.20);
  color: #FDE68A;
}
.zx-pill.violet,
.zx-pill.purple {
  background: rgba(168, 85, 247, 0.22);
  color: #E9D5FF;
}
.zx-pill.rose,
.zx-pill.red {
  background: rgba(244, 63, 94, 0.20);
  color: #FECDD3;
}
.zx-pill.neutral,
.zx-pill.gray {
  background: var(--zx-surface-subtle);
  color: var(--sg-fg-2);
  border: 1px solid var(--zx-border);
}

.zx-avatar-xs {
  width: 22px;
  height: 22px;
  border-radius: 99px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

/* Primary AntD Buttons across secondary workflows inherit Aurora gradient */
.ant-btn-primary:not(.ant-btn-dangerous) {
  background: var(--zx-cta-bg) !important;
  border: 0 !important;
  box-shadow: var(--zx-cta-shadow) !important;
}
.ant-btn-primary:not(.ant-btn-dangerous):hover {
  opacity: 0.94;
}

/* Cards across secondary pages inherit C-end smoked glass */
.sg-card,
.ant-card {
  background: var(--zx-surface-card) !important;
  border-color: var(--zx-border) !important;
  border-radius: 18px !important;
  box-shadow: var(--zx-card-shadow);
}

.sg-user-menu-identity {
  min-width: 178px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sg-user-menu-identity strong {
  overflow: hidden;
  color: var(--sg-fg);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-user-menu-identity small {
  overflow: hidden;
  color: var(--sg-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sg-user-dropdown .ant-dropdown-menu-item-disabled {
  cursor: default !important;
  opacity: 1;
}
.sg-space-dropdown .ant-dropdown-menu {
  min-width: 220px;
}
    `,
  };
});
