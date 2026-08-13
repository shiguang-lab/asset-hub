import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- theme ---------------- */

interface ThemeContextValue {
  theme: "light" | "dark";
  toggle: () => void;
}
const ThemeContext = createContext<ThemeContextValue>({ theme: "light", toggle: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("sg-theme");
    return stored === "dark" ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("sg-theme", theme);
  }, [theme]);
  const value = useMemo(
    () => ({ theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) }),
    [theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);

/* ---------------- toast ---------------- */

interface Toast {
  id: number;
  kind: "info" | "success" | "error" | "warning";
  message: string;
}
const ToastContext = createContext<(kind: Toast["kind"], message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="sg-toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={cx("sg-toast", t.kind)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = (): ((kind: Toast["kind"], message: string) => void) =>
  useContext(ToastContext);

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
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      className={cx("sg-btn", variant && `sg-btn-${variant}`, size && `sg-btn-${size}`, className)}
      style={style}
      onClick={onClick}
    >
      {children}
    </button>
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
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx("sg-btn sg-btn-ghost sg-btn-sm", danger && "sg-btn-danger")}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("sg-input", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx("sg-textarea", props.className)} />;
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
  style?: React.CSSProperties;
}) {
  return (
    <select
      className={cx("sg-select", className)}
      style={style}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cx("sg-card", onClick && "hoverable", className)}
      style={style}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  return <span className={cx("sg-badge", tone && `sg-badge-${tone}`)}>{children}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="sg-tag">{children}</span>;
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
    <div className="sg-tabs">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={cx("sg-tab", active === t.id && "active")}
          role="tab"
          tabIndex={0}
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(t.id);
            }
          }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflow: "auto" }}>
      <table className="sg-table">{children}</table>
    </div>
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="sg-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="sg-modal"
        style={wide ? { maxWidth: 820 } : undefined}
        role="dialog"
        aria-modal="true"
      >
        <div className="sg-modal-head">
          <strong>{title}</strong>
          <IconButton onClick={onClose} title="关闭">
            ✕
          </IconButton>
        </div>
        <div className="sg-modal-body">{children}</div>
        {footer && <div className="sg-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Dropdown({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  return (
    <div className="sg-dropdown" ref={ref}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        {trigger}
      </div>
      {open && <div className="sg-dropdown-menu">{children}</div>}
    </div>
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
  return (
    <div
      className={cx("sg-progress", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
    >
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
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
  return (
    <div className="sg-empty">
      <div style={{ fontSize: 34, marginBottom: 8 }}>🗂️</div>
      <strong>{title}</strong>
      {hint && (
        <p className="sg-subtle" style={{ margin: "4px 0 12px" }}>
          {hint}
        </p>
      )}
      {action}
    </div>
  );
}

export function Spinner({ size = 22 }: { size?: number }) {
  return (
    <span
      className="sg-center"
      style={{
        width: size,
        height: size,
        border: "2px solid var(--sg-border)",
        borderTopColor: "var(--sg-accent)",
        borderRadius: "50%",
        animation: "sg-spin 0.8s linear infinite",
        display: "inline-block",
      }}
    />
  );
}

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cx("sg-switch", checked && "on")}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Skeleton({
  width = "100%",
  height = 16,
}: {
  width?: number | string;
  height?: number;
}) {
  return <div className="sg-skeleton" style={{ width, height }} />;
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.slice(0, 1).toUpperCase();
  return (
    <span
      className="sg-center"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--sg-accent-soft)",
        color: "var(--sg-accent)",
        fontWeight: 700,
        fontSize: size * 0.42,
        display: "inline-flex",
      }}
    >
      {initials}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; tone: "accent" | "success" | "warning" | "danger" | undefined }
  > = {
    normal: { label: "正常", tone: "success" },
    ready: { label: "就绪", tone: "success" },
    completed: { label: "已完成", tone: "success" },
    running: { label: "运行中", tone: "accent" },
    queued: { label: "排队中", tone: "warning" },
    created: { label: "已创建", tone: undefined },
    planning: { label: "规划中", tone: "accent" },
    processing: { label: "处理中", tone: "accent" },
    pending: { label: "等待中", tone: "warning" },
    parsing: { label: "解析中", tone: "accent" },
    indexing: { label: "索引中", tone: "accent" },
    failed: { label: "失败", tone: "danger" },
    error: { label: "异常", tone: "danger" },
    partial_completed: { label: "部分完成", tone: "warning" },
    cancelled: { label: "已取消", tone: undefined },
    paused: { label: "已暂停", tone: "warning" },
    deleted: { label: "已删除", tone: "danger" },
    archived: { label: "已归档", tone: undefined },
    expired: { label: "已过期", tone: "warning" },
    revoked: { label: "已撤销", tone: "danger" },
    public: { label: "公开", tone: "success" },
    unlisted: { label: "未列出", tone: undefined },
    password: { label: "密码", tone: "warning" },
    private: { label: "私有", tone: undefined },
    link: { label: "链接", tone: "accent" },
  };
  const item = map[status] ?? { label: status, tone: undefined };
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
