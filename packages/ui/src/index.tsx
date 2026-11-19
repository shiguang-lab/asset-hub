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
  --sg-loader-size: 54px;
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
  --sg-loader-size: 38px;
  --sg-loader-gap: 8px;
  --sg-loader-font: 12px;
}
.sg-brand-loading--lg {
  --sg-loader-size: 68px;
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
.sg-brand-loading__halo {
  transform-origin: 32px 32px;
  animation: sg-loader-halo 2.2s ease-in-out infinite;
}
.sg-brand-loading__gem {
  transform-origin: 32px 32px;
  animation: sg-loader-float 2.2s ease-in-out infinite;
  filter: drop-shadow(0 8px 18px rgba(168, 85, 247, 0.34));
}
.sg-brand-loading__tile {
  fill: #ffffff;
  fill-opacity: 0;
  stroke: #ffffff;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform-origin: 0 0;
  animation: sg-loader-tile 2.0s cubic-bezier(.45, 0, .25, 1) infinite;
}
.sg-brand-loading__tile--1 { animation-delay: 0s; }
.sg-brand-loading__tile--2 { animation-delay: .18s; }
.sg-brand-loading__tile--3 { animation-delay: .36s; }
.sg-brand-loading__spark {
  fill: none;
  stroke: #ffffff;
  stroke-width: 2.25;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform-origin: 0 0;
  animation: sg-loader-spark 2.0s cubic-bezier(.55, 0, .2, 1) infinite;
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
@keyframes sg-loader-halo {
  0%, 100% {
    opacity: .55;
    transform: scale(.92);
  }
  50% {
    opacity: .95;
    transform: scale(1.08);
  }
}
@keyframes sg-loader-float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-2px);
  }
}
@keyframes sg-loader-tile {
  0%, 100% {
    opacity: .72;
    fill-opacity: 0;
    transform: scale(.96);
  }
  30% {
    opacity: 1;
    fill-opacity: .3;
    transform: scale(1.06);
  }
  62% {
    opacity: .92;
    fill-opacity: .06;
    transform: scale(1);
  }
}
@keyframes sg-loader-spark {
  0%, 24% {
    opacity: .86;
    transform: rotate(0deg) scale(1);
  }
  54% {
    opacity: 1;
    transform: rotate(90deg) scale(1.14);
  }
  74%, 100% {
    opacity: .9;
    transform: rotate(90deg) scale(1);
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
  .sg-brand-loading__halo,
  .sg-brand-loading__gem,
  .sg-brand-loading__tile,
  .sg-brand-loading__spark,
  .sg-brand-loading__dots span {
    animation: none;
  }
  .sg-brand-loading__tile {
    opacity: 1;
    fill-opacity: .12;
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
  const gemGradId = `sg-loading-gem-${instanceId}`;
  const haloGradId = `sg-loading-halo-${instanceId}`;
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
        <svg className="sg-brand-loading__svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <defs>
            <radialGradient id={haloGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#A855F7" stopOpacity="0.46" />
              <stop offset="58%" stopColor="#38BDF8" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#060811" stopOpacity="0" />
            </radialGradient>
            <linearGradient
              id={gemGradId}
              x1="10"
              y1="10"
              x2="54"
              y2="54"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#FB7185" />
              <stop offset="0.52" stopColor="#A855F7" />
              <stop offset="1" stopColor="#6366F1" />
            </linearGradient>
          </defs>
          <circle
            className="sg-brand-loading__halo"
            cx="32"
            cy="32"
            r="28"
            fill={`url(#${haloGradId})`}
          />
          <g className="sg-brand-loading__gem">
            <rect x="10" y="10" width="44" height="44" rx="13.5" fill={`url(#${gemGradId})`} />
            <rect
              x="10.75"
              y="10.75"
              width="42.5"
              height="42.5"
              rx="12.75"
              stroke="#ffffff"
              strokeOpacity="0.32"
              strokeWidth="1.2"
            />
            <g transform="translate(18.5 18.5) scale(1.125)">
              <g transform="translate(6.75 6.75)">
                <rect
                  className="sg-brand-loading__tile sg-brand-loading__tile--1"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                />
              </g>
              <g transform="translate(17.25 6.75)">
                <rect
                  className="sg-brand-loading__tile sg-brand-loading__tile--2"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                />
              </g>
              <g transform="translate(6.75 17.25)">
                <rect
                  className="sg-brand-loading__tile sg-brand-loading__tile--3"
                  x="-3.75"
                  y="-3.75"
                  width="7.5"
                  height="7.5"
                  rx="2.2"
                />
              </g>
              <g transform="translate(17.25 17.25)">
                <path className="sg-brand-loading__spark" d="M-3.25 0h6.5M0 -3.25v6.5" />
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
