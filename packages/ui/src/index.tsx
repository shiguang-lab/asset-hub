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
  --sg-loader-size: 52px;
  display: flex;
  min-height: 160px;
  width: 100%;
  box-sizing: border-box;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #4e6df5;
  opacity: 0;
  animation: sg-loader-appear .18s ease-out .18s forwards;
}
.sg-brand-loading__stage {
  width: var(--sg-loader-size);
  height: calc(var(--sg-loader-size) * 1431 / 1600);
}
.sg-brand-loading__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.sg-brand-loading__reveal {
  fill: none;
  stroke: #fff;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
}
.sg-brand-loading__reveal--ring {
  stroke-width: 132;
  animation: sg-loader-draw-ring 2.6s cubic-bezier(.65, 0, .35, 1) infinite;
}
.sg-brand-loading__reveal--mark {
  stroke-width: 144;
  animation: sg-loader-draw-mark 2.6s cubic-bezier(.65, 0, .35, 1) infinite;
}
.sg-brand-loading__detail {
  fill: #fff;
  opacity: 0;
  animation: sg-loader-reveal-details 2.6s ease-in-out infinite;
}
.sg-brand-loading__art { filter: drop-shadow(0 5px 9px rgba(63, 97, 238, .2)); }
.sg-brand-loading__art--base { opacity: .14; filter: none; }
.sg-brand-loading__label {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
  text-shadow: 0 0 14px rgba(78, 109, 245, .15);
}
.sg-brand-loading__dots { display: inline-flex; gap: 3px; transform: translateY(3px); }
.sg-brand-loading__dots span {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: currentColor;
  animation: sg-loader-dot 1.1s ease-in-out infinite;
}
.sg-brand-loading__dots span:nth-child(2) { animation-delay: .16s; }
.sg-brand-loading__dots span:nth-child(3) { animation-delay: .32s; }
@keyframes sg-loader-appear { to { opacity: 1; } }
@keyframes sg-loader-draw-ring {
  0%, 5% { stroke-dashoffset: 1; }
  48%, 78% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -1; }
}
@keyframes sg-loader-draw-mark {
  0%, 10% { stroke-dashoffset: 1; }
  54%, 78% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -1; }
}
@keyframes sg-loader-reveal-details {
  0%, 46% { opacity: 0; }
  58%, 78% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes sg-loader-dot {
  0%, 100% { opacity: .35; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-4px); }
}
@media (prefers-reduced-motion: reduce) {
  .sg-brand-loading__reveal, .sg-brand-loading__detail, .sg-brand-loading__dots span {
    animation-duration: .01ms;
    animation-iteration-count: 1;
  }
  .sg-brand-loading__reveal { stroke-dashoffset: 0; }
  .sg-brand-loading__detail { opacity: 1; }
}
`;

function BrandLoading({
  minHeight,
  className,
}: {
  minHeight: CSSProperties["minHeight"];
  className?: string;
}) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { styles } = useBrandLoadingStyles({ minHeight });
  const maskId = `sg-loading-mask-${instanceId}`;
  return (
    <output
      className={cx("sg-brand-loading", styles.root, className)}
      aria-live="polite"
      aria-label="加载中"
    >
      <style data-sg-brand-loading="true">{BRAND_LOADING_STYLES}</style>
      <div className="sg-brand-loading__stage" aria-hidden="true">
        <svg
          className="sg-brand-loading__svg"
          viewBox="0 0 1600 1431"
          fill="none"
          aria-hidden="true"
        >
          <mask id={maskId} x="0" y="0" width="1600" height="1431" maskUnits="userSpaceOnUse">
            <path
              className="sg-brand-loading__reveal sg-brand-loading__reveal--ring"
              d="M728 176C416 192 170 438 166 744C162 1050 350 1265 674 1350"
              pathLength="1"
            />
            <path
              className="sg-brand-loading__reveal sg-brand-loading__reveal--mark"
              d="M670 432V540C670 650 580 723 320 765H1064C1172 765 1248 842 1248 949C1248 1054 1174 1111 1065 1111H833V1350"
              pathLength="1"
            />
            <rect className="sg-brand-loading__detail" width="1600" height="1431" />
          </mask>
          <image
            className="sg-brand-loading__art sg-brand-loading__art--base"
            href="/brand-mark.svg"
            width="1600"
            height="1431"
            preserveAspectRatio="xMidYMid meet"
          />
          <image
            className="sg-brand-loading__art"
            href="/brand-mark.svg"
            width="1600"
            height="1431"
            preserveAspectRatio="xMidYMid meet"
            mask={`url(#${maskId})`}
          />
        </svg>
      </div>
      <span className="sg-brand-loading__label">
        <span>加载中</span>
        <span className="sg-brand-loading__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </span>
    </output>
  );
}

export function Loading({
  loading = false,
  children,
  className,
  minHeight = 160,
}: {
  loading?: boolean;
  children?: ReactNode;
  className?: string;
  minHeight?: CSSProperties["minHeight"];
}) {
  if (!loading) return <>{children ?? null}</>;
  return <BrandLoading minHeight={minHeight} className={className} />;
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
