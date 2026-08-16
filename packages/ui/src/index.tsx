import type { InputProps as AntInputProps } from "antd";
import {
  Avatar as AntAvatar,
  Button as AntButton,
  Card as AntCard,
  Empty as AntEmpty,
  Input as AntInput,
  Modal as AntModal,
  Progress as AntProgress,
  Select as AntSelect,
  Skeleton as AntSkeleton,
  Switch as AntSwitch,
  Tabs as AntTabs,
  Tag as AntTag,
  App,
  theme as antdTheme,
  Spin,
} from "antd";
import { createStyles } from "antd-style";
import {
  type CSSProperties,
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

export { UiGlobalStyles } from "./global-styles.js";

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

export function Scrollbar({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { styles } = useScrollbarStyles();
  return (
    <div {...props} className={cx(styles.root, className)}>
      {children}
    </div>
  );
}

/* ---------------- theme ---------------- */

interface ThemeContextValue {
  theme: "light" | "dark";
  toggle: () => void;
}
const ThemeContext = createContext<ThemeContextValue>({ theme: "dark", toggle: () => undefined });

/** Kept for backward compatibility; the app now uses apps/web/src/theme/ThemeProvider. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const value = useMemo(
    () => ({ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }),
    [theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);

/* ---------------- toast ---------------- */

export type ToastKind = "info" | "success" | "error" | "warning";

/** No-op passthrough; toast rendering is handled by antd <App> + useToast(). */
export function ToastProvider({ children }: { children: ReactNode }) {
  return children;
}

export const useToast = (): ((kind: ToastKind, message: string) => void) => {
  const { message } = App.useApp();
  return (kind, text) => {
    message[kind](text);
  };
};

/* ---------------- primitives ---------------- */

export function Button({
  children,
  variant,
  size,
  className,
  onClick,
  disabled,
  type = "button",
  title,
  style,
}: {
  children: ReactNode;
  variant?: "primary" | "danger" | "ghost";
  size?: "sm" | "lg";
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  style?: CSSProperties;
}) {
  const antdType =
    variant === "primary" || variant === "danger"
      ? "primary"
      : variant === "ghost"
        ? "text"
        : "default";
  const antdSize = size === "sm" ? "small" : size === "lg" ? "large" : "middle";
  return (
    <AntButton
      type={antdType}
      danger={variant === "danger"}
      size={antdSize}
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={style}
      htmlType={type}
    >
      {children}
    </AntButton>
  );
}

export function IconButton({
  children,
  onClick,
  title,
  danger,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  danger?: boolean;
}) {
  return (
    <AntButton type="text" size="small" danger={danger} title={title} onClick={onClick}>
      {children}
    </AntButton>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { size: _size, ...rest } = props;
  return <AntInput {...(rest as AntInputProps)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <AntInput.TextArea {...props} />;
}

export function Select({
  value,
  onChange,
  options,
  className,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <AntSelect
      className={className}
      style={style}
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}

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

export function Card({
  children,
  className,
  onClick,
  style,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <AntCard className={className} style={style} onClick={onClick} hoverable={Boolean(onClick)}>
      {children}
    </AntCard>
  );
}

const TONE_COLOR: Record<string, string> = {
  accent: "purple",
  success: "green",
  warning: "orange",
  danger: "red",
};

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  return <AntTag color={tone ? TONE_COLOR[tone] : undefined}>{children}</AntTag>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <AntTag>{children}</AntTag>;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <AntTabs
      activeKey={active}
      onChange={onChange}
      items={tabs.map((t) => ({ key: t.id, label: t.label }))}
    />
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <Scrollbar>
      <table className="sg-table">{children}</table>
    </Scrollbar>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <AntModal
      open={open}
      onCancel={onClose}
      title={title}
      footer={footer ?? null}
      width={wide ? 820 : 520}
      destroyOnHidden
    >
      {children}
    </AntModal>
  );
}

export function Dropdown({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="sg-dropdown"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span>{trigger}</span>
      {open && <div className="sg-dropdown-menu">{children}</div>}
    </span>
  );
}

export function DropdownItem({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button type="button" className={cx("sg-dropdown-item", danger && "danger")} onClick={onClick}>
      {children}
    </button>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return <AntProgress className={className} percent={Math.max(0, Math.min(100, value))} />;
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
  return (
    <AntEmpty
      image={AntEmpty.PRESENTED_IMAGE_SIMPLE}
      description={
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>
          {hint && <div style={{ color: "var(--sg-muted)", fontSize: 13 }}>{hint}</div>}
        </div>
      }
    >
      {action}
    </AntEmpty>
  );
}

export function Spinner({ size = 22 }: { size?: number }) {
  return <Spin size={size <= 16 ? "small" : "default"} />;
}

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return <AntSwitch checked={checked} onChange={onChange} />;
}

export function Skeleton({
  width = "100%",
  height = 16,
}: {
  width?: number | string;
  height?: number;
}) {
  return <AntSkeleton.Button active size="small" style={{ width, height, borderRadius: 6 }} />;
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const { token } = antdTheme.useToken();
  return (
    <AntAvatar
      size={size}
      style={{ backgroundColor: token.colorPrimary, color: "#fff", fontWeight: 600 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </AntAvatar>
  );
}

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
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

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
