import { Select } from "antd";
import { createStyles } from "antd-style";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";

const useStyles = createStyles(({ token }) => ({
  root: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "13px 4px 0",
    color: token.colorTextSecondary,
    fontSize: 12.5,
  },
  total: {
    color: token.colorTextSecondary,
    whiteSpace: "nowrap",
  },
  pages: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    margin: "0 auto",
  },
  button: {
    minWidth: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 7px",
    border: "1px solid transparent",
    borderRadius: 6,
    color: token.colorTextSecondary,
    background: "transparent",
    fontSize: 12.5,
    cursor: "pointer",
    transition: "color 140ms ease, background 140ms ease, border-color 140ms ease",
    "&:hover:not(:disabled)": {
      color: token.colorText,
      background: "#1a1820",
    },
    "&:disabled": {
      opacity: 0.35,
      cursor: "not-allowed",
    },
  },
  active: {
    color: "#fff",
    background: token.colorPrimary,
  },
  ellipsis: {
    padding: "0 3px",
    color: token.colorTextTertiary,
  },
  size: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: token.colorTextSecondary,
    whiteSpace: "nowrap",
  },
  sizeSelect: {
    width: 92,
  },
}));

export type AppPaginationProps = {
  total: number;
  current: number;
  pageSize: number;
  onChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  itemLabel?: string;
  className?: string;
};

/** Shared list pagination used by every paginated list in the web app. */
export function AppPagination({
  total,
  current,
  pageSize,
  onChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  itemLabel = "项",
  className,
}: AppPaginationProps) {
  const { styles, cx } = useStyles();
  const pageCount = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const pageButtons = useMemo(() => {
    const out: Array<number | "…"> = [];
    if (pageCount <= 7) {
      for (let value = 1; value <= pageCount; value += 1) out.push(value);
      return out;
    }
    out.push(1);
    const start = Math.max(2, current - 1);
    const end = Math.min(pageCount - 1, current + 1);
    if (start > 2) out.push("…");
    for (let value = start; value <= end; value += 1) out.push(value);
    if (end < pageCount - 1) out.push("…");
    out.push(pageCount);
    return out;
  }, [current, pageCount]);
  const sizeOptions = useMemo(
    () =>
      [...new Set([...pageSizeOptions, pageSize])]
        .sort((a, b) => a - b)
        .map((value) => ({ value: String(value), label: `${value} ${itemLabel}` })),
    [itemLabel, pageSize, pageSizeOptions],
  );

  return (
    <nav className={cx(styles.root, className)} aria-label="分页">
      <span className={styles.total}>
        共 {Math.max(0, total)} {itemLabel}
      </span>
      <div className={styles.pages}>
        <button
          type="button"
          className={styles.button}
          disabled={current <= 1}
          onClick={() => onChange(Math.max(1, current - 1))}
          aria-label="上一页"
        >
          <ChevronLeft size={15} />
        </button>
        {pageButtons.map((value, index) =>
          value === "…" ? (
            <span key={`ellipsis-${index}`} className={styles.ellipsis}>
              …
            </span>
          ) : (
            <button
              key={value}
              type="button"
              className={cx(styles.button, value === current && styles.active)}
              onClick={() => onChange(value)}
              aria-current={value === current ? "page" : undefined}
            >
              {value}
            </button>
          ),
        )}
        <button
          type="button"
          className={styles.button}
          disabled={current >= pageCount}
          onClick={() => onChange(Math.min(pageCount, current + 1))}
          aria-label="下一页"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      {onPageSizeChange ? (
        <span className={styles.size}>
          每页
          <Select
            value={String(pageSize)}
            onChange={(value) => onPageSizeChange(Number(value))}
            className={styles.sizeSelect}
            options={sizeOptions}
          />
        </span>
      ) : null}
    </nav>
  );
}

export default AppPagination;
