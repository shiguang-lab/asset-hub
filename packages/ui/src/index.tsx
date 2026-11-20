import { Avatar as AntAvatar, Empty as AntEmpty, Tag as AntTag, App } from "antd";
import { createStyles } from "antd-style";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export { UiGlobalStyles, UiStylesBoundary } from "./global-styles.js";
export { MARKDOWN_SURFACE_STYLES, MarkdownSurfaceStyles } from "./markdown-surface.js";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const useScrollbarStyles = createStyles(({ token }) => ({
  root: {
    overflow: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: `${token.colorBorder} transparent`,
    "&::-webkit-scrollbar": {
      width: 8,
      height: 8,
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent",
    },
    "&::-webkit-scrollbar-thumb": {
      minHeight: 32,
      border: "2px solid transparent",
      borderRadius: 999,
      backgroundClip: "padding-box",
      backgroundColor: token.colorBorder,
    },
    "&::-webkit-scrollbar-thumb:hover": {
      backgroundColor: token.colorTextTertiary,
    },
  },
}));

const useBrandLoadingStyles = createStyles(
  (_utils, props: { minHeight: CSSProperties["minHeight"] }) => ({
    root: {
      minHeight: props.minHeight,
    },
  }),
);

const useEmptyStyles = createStyles(() => ({
  title: {
    fontWeight: 600,
    marginBottom: 2,
  },
  hint: {
    color: "var(--sg-muted)",
    fontSize: 13,
  },
}));

const useAvatarStyles = createStyles(({ token }) => ({
  root: {
    backgroundColor: token.colorPrimary,
    color: "#fff",
    fontWeight: 600,
  },
}));

type ScrollbarProps = HTMLAttributes<HTMLElement> & {
  as?: "aside" | "div" | "nav" | "pre" | "section";
};

export function Scrollbar({
  as: Component = "div",
  children,
  className,
  ...props
}: ScrollbarProps) {
  const { styles } = useScrollbarStyles();
  return (
    <Component {...props} className={cx(styles.root, className)}>
      {children}
    </Component>
  );
}

const BRAND_LOADING_STYLES = `
.sg-brand-loading {
  --sg-loader-size: 64px;
  display: flex;
  flex: 1 1 auto;
  min-height: 220px;
  width: 100%;
  box-sizing: border-box;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  opacity: 0;
  animation: sg-loader-appear .14s ease-out forwards;
}
.sg-brand-loading--sm {
  --sg-loader-size: 42px;
}
.sg-brand-loading--lg {
  --sg-loader-size: 82px;
}
.sg-brand-loading__stage {
  position: relative;
  width: var(--sg-loader-size);
  height: var(--sg-loader-size);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sg-brand-loading__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.sg-brand-loading__aura {
  transform-origin: 12px 12px;
  animation: sg-loader-aura 1.5s ease-in-out infinite;
}
.sg-brand-loading__slot-shadow {
  transform-origin: 17.25px 11.2px;
  animation: sg-loader-slot-shadow 1.5s cubic-bezier(.35, 0, .25, 1) infinite;
}
.sg-brand-loading__tile-base {
  stroke-width: 2.15;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sg-brand-loading__plus-base {
  fill: none;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform-origin: 17.25px 17.25px;
  animation: sg-loader-plus-nudge 1.5s ease-in-out infinite;
}
.sg-brand-loading__hopper {
  transform-origin: 0 3.75px;
  animation: sg-loader-cheeky-hop 1.5s cubic-bezier(.34, .06, .22, 1) infinite;
}
@keyframes sg-loader-appear {
  to { opacity: 1; }
}
@keyframes sg-loader-aura {
  0%, 100% {
    opacity: .55;
    transform: scale(.94);
  }
  35% {
    opacity: .9;
    transform: scale(1.06);
  }
}
@keyframes sg-loader-slot-shadow {
  0%, 10% {
    opacity: .55;
    transform: scaleX(1.12);
  }
  36% {
    opacity: .14;
    transform: scaleX(.55);
  }
  58% {
    opacity: .62;
    transform: scaleX(1.18);
  }
  70% {
    opacity: .3;
    transform: scaleX(.82);
  }
  82%, 100% {
    opacity: .42;
    transform: scaleX(1);
  }
}
@keyframes sg-loader-cheeky-hop {
  0% {
    transform: translate(0px, 0px) rotate(0deg) scale(1, 1);
  }
  10% {
    transform: translate(0px, 0.85px) rotate(-3deg) scale(1.12, 0.84);
  }
  32% {
    transform: translate(0.9px, -5.2px) rotate(14deg) scale(0.94, 1.08);
  }
  44% {
    transform: translate(0.5px, -5.6px) rotate(-11deg) scale(1.03, 1.02);
  }
  58% {
    transform: translate(0px, 0.75px) rotate(2deg) scale(1.14, 0.84);
  }
  70% {
    transform: translate(-0.2px, -1.9px) rotate(-5deg) scale(0.97, 1.04);
  }
  82%, 100% {
    transform: translate(0px, 0px) rotate(0deg) scale(1, 1);
  }
}
@keyframes sg-loader-plus-nudge {
  0%, 52%, 100% {
    transform: translateY(0px) scale(1);
  }
  60% {
    transform: translateY(0.5px) scale(0.96, 1.03);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sg-brand-loading__aura,
  .sg-brand-loading__slot-shadow,
  .sg-brand-loading__plus-base,
  .sg-brand-loading__hopper {
    animation: none;
  }
}
`;

function BrandLoading({
  minHeight,
  size = "md",
  label = "加载中",
  className,
}: {
  minHeight: CSSProperties["minHeight"];
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { styles } = useBrandLoadingStyles({ minHeight });
  const auraId = `sg-loading-aura-${instanceId}`;
  const tlGradId = `sg-loading-tl-${instanceId}`;
  const trGradId = `sg-loading-tr-${instanceId}`;
  const blGradId = `sg-loading-bl-${instanceId}`;
  const plusGradId = `sg-loading-plus-${instanceId}`;
  const glowFilterId = `sg-loading-glow-${instanceId}`;
  return (
    <output
      className={cx(
        "sg-brand-loading",
        size !== "md" && `sg-brand-loading--${size}`,
        styles.root,
        className,
      )}
      aria-live="polite"
      aria-label={label}
    >
      <style data-sg-brand-loading="true">{BRAND_LOADING_STYLES}</style>
      <div className="sg-brand-loading__stage" aria-hidden="true">
        <svg className="sg-brand-loading__svg" viewBox="-4 -8 32 34" fill="none" aria-hidden="true">
          <defs>
            <radialGradient id={auraId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#A855F7" stopOpacity="0.34" />
              <stop offset="55%" stopColor="#38BDF8" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#060811" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={tlGradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#C084FC" />
              <stop offset="100%" stopColor="#818CF8" />
            </linearGradient>
            <linearGradient id={trGradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="55%" stopColor="#E879F9" />
              <stop offset="100%" stopColor="#C084FC" />
            </linearGradient>
            <linearGradient id={blGradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#818CF8" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
            <linearGradient
              id={plusGradId}
              x1="14"
              y1="14"
              x2="20.5"
              y2="20.5"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#E2E8F0" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
            <filter id={glowFilterId} x="-35%" y="-35%" width="170%" height="170%">
              <feGaussianBlur stdDeviation="0.85" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            className="sg-brand-loading__aura"
            cx="12"
            cy="12"
            r="14.5"
            fill={`url(#${auraId})`}
          />

          <g filter={`url(#${glowFilterId})`}>
            {/* Top-left grounded module */}
            <rect
              className="sg-brand-loading__tile-base"
              x="3"
              y="3"
              width="7.5"
              height="7.5"
              rx="2.2"
              fill={`url(#${tlGradId})`}
              fillOpacity="0.16"
              stroke={`url(#${tlGradId})`}
            />

            {/* Bottom-left grounded module */}
            <rect
              className="sg-brand-loading__tile-base"
              x="3"
              y="13.5"
              width="7.5"
              height="7.5"
              rx="2.2"
              fill={`url(#${blGradId})`}
              fillOpacity="0.16"
              stroke={`url(#${blGradId})`}
            />

            {/* Bottom-right '+' mark */}
            <path
              className="sg-brand-loading__plus-base"
              d="M14 17.25h6.5M17.25 14v6.5"
              stroke={`url(#${plusGradId})`}
            />

            {/* Soft landing shadow beneath the hopping top-right block */}
            <ellipse
              className="sg-brand-loading__slot-shadow"
              cx="17.25"
              cy="11.2"
              rx="3.3"
              ry="0.7"
              fill="#C084FC"
            />

            {/* Top-right playful hopping block */}
            <g transform="translate(17.25 6.75)">
              <g className="sg-brand-loading__hopper">
                <rect
                  className="sg-brand-loading__tile-base"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                  fill={`url(#${trGradId})`}
                  fillOpacity="0.34"
                  stroke={`url(#${trGradId})`}
                />
              </g>
            </g>
          </g>
        </svg>
      </div>
    </output>
  );
}

export function Loading({
  loading = false,
  children,
  className,
  minHeight = 220,
  size = "md",
  label = "加载中",
}: {
  loading?: boolean;
  children?: ReactNode;
  className?: string;
  minHeight?: CSSProperties["minHeight"];
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  if (!loading) return <>{children ?? null}</>;
  return <BrandLoading minHeight={minHeight} size={size} label={label} className={className} />;
}

/* ---------------- toast ---------------- */

export type ToastKind = "info" | "success" | "error" | "warning";

/** Toast rendering is handled by antd <App> + useToast(). */
export const useToast = (): ((kind: ToastKind, message: string) => void) => {
  const { message } = App.useApp();
  return (kind, text) => {
    message[kind](text);
  };
};

/* ---------------- primitives ---------------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="sg-field">
      <label className="sg-label">{label}</label>
      {children}
      {hint && <div className="sg-hint">{hint}</div>}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <Scrollbar>
      <table className="sg-table">{children}</table>
    </Scrollbar>
  );
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  const { styles } = useEmptyStyles();
  return (
    <AntEmpty
      image={AntEmpty.PRESENTED_IMAGE_SIMPLE}
      description={
        <div>
          <div className={styles.title}>{title}</div>
          {hint && <div className={styles.hint}>{hint}</div>}
        </div>
      }
    >
      {action}
    </AntEmpty>
  );
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const { styles } = useAvatarStyles();
  return (
    <AntAvatar size={size} className={styles.root}>
      {name.slice(0, 1).toUpperCase()}
    </AntAvatar>
  );
}

const TONE_COLOR: Record<string, string> = {
  accent: "purple",
  success: "green",
  warning: "orange",
  danger: "red",
};

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone?: "accent" | "success" | "warning" | "danger" }> =
    {
      normal: { label: "正常", tone: "success" },
      ready: { label: "就绪", tone: "success" },
      completed: { label: "已完成", tone: "success" },
      running: { label: "运行中", tone: "accent" },
      queued: { label: "排队中", tone: "warning" },
      created: { label: "已创建" },
      planning: { label: "规划中", tone: "accent" },
      processing: { label: "处理中", tone: "accent" },
      pending: { label: "等待中", tone: "warning" },
      parsing: { label: "解析中", tone: "accent" },
      indexing: { label: "索引中", tone: "accent" },
      failed: { label: "失败", tone: "danger" },
      error: { label: "异常", tone: "danger" },
      partial_completed: { label: "部分完成", tone: "warning" },
      cancelled: { label: "已取消" },
      paused: { label: "已暂停", tone: "warning" },
      deleted: { label: "已删除", tone: "danger" },
      archived: { label: "已归档" },
      expired: { label: "已过期", tone: "warning" },
      revoked: { label: "已撤销", tone: "danger" },
      public: { label: "公开", tone: "success" },
      unlisted: { label: "未列出" },
      password: { label: "密码", tone: "warning" },
      private: { label: "私有" },
      link: { label: "链接", tone: "accent" },
    };
  const item = map[status] ?? { label: status };
  return <AntTag color={item.tone ? TONE_COLOR[item.tone] : undefined}>{item.label}</AntTag>;
}

/* ---------------- utils ---------------- */

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
