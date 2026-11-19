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
  --sg-loader-size: 72px;
  --sg-loader-gap: 12px;
  --sg-loader-font: 13px;
  display: flex;
  flex: 1 1 auto;
  min-height: 220px;
  width: 100%;
  box-sizing: border-box;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sg-loader-gap);
  padding: 24px 16px;
  color: var(--sg-fg-2, #b5bed2);
  opacity: 0;
  animation: sg-loader-appear .16s ease-out forwards;
}
.sg-brand-loading--sm {
  --sg-loader-size: 46px;
  --sg-loader-gap: 8px;
  --sg-loader-font: 12px;
}
.sg-brand-loading--lg {
  --sg-loader-size: 88px;
  --sg-loader-gap: 14px;
  --sg-loader-font: 14px;
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
  animation: sg-loader-aura 2.4s ease-in-out infinite;
}
.sg-brand-loading__ghost {
  fill: rgba(168, 85, 247, 0.05);
  stroke: rgba(192, 132, 252, 0.22);
  stroke-width: 1.35;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sg-brand-loading__ghost-plus {
  fill: none;
  stroke: rgba(56, 189, 248, 0.26);
  stroke-width: 1.45;
  stroke-linecap: round;
}
.sg-brand-loading__tile-motion {
  transform-origin: 0 0;
}
.sg-brand-loading__tile-motion--tl {
  animation: sg-loader-assemble-tl 2.4s cubic-bezier(.42, 0, .2, 1) infinite;
}
.sg-brand-loading__tile-motion--tr {
  animation: sg-loader-assemble-tr 2.4s cubic-bezier(.42, 0, .2, 1) .14s infinite;
}
.sg-brand-loading__tile-motion--bl {
  animation: sg-loader-assemble-bl 2.4s cubic-bezier(.42, 0, .2, 1) .28s infinite;
}
.sg-brand-loading__tile-fill {
  stroke: none;
  opacity: 0;
  animation: sg-loader-tile-fill 2.4s ease-in-out infinite;
}
.sg-brand-loading__tile-fill--tr { animation-delay: .14s; }
.sg-brand-loading__tile-fill--bl { animation-delay: .28s; }
.sg-brand-loading__tile-stroke {
  fill: none;
  stroke-width: 2.05;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: sg-loader-tile-draw 2.4s cubic-bezier(.62, .05, .28, .98) infinite;
}
.sg-brand-loading__tile-stroke--tr { animation-delay: .14s; }
.sg-brand-loading__tile-stroke--bl { animation-delay: .28s; }
.sg-brand-loading__spark-ripple {
  fill: none;
  stroke-width: 1.1;
  transform-origin: 0 0;
  opacity: 0;
  animation: sg-loader-ripple 2.4s cubic-bezier(.16, 1, .3, 1) infinite;
}
.sg-brand-loading__spark-group {
  transform-origin: 0 0;
  animation: sg-loader-spark-spin 2.4s cubic-bezier(.5, 0, .18, 1) infinite;
}
.sg-brand-loading__spark-arm {
  fill: none;
  stroke-width: 2.15;
  stroke-linecap: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: sg-loader-spark-draw 2.4s cubic-bezier(.5, 0, .2, 1) infinite;
}
.sg-brand-loading__spark-arm--v {
  animation-delay: .08s;
}
.sg-brand-loading__spark-core {
  transform-origin: 0 0;
  opacity: 0;
  animation: sg-loader-spark-core 2.4s ease-in-out infinite;
}
.sg-brand-loading__label {
  display: inline-flex;
  min-height: 20px;
  align-items: center;
  gap: 5px;
  font-size: var(--sg-loader-font);
  font-weight: 560;
  letter-spacing: 0.02em;
  line-height: 1.4;
  white-space: nowrap;
  color: var(--sg-fg-2, #b5bed2);
}
.sg-brand-loading__dots {
  display: inline-flex;
  align-items: center;
  gap: 3.5px;
  transform: translateY(1px);
}
.sg-brand-loading__dots span {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  animation: sg-loader-dot 1.2s ease-in-out infinite;
}
.sg-brand-loading__dots span:nth-child(1) {
  background: #fb7185;
  animation-delay: 0s;
}
.sg-brand-loading__dots span:nth-child(2) {
  background: #c084fc;
  animation-delay: .16s;
}
.sg-brand-loading__dots span:nth-child(3) {
  background: #38bdf8;
  animation-delay: .32s;
}
@keyframes sg-loader-appear {
  to { opacity: 1; }
}
@keyframes sg-loader-aura {
  0%, 100% {
    opacity: .42;
    transform: scale(.88);
  }
  50% {
    opacity: .95;
    transform: scale(1.12);
  }
}
@keyframes sg-loader-assemble-tl {
  0%, 5% {
    transform: translate(-1.8px, -1.8px) scale(.76);
  }
  34% {
    transform: translate(0, 0) scale(1.06);
  }
  44%, 66% {
    transform: translate(0, 0) scale(1);
  }
  92%, 100% {
    transform: translate(-1.6px, -1.6px) scale(.8);
  }
}
@keyframes sg-loader-assemble-tr {
  0%, 5% {
    transform: translate(1.8px, -1.8px) scale(.76);
  }
  34% {
    transform: translate(0, 0) scale(1.06);
  }
  44%, 66% {
    transform: translate(0, 0) scale(1);
  }
  92%, 100% {
    transform: translate(1.6px, -1.6px) scale(.8);
  }
}
@keyframes sg-loader-assemble-bl {
  0%, 5% {
    transform: translate(-1.8px, 1.8px) scale(.76);
  }
  34% {
    transform: translate(0, 0) scale(1.06);
  }
  44%, 66% {
    transform: translate(0, 0) scale(1);
  }
  92%, 100% {
    transform: translate(-1.6px, 1.6px) scale(.8);
  }
}
@keyframes sg-loader-tile-draw {
  0% {
    stroke-dashoffset: 1;
    opacity: .42;
  }
  28%, 64% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  92%, 100% {
    stroke-dashoffset: -1;
    opacity: .35;
  }
}
@keyframes sg-loader-tile-fill {
  0%, 20% {
    opacity: 0;
  }
  42%, 62% {
    opacity: .34;
  }
  82%, 100% {
    opacity: 0;
  }
}
@keyframes sg-loader-spark-draw {
  0%, 16% {
    stroke-dashoffset: 1;
    opacity: 0;
  }
  36%, 68% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  90%, 100% {
    stroke-dashoffset: -1;
    opacity: 0;
  }
}
@keyframes sg-loader-spark-spin {
  0%, 34% {
    transform: rotate(0deg) scale(.86);
  }
  54% {
    transform: rotate(90deg) scale(1.16);
  }
  68%, 100% {
    transform: rotate(90deg) scale(1);
  }
}
@keyframes sg-loader-spark-core {
  0%, 34% {
    opacity: 0;
    transform: scale(.35);
  }
  50% {
    opacity: .95;
    transform: scale(1.2);
  }
  70%, 100% {
    opacity: 0;
    transform: scale(.35);
  }
}
@keyframes sg-loader-ripple {
  0%, 36% {
    opacity: 0;
    transform: scale(.35);
  }
  48% {
    opacity: .76;
    transform: scale(.7);
  }
  76%, 100% {
    opacity: 0;
    transform: scale(1.6);
  }
}
@keyframes sg-loader-dot {
  0%, 100% {
    opacity: .35;
    transform: translateY(0) scale(.9);
  }
  50% {
    opacity: 1;
    transform: translateY(-2.5px) scale(1.1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sg-brand-loading__aura,
  .sg-brand-loading__tile-motion,
  .sg-brand-loading__tile-fill,
  .sg-brand-loading__tile-stroke,
  .sg-brand-loading__spark-ripple,
  .sg-brand-loading__spark-group,
  .sg-brand-loading__spark-arm,
  .sg-brand-loading__spark-core,
  .sg-brand-loading__dots span {
    animation: none;
  }
  .sg-brand-loading__tile-stroke,
  .sg-brand-loading__spark-arm {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  .sg-brand-loading__tile-fill {
    opacity: .24;
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
  const sparkGradId = `sg-loading-spark-${instanceId}`;
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
        <svg className="sg-brand-loading__svg" viewBox="-4 -4 32 32" fill="none" aria-hidden="true">
          <defs>
            <radialGradient id={auraId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#A855F7" stopOpacity="0.34" />
              <stop offset="55%" stopColor="#38BDF8" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#060811" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={tlGradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="100%" stopColor="#C084FC" />
            </linearGradient>
            <linearGradient id={trGradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#C084FC" />
              <stop offset="100%" stopColor="#818CF8" />
            </linearGradient>
            <linearGradient id={blGradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#A855F7" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
            <linearGradient
              id={sparkGradId}
              x1="-4"
              y1="-4"
              x2="4"
              y2="4"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="50%" stopColor="#FFFFFF" />
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
            r="15"
            fill={`url(#${auraId})`}
          />

          {/* Ghost Logo Blueprint keeping 2x2 structure anchored between assembly cycles */}
          <g>
            <rect
              className="sg-brand-loading__ghost"
              x="3"
              y="3"
              width="7.5"
              height="7.5"
              rx="2.2"
            />
            <rect
              className="sg-brand-loading__ghost"
              x="13.5"
              y="3"
              width="7.5"
              height="7.5"
              rx="2.2"
            />
            <rect
              className="sg-brand-loading__ghost"
              x="3"
              y="13.5"
              width="7.5"
              height="7.5"
              rx="2.2"
            />
            <path className="sg-brand-loading__ghost-plus" d="M14 17.25h6.5M17.25 14v6.5" />
          </g>

          <g filter={`url(#${glowFilterId})`}>
            {/* Top-left modular tile */}
            <g transform="translate(6.75 6.75)">
              <g className="sg-brand-loading__tile-motion sg-brand-loading__tile-motion--tl">
                <rect
                  className="sg-brand-loading__tile-fill"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                  fill={`url(#${tlGradId})`}
                />
                <rect
                  className="sg-brand-loading__tile-stroke"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                  pathLength="1"
                  stroke={`url(#${tlGradId})`}
                />
              </g>
            </g>

            {/* Top-right modular tile */}
            <g transform="translate(17.25 6.75)">
              <g className="sg-brand-loading__tile-motion sg-brand-loading__tile-motion--tr">
                <rect
                  className="sg-brand-loading__tile-fill sg-brand-loading__tile-fill--tr"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                  fill={`url(#${trGradId})`}
                />
                <rect
                  className="sg-brand-loading__tile-stroke sg-brand-loading__tile-stroke--tr"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                  pathLength="1"
                  stroke={`url(#${trGradId})`}
                />
              </g>
            </g>

            {/* Bottom-left modular tile */}
            <g transform="translate(6.75 17.25)">
              <g className="sg-brand-loading__tile-motion sg-brand-loading__tile-motion--bl">
                <rect
                  className="sg-brand-loading__tile-fill sg-brand-loading__tile-fill--bl"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                  fill={`url(#${blGradId})`}
                />
                <rect
                  className="sg-brand-loading__tile-stroke sg-brand-loading__tile-stroke--bl"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                  pathLength="1"
                  stroke={`url(#${blGradId})`}
                />
              </g>
            </g>

            {/* Bottom-right '+' creation spark */}
            <g transform="translate(17.25 17.25)">
              <circle
                className="sg-brand-loading__spark-ripple"
                cx="0"
                cy="0"
                r="4.2"
                stroke="#38BDF8"
              />
              <circle
                className="sg-brand-loading__spark-core"
                cx="0"
                cy="0"
                r="1.35"
                fill="#FFFFFF"
              />
              <g className="sg-brand-loading__spark-group">
                <path
                  className="sg-brand-loading__spark-arm"
                  d="M-3.35 0h6.7"
                  pathLength="1"
                  stroke={`url(#${sparkGradId})`}
                />
                <path
                  className="sg-brand-loading__spark-arm sg-brand-loading__spark-arm--v"
                  d="M0 -3.35v6.7"
                  pathLength="1"
                  stroke={`url(#${sparkGradId})`}
                />
              </g>
            </g>
          </g>
        </svg>
      </div>
      {label ? (
        <span className="sg-brand-loading__label">
          <span>{label}</span>
          <span className="sg-brand-loading__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
      ) : null}
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
