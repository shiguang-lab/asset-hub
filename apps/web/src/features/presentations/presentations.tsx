import {
  duplicateElements as astDuplicateElements,
  duplicatePage as astDuplicatePage,
  insertPage as astInsertPage,
  movePage as astMovePage,
  removeElement as astRemoveElement,
  removePage as astRemovePage,
  setTheme as astSetTheme,
  ensurePresentationRuntimeHtml,
  listEditableElements,
  listPages,
  parsePresentationHtml,
  SG_STATICIZE_CSS,
  serializePresentationHtml,
  setDataAttribute,
  THEME_PRESETS,
  updateImageSrc,
  updateLinkHref,
  updateTextContent,
} from "@shiguang/content";
import { Empty, Loading, Scrollbar, useToast } from "@shiguang/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Collapse,
  ColorPicker,
  Dropdown,
  Input,
  Modal,
  Segmented,
  Select,
} from "antd";
import { createStyles } from "antd-style";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  Grid2X2,
  Import,
  LayoutList,
  List,
  Maximize2,
  Play,
  Plus,
  Search,
  Share2,
  Sparkles,
  Star,
  ThumbsUp,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getAuthSession } from "../../auth/session.js";
import { type Asset, api, type Publish, type PublishStatsSummary } from "../../entities/api.js";
import { AppPagination } from "../../shared/AppPagination.js";
import { AppTable } from "../../shared/AppTable.js";
import { AppTabs } from "../../shared/AppTabs.js";
import { OwnerAvatar } from "../../shared/OwnerAvatar.js";
import { isOwnedBySession, ownerDisplayName } from "../../shared/owner.js";
import { useShellBreadcrumb } from "../../shell/layout.js";
import { PublishDialog } from "../publishing/publish-dialog.js";

/** 命令历史：所有人工/AI 编辑都经过 set，支持 Undo/Redo（对应设计文档 Editor Command 与 Undo/Redo）。
 * 支持 mergeKey：相同 mergeKey 的连续编辑在时间窗内合并为一步，避免拖拽/连续调参产生海量历史帧（元素级细分）。 */
function useHistory<T>(initial: T) {
  const [history, setHistory] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const lastMergeRef = useRef<{ key: string; time: number } | null>(null);
  const MERGE_WINDOW = 600;
  const set = useCallback((updater: T | ((prev: T) => T), mergeKey?: string) => {
    setHistory((h) => {
      const present = typeof updater === "function" ? (updater as (p: T) => T)(h.present) : updater;
      const now = Date.now();
      const canMerge =
        !!mergeKey &&
        lastMergeRef.current?.key === mergeKey &&
        now - lastMergeRef.current.time < MERGE_WINDOW;
      lastMergeRef.current = { key: mergeKey ?? "", time: now };
      if (canMerge) {
        // 复用上一帧的 past（即合并到同一步），仅更新 present
        return { past: h.past, present, future: [] };
      }
      return { past: [...h.past, h.present], present, future: [] };
    });
  }, []);
  const reset = useCallback((value: T) => {
    setHistory({ past: [], present: value, future: [] });
  }, []);
  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
    });
  }, []);
  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
    });
  }, []);
  return {
    present: history.present,
    set,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

type EditableElementKind = "text" | "image" | "link" | "chart" | string;

const KIND_LABEL: Record<string, string> = {
  text: "文本",
  image: "图片",
  link: "链接",
  chart: "图表",
  table: "表格",
  counter: "数字",
  "code-island": "代码",
};

/** 安全解析 data-sg-chart JSON；失败返回 null，不抛出。 */
function safeParseChart(
  raw?: string,
): { type?: string; labels?: string[]; data?: number[] } | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      return {
        type: typeof obj.type === "string" ? obj.type : "bar",
        labels: Array.isArray(obj.labels) ? obj.labels.map(String) : [],
        data: Array.isArray(obj.data) ? obj.data.map((n: unknown) => Number(n) || 0) : [],
      };
    }
  } catch {
    /* 忽略非法 JSON */
  }
  return null;
}

/** 把图表配置序列化为 data-sg-chart 用的紧凑 JSON 字符串。 */
function chartToJson(cfg: { type?: string; labels?: string[]; data?: number[] }): string {
  return JSON.stringify({
    type: cfg.type ?? "bar",
    labels: cfg.labels ?? [],
    data: cfg.data ?? [],
  });
}

/** 把“一月，二月”这类字符串拆成标签数组（支持中英文逗号）。 */
function splitLabels(raw: string): string[] {
  return raw
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 把“12，30，25”拆成数值数组。 */
function splitNumbers(raw: string): number[] {
  return raw
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s) || 0);
}

const HOVER_OPTIONS = [
  { value: "none", label: "无 Hover" },
  { value: "lift", label: "上浮" },
  { value: "glow", label: "发光" },
  { value: "scale", label: "缩放" },
  { value: "border", label: "描边" },
];

/** 文本颜色色板（语义色，贴合主题 CSS 变量对应值）。 */
const TEXT_COLOR_SWATCHES = [
  { value: "var(--sg-text-primary)", label: "正文" },
  { value: "var(--sg-text-secondary)", label: "次要" },
  { value: "var(--sg-primary)", label: "主题色" },
  { value: "#e5484d", label: "红" },
  { value: "#f76808", label: "橙" },
  { value: "#46a758", label: "绿" },
  { value: "#0091ff", label: "蓝" },
  { value: "#8e4ec6", label: "紫" },
];

const ALIGN_OPTIONS = [
  { value: "left", label: "左对齐" },
  { value: "center", label: "居中" },
  { value: "right", label: "右对齐" },
];

const SIZE_OPTIONS = [
  { value: "sm", label: "小" },
  { value: "md", label: "中" },
  { value: "lg", label: "大" },
  { value: "xl", label: "特大" },
];

const WEIGHT_OPTIONS = [
  { value: "normal", label: "常规" },
  { value: "bold", label: "加粗" },
];

const FONT_STYLE_OPTIONS = [
  { value: "normal", label: "正体" },
  { value: "italic", label: "斜体" },
];

const RADIUS_OPTIONS = [
  { value: "none", label: "直角" },
  { value: "sm", label: "小圆角" },
  { value: "md", label: "中圆角" },
  { value: "lg", label: "大圆角" },
  { value: "full", label: "圆形" },
];

const FIT_OPTIONS = [
  { value: "cover", label: "裁切填满（cover）" },
  { value: "contain", label: "完整显示（contain）" },
  { value: "fill", label: "拉伸（fill）" },
];

const FILTER_OPTIONS = [
  { value: "none", label: "原图" },
  { value: "grayscale", label: "黑白" },
  { value: "sepia", label: "复古" },
  { value: "warm", label: "暖色" },
  { value: "cool", label: "冷色" },
  { value: "blur", label: "虚化" },
  { value: "brightness", label: "增亮" },
  { value: "contrast", label: "高对比" },
];

/** AI 生成元素：可选类型与中文标签（传给后端的 insert scope 指令）。 */
const AI_INSERT_KINDS = [
  { value: "text", label: "段落文本" },
  { value: "heading", label: "小标题" },
  { value: "card", label: "卡片" },
  { value: "chart", label: "图表" },
  { value: "list", label: "要点列表" },
  { value: "quote", label: "引用" },
  { value: "metric", label: "指标数字" },
];
const AI_INSERT_KIND_LABEL: Record<string, string> = Object.fromEntries(
  AI_INSERT_KINDS.map((k) => [k.value, k.label]),
);

/** 比较两个配色是否一致（用于色板高亮）。 */
function isSamePalette(
  a: {
    background: string;
    textPrimary: string;
    textSecondary: string;
    surface: string;
    primary: string;
  } | null,
  b: {
    background: string;
    textPrimary: string;
    textSecondary: string;
    surface: string;
    primary: string;
  },
): boolean {
  if (!a) return false;
  return (
    a.background === b.background &&
    a.textPrimary === b.textPrimary &&
    a.textSecondary === b.textSecondary &&
    a.surface === b.surface &&
    a.primary === b.primary
  );
}

const useColorSwatchStyles = createStyles((_utils, props: { color: string }) => ({
  swatch: {
    background: props.color,
  },
}));

function ColorSwatchButton({
  color,
  label,
  active,
  onClick,
}: {
  color: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const { styles } = useColorSwatchStyles({ color });
  return (
    <button
      type="button"
      title={label}
      className={`sg-el-swatch ${active ? "active" : ""} ${styles.swatch}`}
      onClick={onClick}
    />
  );
}

function PaletteColorSwatch({ color }: { color: string }) {
  const { styles } = useColorSwatchStyles({ color });
  return <span className={styles.swatch} />;
}

const useElementInspectorStyles = createStyles(() => ({
  linkText: {
    minHeight: 44,
  },
  chartRaw: {
    minHeight: 84,
    fontFamily: "monospace",
    fontSize: 12,
  },
  codeSource: {
    minHeight: 96,
    fontFamily: "monospace",
    fontSize: 12,
  },
  textSource: {
    minHeight: 72,
  },
  collapse: {
    marginLeft: -10,
  },
}));

const usePresentationEditorStyles = createStyles(() => ({
  paletteField: {
    marginTop: 12,
  },
  aiBody: {
    gap: 12,
  },
  aiInstruction: {
    minHeight: 70,
  },
  aiProposal: {
    gap: 6,
  },
  aiProposalTitle: {
    fontSize: 12,
  },
  aiProposalCode: {
    fontSize: 12,
    maxHeight: 240,
    whiteSpace: "pre-wrap",
    background: "var(--sg-surface)",
    padding: 12,
    borderRadius: 8,
  },
  aiInsertInstruction: {
    minHeight: 72,
  },
}));

const usePlayerStyles = createStyles(() => ({
  root: {
    position: "fixed",
    inset: 0,
    zIndex: 400,
    background: "#08090d",
    color: "#f4f5f7",
    overflow: "hidden",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  frameArea: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#08090d",
  },
  frameLoading: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    pointerEvents: "none",
  },
  frame: {
    width: "100%",
    height: "100%",
    border: "none",
    display: "block",
    background: "#0a0c0f",
  },
  progressBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 404,
    height: 4,
    background: "rgba(255,255,255,0.16)",
    cursor: "pointer",
    outline: "none",
  },
  progressBarFill: {
    display: "block",
    height: "100%",
    background: "#7cf08a",
    transition: "width 180ms ease",
  },
  dock: {
    position: "absolute",
    right: 16,
    bottom: 18,
    zIndex: 401,
  },
  dockActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pagerButton: {
    display: "inline-flex",
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(190,220,208,0.22)",
    borderRadius: 0,
    color: "rgba(232,244,238,0.86)",
    background: "rgba(9,16,14,0.86)",
    cursor: "pointer",
  },
  pagerButtonDisabled: {
    opacity: 0.3,
    cursor: "default",
  },
  pagerLabel: {
    minWidth: 48,
    color: "rgba(240,248,244,0.9)",
    fontSize: 12,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
  drawer: {
    // Anchor the directory to the list button in the bottom-right dock. The
    // previous top-left drawer covered the slide title and looked detached
    // from the control that opened it.
    position: "fixed",
    right: "max(16px, env(safe-area-inset-right))",
    bottom: "calc(72px + env(safe-area-inset-bottom))",
    zIndex: 405,
    width: "min(420px, calc(100vw - 32px))",
    maxHeight: "calc(100vh - 104px)",
    padding: 20,
    overflow: "auto",
    border: "1px solid rgba(184,220,206,0.2)",
    borderRadius: 0,
    background: "#07100d",
    boxShadow: "0 20px 60px rgba(0,0,0,0.52)",
  },
  drawerHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 14,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: 650,
  },
  drawerClose: {
    display: "grid",
    placeItems: "center",
    width: 38,
    height: 38,
    border: "1px solid rgba(184,220,206,0.24)",
    borderRadius: 0,
    background: "transparent",
    color: "rgba(232,244,238,0.86)",
    cursor: "pointer",
  },
  drawerList: {
    display: "grid",
    gap: 7,
    marginTop: 14,
  },
  drawerItem: {
    display: "grid",
    gridTemplateColumns: "1fr",
    alignItems: "center",
    gap: 2,
    width: "100%",
    minHeight: 66,
    padding: "10px 12px",
    border: "1px solid rgba(184,220,206,0.18)",
    borderRadius: 0,
    background: "transparent",
    color: "rgba(255,255,255,0.68)",
    textAlign: "left",
    cursor: "pointer",
  },
  drawerItemActive: {
    borderColor: "#32e89b",
    background: "rgba(50,232,155,0.04)",
    color: "#fff",
  },
  drawerNo: {
    display: "none",
    fontVariantNumeric: "tabular-nums",
  },
  drawerItemActiveNo: { color: "#32e89b" },
  drawerItemTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 16,
    fontWeight: 550,
  },
  drawerItemLayout: {
    display: "block",
    marginTop: 3,
    color: "rgba(255,255,255,0.36)",
    fontSize: 13,
  },
  emptyNav: {
    padding: "24px 8px",
    color: "rgba(255,255,255,0.48)",
    fontSize: 12,
    textAlign: "center",
  },
}));

/**
 * 元素检视器：右侧属性面板的核心。严格跟随当前选中的元素，只渲染该元素类型支持的配置，
 * 并按「内容 / 动画 / 交互」分组折叠（对齐 Google Slides / Canva / Figma 的 inspector 范式）。
 */
function ElementInspector({
  el,
  onText,
  onImage,
  onLink,
  onAttr,
}: {
  el: {
    id: string;
    kind: EditableElementKind;
    text: string;
    src?: string;
    href?: string;
    enter?: string;
    hover?: string;
    chart?: string;
    counter?: string;
    color?: string;
    align?: string;
    size?: string;
    weight?: string;
    fontStyle?: string;
    radius?: string;
    border?: string;
    shadow?: string;
    fit?: string;
    filter?: string;
    x?: string;
    y?: string;
    w?: string;
    h?: string;
    z?: string;
    rot?: string;
    lock?: string;
    hidden?: string;
  };
  onText: (id: string, v: string) => void;
  onImage: (id: string, v: string) => void;
  onLink: (id: string, v: string) => void;
  onAttr: (id: string, name: string, v: string) => void;
}) {
  const kind = (el.kind ?? "text") as EditableElementKind;
  const { styles } = useElementInspectorStyles();

  const contentItem = (() => {
    let body: React.ReactNode;
    if (kind === "image") {
      body = (
        <div className="sg-el-field">
          <span className="sg-el-label">图片地址</span>
          <Input
            value={el.src ?? ""}
            onChange={(e) => onImage(el.id, e.target.value)}
            placeholder="https://…"
          />
        </div>
      );
    } else if (kind === "link") {
      body = (
        <>
          <div className="sg-el-field">
            <span className="sg-el-label">链接地址</span>
            <Input
              value={el.href ?? ""}
              onChange={(e) => onLink(el.id, e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="sg-el-field">
            <span className="sg-el-label">链接文本</span>
            <Input.TextArea
              value={el.text}
              onChange={(e) => onText(el.id, e.target.value)}
              placeholder="链接文字"
              className={styles.linkText}
            />
          </div>
          <div className="sg-el-field">
            <span className="sg-el-label">颜色</span>
            <div className="sg-el-color-row">
              {TEXT_COLOR_SWATCHES.map((c) => (
                <ColorSwatchButton
                  key={c.value}
                  color={c.value}
                  label={c.label}
                  active={el.color === c.value}
                  onClick={() => onAttr(el.id, "data-sg-color", c.value)}
                />
              ))}
              <ColorPicker
                value={el.color?.startsWith("#") ? el.color : "#000000"}
                onChange={(color) => onAttr(el.id, "data-sg-color", color.toHexString())}
              />
            </div>
          </div>
        </>
      );
    } else if (kind === "chart") {
      const parsed = el.chart?.trim() ? safeParseChart(el.chart) : null;
      body = (
        <>
          <div className="sg-el-field">
            <span className="sg-el-label">图表类型</span>
            <Select
              value={parsed?.type ?? "bar"}
              onChange={(v) =>
                onAttr(el.id, "data-sg-chart", chartToJson({ ...(parsed ?? {}), type: v }))
              }
              options={[
                { value: "bar", label: "柱状图" },
                { value: "line", label: "折线图" },
                { value: "pie", label: "饼图" },
                { value: "radar", label: "雷达图" },
                { value: "funnel", label: "漏斗图" },
              ]}
              className="sg-el-full"
            />
          </div>
          <div className="sg-el-field">
            <span className="sg-el-label">标签（逗号分隔）</span>
            <Input
              value={(parsed?.labels ?? []).join("，")}
              onChange={(e) =>
                onAttr(
                  el.id,
                  "data-sg-chart",
                  chartToJson({ ...(parsed ?? {}), labels: splitLabels(e.target.value) }),
                )
              }
              placeholder="一月，二月，三月"
              className="sg-el-full"
            />
          </div>
          <div className="sg-el-field">
            <span className="sg-el-label">数据（逗号分隔）</span>
            <Input
              value={(parsed?.data ?? []).join("，")}
              onChange={(e) =>
                onAttr(
                  el.id,
                  "data-sg-chart",
                  chartToJson({ ...(parsed ?? {}), data: splitNumbers(e.target.value) }),
                )
              }
              placeholder="12，30，25"
              className="sg-el-full"
            />
          </div>
          <details className="sg-el-raw">
            <summary>编辑原始 JSON</summary>
            <Input.TextArea
              value={el.chart ?? ""}
              onChange={(e) => onAttr(el.id, "data-sg-chart", e.target.value)}
              placeholder='{"type":"bar","labels":[],"data":[]}'
              className={styles.chartRaw}
            />
          </details>
        </>
      );
    } else if (kind === "counter") {
      body = (
        <div className="sg-el-field">
          <span className="sg-el-label">目标数值</span>
          <Input
            value={el.counter ?? el.text}
            onChange={(e) => onAttr(el.id, "data-sg-counter", e.target.value)}
            placeholder="42"
            className="sg-el-full"
          />
        </div>
      );
    } else if (kind === "code-island") {
      body = (
        <>
          <p className="sg-hint">双击画布中的代码块可直接编辑；或在下方修改源码。</p>
          <div className="sg-el-field">
            <span className="sg-el-label">源码</span>
            <Input.TextArea
              value={el.text}
              onChange={(e) => onText(el.id, e.target.value)}
              placeholder="代码内容"
              className={styles.codeSource}
            />
          </div>
        </>
      );
    } else {
      // text：内容编辑交给画布内联（双击），右侧仅提示，避免与画布编辑冲突
      body = (
        <div className="sg-el-hint-inline">
          <p className="sg-hint">
            文本内容请在画布中<b>双击</b>直接编辑。
          </p>
          <details className="sg-el-raw">
            <summary>或在此修改文本</summary>
            <Input.TextArea
              value={el.text}
              onChange={(e) => onText(el.id, e.target.value)}
              placeholder="文本内容"
              className={styles.textSource}
            />
          </details>
        </div>
      );
    }
    return {
      key: "content",
      label: "内容",
      children: <div className="sg-el-group">{body}</div>,
    };
  })();

  const motionItem = {
    key: "interaction",
    label: "交互",
    children: (
      <div className="sg-el-group">
        <div className="sg-el-field">
          <span className="sg-el-label">悬停效果</span>
          <Select
            value={el.hover ?? "none"}
            onChange={(v) => onAttr(el.id, "data-sg-hover", v === "none" ? "" : v)}
            options={HOVER_OPTIONS}
            className="sg-el-full"
          />
        </div>
      </div>
    ),
  };

  /* 文本样式分组（仅文本类元素支持）：颜色 / 对齐 / 字号 / 字重 / 字形。其余类型暂不做样式覆盖。 */
  const styleItem =
    kind === "text"
      ? {
          key: "style",
          label: "样式",
          children: (
            <div className="sg-el-group">
              <div className="sg-el-field">
                <span className="sg-el-label">颜色</span>
                <div className="sg-el-color-row">
                  {TEXT_COLOR_SWATCHES.map((c) => (
                    <ColorSwatchButton
                      key={c.value}
                      color={c.value}
                      label={c.label}
                      active={el.color === c.value}
                      onClick={() => onAttr(el.id, "data-sg-color", c.value)}
                    />
                  ))}
                  <ColorPicker
                    value={el.color?.startsWith("#") ? el.color : "#000000"}
                    onChange={(color) => onAttr(el.id, "data-sg-color", color.toHexString())}
                  />
                </div>
              </div>
              <div className="sg-el-field">
                <span className="sg-el-label">对齐</span>
                <Select
                  value={el.align ?? "left"}
                  onChange={(v) => onAttr(el.id, "data-sg-align", v)}
                  options={ALIGN_OPTIONS}
                  className="sg-el-full"
                />
              </div>
              <div className="sg-el-field">
                <span className="sg-el-label">字号</span>
                <Select
                  value={el.size ?? "md"}
                  onChange={(v) => onAttr(el.id, "data-sg-size", v)}
                  options={SIZE_OPTIONS}
                  className="sg-el-full"
                />
              </div>
              <div className="sg-el-field">
                <span className="sg-el-label">字重</span>
                <Select
                  value={el.weight ?? "normal"}
                  onChange={(v) => onAttr(el.id, "data-sg-weight", v === "normal" ? "" : v)}
                  options={WEIGHT_OPTIONS}
                  className="sg-el-full"
                />
              </div>
              <div className="sg-el-field">
                <span className="sg-el-label">字形</span>
                <Select
                  value={el.fontStyle ?? "normal"}
                  onChange={(v) => onAttr(el.id, "data-sg-style", v === "normal" ? "" : v)}
                  options={FONT_STYLE_OPTIONS}
                  className="sg-el-full"
                />
              </div>
            </div>
          ),
        }
      : null;

  /* 图片样式分组（仅图片类元素支持）：圆角 / 边框 / 阴影。 */
  const imageStyleItem =
    kind === "image"
      ? {
          key: "image-style",
          label: "外观",
          children: (
            <div className="sg-el-group">
              <div className="sg-el-field">
                <span className="sg-el-label">圆角</span>
                <Select
                  value={el.radius ?? "md"}
                  onChange={(v) => onAttr(el.id, "data-sg-radius", v === "md" ? "" : v)}
                  options={RADIUS_OPTIONS}
                  className="sg-el-full"
                />
              </div>
              <div className="sg-el-field sg-el-switch-row">
                <Checkbox
                  className="sg-el-switch"
                  checked={el.border === "on"}
                  onChange={(e) => onAttr(el.id, "data-sg-border", e.target.checked ? "on" : "")}
                >
                  显示边框
                </Checkbox>
                <Checkbox
                  className="sg-el-switch"
                  checked={el.shadow === "on"}
                  onChange={(e) => onAttr(el.id, "data-sg-shadow", e.target.checked ? "on" : "")}
                >
                  投影
                </Checkbox>
              </div>
              <div className="sg-el-field">
                <span className="sg-el-label">填充方式</span>
                <Select
                  value={el.fit ?? "cover"}
                  onChange={(v) => onAttr(el.id, "data-sg-fit", v === "cover" ? "" : v)}
                  options={FIT_OPTIONS}
                  className="sg-el-full"
                />
              </div>
              <div className="sg-el-field">
                <span className="sg-el-label">滤镜</span>
                <Select
                  value={el.filter ?? "none"}
                  onChange={(v) => onAttr(el.id, "data-sg-filter", v === "none" ? "" : v)}
                  options={FILTER_OPTIONS}
                  className="sg-el-full"
                />
              </div>
            </div>
          ),
        }
      : null;

  /* 尺寸分组（所有定位元素通用）：宽 / 高（百分比相对页面）。拖拽/手柄实时改，这里做精确输入。 */
  const parsePct = (v?: string) => {
    const n = parseFloat(v ?? "");
    return Number.isNaN(n) ? "" : String(Math.round(n));
  };
  const sizeItem = {
    key: "size",
    label: "尺寸与位置",
    children: (
      <div className="sg-el-group">
        <div className="sg-el-field sg-el-pos-row">
          <div className="sg-el-pos-col">
            <span className="sg-el-label">X（左）</span>
            <Input
              type="number"
              value={parsePct(el.x)}
              onChange={(e) =>
                onAttr(el.id, "data-sg-x", e.target.value === "" ? "" : `${e.target.value}%`)
              }
              suffix="%"
            />
          </div>
          <div className="sg-el-pos-col">
            <span className="sg-el-label">Y（上）</span>
            <Input
              type="number"
              value={parsePct(el.y)}
              onChange={(e) =>
                onAttr(el.id, "data-sg-y", e.target.value === "" ? "" : `${e.target.value}%`)
              }
              suffix="%"
            />
          </div>
        </div>
        <div className="sg-el-field sg-el-pos-row">
          <div className="sg-el-pos-col">
            <span className="sg-el-label">宽</span>
            <Input
              type="number"
              value={parsePct(el.w)}
              onChange={(e) =>
                onAttr(el.id, "data-sg-w", e.target.value === "" ? "" : `${e.target.value}%`)
              }
              suffix="%"
            />
          </div>
          <div className="sg-el-pos-col">
            <span className="sg-el-label">高</span>
            <Input
              type="number"
              value={parsePct(el.h)}
              onChange={(e) =>
                onAttr(el.id, "data-sg-h", e.target.value === "" ? "" : `${e.target.value}%`)
              }
              suffix="%"
            />
          </div>
        </div>
        <div className="sg-el-field sg-el-pos-row">
          <div className="sg-el-pos-col">
            <span className="sg-el-label">层级</span>
            <Input
              type="number"
              value={parsePct(el.z)}
              onChange={(e) =>
                onAttr(el.id, "data-sg-z", e.target.value === "" ? "" : `${e.target.value}`)
              }
            />
          </div>
          <div className="sg-el-pos-col">
            <span className="sg-el-label">旋转（°）</span>
            <Input
              type="number"
              value={parsePct(el.rot)}
              onChange={(e) =>
                onAttr(el.id, "data-sg-rot", e.target.value === "" ? "" : `${e.target.value}deg`)
              }
              suffix="°"
            />
          </div>
        </div>
        <div className="sg-el-field sg-el-z-row">
          <Button size="small" onClick={() => onAttr(el.id, "data-sg-z", "999")}>
            置顶
          </Button>
          <Button size="small" onClick={() => onAttr(el.id, "data-sg-z", "-999")}>
            置底
          </Button>
        </div>
        <p className="sg-el-hint-sm">
          百分比相对页面尺寸；留空表示由内容自动决定。层级越大越靠上，置顶/置底快捷设置。
        </p>
      </div>
    ),
  };

  /* 状态分组（所有元素通用）：锁定 / 隐藏。锁定防止误改，隐藏临时屏蔽。 */
  const stateItem = {
    key: "state",
    label: "状态",
    children: (
      <div className="sg-el-group">
        <div className="sg-el-field sg-el-switch-row">
          <Checkbox
            className="sg-el-switch"
            checked={el.lock === "on"}
            onChange={(e) => onAttr(el.id, "data-sg-lock", e.target.checked ? "on" : "")}
          >
            锁定
          </Checkbox>
          <Checkbox
            className="sg-el-switch"
            checked={el.hidden === "on"}
            onChange={(e) => onAttr(el.id, "data-sg-hidden", e.target.checked ? "on" : "")}
          >
            隐藏
          </Checkbox>
        </div>
        <p className="sg-el-hint-sm">
          锁定的元素在画布中不可拖拽 / 缩放 / 旋转 / 删除；隐藏的元素在预览与播放中均不显示。
        </p>
      </div>
    ),
  };

  const items = [contentItem, sizeItem, stateItem, styleItem, imageStyleItem, motionItem].filter(
    (it): it is NonNullable<typeof it> => it != null,
  );

  return (
    <div className="sg-el-inspector">
      <div className="sg-el-head">
        <span className="sg-el-badge">{KIND_LABEL[kind] ?? kind}</span>
        <span className="sg-subtle sg-el-id">{el.id}</span>
      </div>
      <Collapse
        className={styles.collapse}
        items={items}
        defaultActiveKey={["content", "style", "motion"]}
        size="small"
        ghost
      />
    </div>
  );
}

/** 在预览 iframe 内注入「点击选中 + 拖拽定位 + 缩放手柄 + 智能吸附 + 框选 + 高亮 + 翻页」桥接脚本（不改动存储的 HTML 本体）。 */
const SG_EDIT_BRIDGE = `<script>
(function () {
  var CSS = [
    ".sg-editor-selected{outline:2px solid var(--sg-primary,#7c5cff) !important;outline-offset:3px;box-shadow:0 0 0 9999px rgba(124,92,255,0.06)}",
    ".sg-editor-multi{outline:1.5px solid rgba(124,92,255,0.6) !important;outline-offset:2px}",
    ".sg-editor-dragging{cursor:grabbing !important;user-select:none !important}",
    ".sg-editor-editing{outline:2px dashed var(--sg-primary,#7c5cff) !important;outline-offset:2px;cursor:text !important;user-select:text !important}",
    ".sg-editor-editing *{cursor:text !important}",
    "[data-sg-id]{cursor:grab}",
    "[data-sg-kind=\\"text\\"]{cursor:text}",
    "[data-sg-lock=\\"on\\"]{cursor:default}",
    "[data-sg-lock=\\"on\\"]::after{content:'';position:absolute;top:2px;right:2px;width:14px;height:14px;background:rgba(124,92,255,0.85);border-radius:3px;z-index:99996;pointer-events:none}",
    "[data-sg-lock=\\"on\\"]::before{content:'';position:absolute;top:6px;right:6px;width:6px;height:6px;border:1.5px solid #fff;border-radius:50%;z-index:99997;pointer-events:none}",
    ".sg-marquee{position:absolute;background:rgba(124,92,255,0.12);border:1px solid var(--sg-primary,#7c5cff);pointer-events:none;z-index:99999}",
    ".sg-guide{position:absolute;background:#ff4d8d;pointer-events:none;z-index:99998}",
    ".sg-guide-h{height:1px;width:100%}",
    ".sg-guide-v{width:1px;height:100%}",
    ".sg-handle{position:absolute;width:11px;height:11px;background:#fff;border:1.5px solid var(--sg-primary,#7c5cff);border-radius:2px;z-index:99997;box-shadow:0 1px 4px rgba(0,0,0,0.2)}",
    ".sg-handle.nw{cursor:nwse-resize}.sg-handle.n{cursor:ns-resize}.sg-handle.ne{cursor:nesw-resize}",
    ".sg-handle.e{cursor:ew-resize}.sg-handle.se{cursor:nwse-resize}.sg-handle.s{cursor:ns-resize}",
    ".sg-handle.sw{cursor:nesw-resize}.sg-handle.w{cursor:ew-resize}",
    ".sg-rotate{position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;border:1.5px solid var(--sg-primary,#7c5cff);z-index:99997;cursor:grab;box-shadow:0 1px 4px rgba(0,0,0,0.2)}",
    ".sg-rotate::before{content:'';position:absolute;left:50%;top:14px;width:1.5px;height:18px;background:var(--sg-primary,#7c5cff);transform:translateX(-50%)}",
    ".sg-nav,.sg-progress,.sg-page-no{display:none !important}",
    "html[data-sg-static='1'] [data-sg-page],html[data-sg-static='1'] [data-sg-page] *,html[data-sg-static='1'] [data-sg-page] *::before,html[data-sg-static='1'] [data-sg-page] *::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;animation-fill-mode:forwards!important;animation-play-state:running!important;transition:none!important}",
    "html[data-sg-static='1'] [data-sg-page] [data-sg-enter]{opacity:1!important;visibility:visible!important;transform:none!important}",
    "[data-sg-page]{display:flex}",
    "[data-sg-page] ~ [data-sg-page]{display:none}"
  ].join("\\n");
  var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);

  document.documentElement.setAttribute("data-sg-static", "1");

  function showPage(pageId) {
    var pages = Array.prototype.slice.call(document.querySelectorAll("[data-sg-page]"));
    if (!pages.length) return;
    var idx = -1;
    if (pageId) {
      for (var i = 0; i < pages.length; i++) {
        if (pages[i].getAttribute("data-sg-id") === pageId) { idx = i; break; }
      }
    }
    if (idx < 0) idx = 0;
    pages.forEach(function (p, k) {
      var show = k === idx;
      p.classList.toggle("sg-active", show);
      p.setAttribute("aria-hidden", show ? "false" : "true");
      p.style.setProperty("display", show ? "flex" : "none", "important");
    });
  }

  var currentPage = function () {
    return document.querySelector("[data-sg-page].sg-active") || document.querySelector("[data-sg-page]");
  };

  // Run finite CSS/WAAPI animations to their end and persist the computed
  // styles in this editor-only document. This keeps the authored HTML intact
  // while avoiding the blank initial state left by animation:none.
  function freezeAnimations(page) {
    if (!page || !page.getAnimations) return;
    var animations = page.getAnimations({ subtree: true });
    animations.forEach(function (animation) {
      var effect = animation.effect;
      var timing = effect && effect.getComputedTiming ? effect.getComputedTiming() : null;
      if (!timing || !Number.isFinite(timing.endTime)) {
        try { animation.pause(); } catch (_) {}
        return;
      }
      try {
        animation.finish();
        if (animation.commitStyles) animation.commitStyles();
        animation.cancel();
      } catch (_) {
        // Pseudo-elements and a few browser-managed effects cannot be
        // committed; leaving their zero-duration fill is the safest fallback.
      }
    });
  }

  function settleEditorPage() {
    var page = currentPage();
    if (!page) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { freezeAnimations(page); });
    });
  }

  /* ---------- 工具函数：百分比换算 / 包围盒 / 吸附参考线 / 缩放手柄 ---------- */
  var SNAP = 6; // 吸附阈值（页面像素）
  function pct(v, total) { return (v / total * 100).toFixed(2) + "%"; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  // 取元素相对页面（百分比）的 bbox；若元素无显式 w/h，用 rect 估算并写回
  function getBBox(el, page) {
    var pr = page.getBoundingClientRect();
    var x = el.style.getPropertyValue("--sg-x");
    var y = el.style.getPropertyValue("--sg-y");
    var w = el.style.getPropertyValue("--sg-w");
    var h = el.style.getPropertyValue("--sg-h");
    var r = el.getBoundingClientRect();
    if (!x) { x = pct(r.left - pr.left, pr.width); el.style.setProperty("--sg-x", x); }
    if (!y) { y = pct(r.top - pr.top, pr.height); el.style.setProperty("--sg-y", y); }
    if (!w) { w = pct(r.width, pr.width); el.style.setProperty("--sg-w", w); }
    if (!h) { h = pct(r.height, pr.height); el.style.setProperty("--sg-h", h); }
    return { x: num(x), y: num(y), w: num(w), h: num(h) };
  }

  // 收集吸附参考：页面中线 + 其他可定位元素的左/中/右、上/中/下边（百分比）
  function collectGuides(page, excludeId) {
    var pr = page.getBoundingClientRect();
    var guides = { v: [50], h: [50] }; // 页面中线
    document.querySelectorAll("[data-sg-id]").forEach(function (el) {
      var id = el.getAttribute("data-sg-id");
      if (id === excludeId) return;
      var b = getBBox(el, page);
      guides.v.push(b.x, b.x + b.w / 2, b.x + b.w);
      guides.h.push(b.y, b.y + b.h / 2, b.y + b.h);
    });
    return guides;
  }

  // 计算一组候选值相对参考线的吸附偏移，返回 {offset, matched:[px坐标]}
  function snapAxis(values, refs, prSize, snapPx) {
    var bestOff = 0, bestDist = snapPx, matched = [];
    values.forEach(function (v) {
      refs.forEach(function (ref) {
        var d = v - ref;
        if (Math.abs(d) <= bestDist) { bestDist = Math.abs(d); bestOff = -d; matched.push(ref); }
      });
    });
    return { offset: bestOff, matched: matched };
  }

  var guideEls = [];
  function clearGuides() { guideEls.forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); }); guideEls = []; }
  function drawGuides(page, vRefs, hRefs) {
    clearGuides();
    var pr = page.getBoundingClientRect();
    vRefs.forEach(function (ref) {
      var g = document.createElement("div"); g.className = "sg-guide sg-guide-v";
      g.style.left = (ref / 100 * pr.width) + "px"; g.style.top = "0px";
      page.appendChild(g); guideEls.push(g);
    });
    hRefs.forEach(function (ref) {
      var g = document.createElement("div"); g.className = "sg-guide sg-guide-h";
      g.style.top = (ref / 100 * pr.height) + "px"; g.style.left = "0px";
      page.appendChild(g); guideEls.push(g);
    });
  }

  var handleEls = [];
  function clearHandles() { handleEls.forEach(function (h) { if (h.parentNode) h.parentNode.removeChild(h); }); handleEls = []; }
  var HANDLE_DIRS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  function renderHandles(page, id) {
    clearHandles();
    if (!id) return;
    var el = document.querySelector("[data-sg-id=\\"" + id + "\\"]");
    if (!el) return;
    if (el.getAttribute("data-sg-lock") === "on") return; // 锁定元素不显示手柄
    var b = getBBox(el, page);
    var pr = page.getBoundingClientRect();
    HANDLE_DIRS.forEach(function (dir) {
      var hd = document.createElement("div");
      hd.className = "sg-handle " + dir;
      hd.setAttribute("data-sg-handle", dir);
      var left, top;
      if (dir.indexOf("w") >= 0) left = b.x; else if (dir.indexOf("e") >= 0) left = b.x + b.w; else left = b.x + b.w / 2;
      if (dir.indexOf("n") >= 0) top = b.y; else if (dir.indexOf("s") >= 0) top = b.y + b.h; else top = b.y + b.h / 2;
      hd.style.left = (left / 100 * pr.width - 5.5) + "px";
      hd.style.top = (top / 100 * pr.height - 5.5) + "px";
      page.appendChild(hd); handleEls.push(hd);
    });
    // 旋转手柄（元素包围盒正上方中点）
    var rot = document.createElement("div");
    rot.className = "sg-rotate";
    rot.setAttribute("data-sg-rotate", "1");
    rot.style.left = (b.x + b.w / 2) / 100 * pr.width - 7 + "px";
    rot.style.top = (b.y - 8) / 100 * pr.height - 7 + "px";
    page.appendChild(rot); handleEls.push(rot);
  }

  /* ---------- 拖拽定位 + 缩放 + 框选 ---------- */
  var dragState = null;
  var resizeState = null;
  var rotateState = null;
  var marquee = null;
  var editingEl = null;

  document.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    if (editingEl) return;
    var page = currentPage();
    if (!page) return;
    var handleDir = e.target && e.target.getAttribute ? e.target.getAttribute("data-sg-handle") : null;
    var rotateFlag = e.target && e.target.getAttribute ? e.target.getAttribute("data-sg-rotate") : null;
    var target = e.target && e.target.closest ? e.target.closest("[data-sg-id]") : null;
    // 锁定元素：不响应拖拽 / 缩放 / 旋转（防误改），但允许选中（点击仍会 select）
    var locked = target && target.getAttribute("data-sg-lock") === "on";
    if (locked && (handleDir || rotateFlag)) {
      // 锁定的元素忽略手柄/旋转操作
      e.preventDefault();
      return;
    }
    if (rotateFlag && target) {
      // 旋转手柄拖拽
      var rid = target.getAttribute("data-sg-id");
      var rb = getBBox(target, page);
      var pr0 = page.getBoundingClientRect();
      var cx = (rb.x + rb.w / 2) / 100 * pr0.width;
      var cy = (rb.y + rb.h / 2) / 100 * pr0.height;
      var startAng = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      var curRot = parseFloat(target.style.getPropertyValue("--sg-rot")) || 0;
      rotateState = { id: rid, cx: cx, cy: cy, startAng: startAng, base: curRot };
      document.addEventListener("mousemove", onRotateMove);
      document.addEventListener("mouseup", onRotateUp);
      e.preventDefault();
      return;
    }
    if (handleDir && target) {
      // 缩放手柄拖拽
      var id = target.getAttribute("data-sg-id");
      var b = getBBox(target, page);
      resizeState = { id: id, dir: handleDir, startX: e.clientX, startY: e.clientY, origin: b };
      document.addEventListener("mousemove", onResizeMove);
      document.addEventListener("mouseup", onResizeUp);
      e.preventDefault();
      return;
    }
    if (target) {
      if (locked) {
        // 锁定元素：不进入拖拽，仅作为点击选中（下方 click 事件处理 select）
        return;
      }
      var sel = window.__sgSelected || [];
      var ids = sel.indexOf(id0(target)) >= 0 ? sel.slice() : [id0(target)];
      var origins = {};
      ids.forEach(function (i) {
        var el = document.querySelector("[data-sg-id=\\"" + i + "\\"]");
        if (el) origins[i] = getBBox(el, page);
      });
      dragState = { ids: ids, startX: e.clientX, startY: e.clientY, origins: origins, moved: false };
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragUp);
      e.preventDefault();
    } else {
      marquee = { x0: e.clientX - pr.left, y0: e.clientY - pr.top };
      var box = document.createElement("div");
      box.className = "sg-marquee";
      box.style.left = marquee.x0 + "px"; box.style.top = marquee.y0 + "px"; box.style.width = "0px"; box.style.height = "0px";
      page.appendChild(box);
      marquee.el = box;
      document.addEventListener("mousemove", onMarqueeMove);
      document.addEventListener("mouseup", onMarqueeUp);
    }
  });

  function id0(el) { return el ? el.getAttribute("data-sg-id") : null; }

  function onDragMove(e) {
    if (!dragState) return;
    var page = currentPage(); if (!page) return;
    var pr = page.getBoundingClientRect();
    var dxRaw = ((e.clientX - dragState.startX) / pr.width) * 100;
    var dyRaw = ((e.clientY - dragState.startY) / pr.height) * 100;
    if (Math.abs(dxRaw) > 0.3 || Math.abs(dyRaw) > 0.3) dragState.moved = true;
    // 仅对主元素计算吸附（以首个元素左/上/中心为基准）
    var lead = dragState.ids[0];
    var ob = dragState.origins[lead];
    var candX = [ob.x + dxRaw, ob.x + dxRaw + ob.w / 2, ob.x + dxRaw + ob.w];
    var candY = [ob.y + dyRaw, ob.y + dyRaw + ob.h / 2, ob.y + dyRaw + ob.h];
    var guides = collectGuides(page, lead);
    var sx = snapAxis(candX, guides.v, pr.width, SNAP);
    var sy = snapAxis(candY, guides.h, pr.height, SNAP);
    var dx = dxRaw + sx.offset, dy = dyRaw + sy.offset;
    drawGuides(page, sx.matched, sy.matched);
    dragState.ids.forEach(function (i) {
      var el = document.querySelector("[data-sg-id=\\"" + i + "\\"]");
      if (!el) return;
      var o = dragState.origins[i] || { x: 0, y: 0 };
      el.style.setProperty("--sg-x", (o.x + dx) + "%");
      el.style.setProperty("--sg-y", (o.y + dy) + "%");
      el.classList.add("sg-editor-dragging");
    });
  }
  function onDragUp() {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragUp);
    clearGuides();
    if (!dragState) return;
    var moved = dragState.moved;
    var payload = dragState.ids.map(function (i) {
      var el = document.querySelector("[data-sg-id=\\"" + i + "\\"]");
      return { id: i, x: el ? el.style.getPropertyValue("--sg-x") : "0%", y: el ? el.style.getPropertyValue("--sg-y") : "0%" };
    });
    dragState.ids.forEach(function (i) {
      var el = document.querySelector("[data-sg-id=\\"" + i + "\\"]");
      if (el) el.classList.remove("sg-editor-dragging");
    });
    if (moved) window.parent.postMessage({ source: "sg-editor-preview", type: "move", items: payload }, "*");
    dragState = null;
  }

  function onResizeMove(e) {
    if (!resizeState) return;
    var page = currentPage(); if (!page) return;
    var pr = page.getBoundingClientRect();
    var el = document.querySelector("[data-sg-id=\\"" + resizeState.id + "\\"]");
    if (!el) return;
    var o = resizeState.origin, dir = resizeState.dir;
    var dw = ((e.clientX - resizeState.startX) / pr.width) * 100;
    var dh = ((e.clientY - resizeState.startY) / pr.height) * 100;
    var nx = o.x, ny = o.y, nw = o.w, nh = o.h;
    if (dir.indexOf("e") >= 0) nw = Math.max(2, o.w + dw);
    if (dir.indexOf("s") >= 0) nh = Math.max(2, o.h + dh);
    if (dir.indexOf("w") >= 0) { nw = Math.max(2, o.w - dw); nx = o.x + (o.w - nw); }
    if (dir.indexOf("n") >= 0) { nh = Math.max(2, o.h - dh); ny = o.y + (o.h - nh); }
    // 吸附：缩放时以对应边/中心为候选
    var guides = collectGuides(page, resizeState.id);
    var vCand = [], hCand = [];
    if (dir.indexOf("w") >= 0) vCand.push(nx, nx + nw / 2, nx + nw);
    if (dir.indexOf("e") >= 0) vCand.push(nx + nw, nx + nw / 2, nx);
    if (dir.indexOf("n") >= 0) hCand.push(ny, ny + nh / 2, ny + nh);
    if (dir.indexOf("s") >= 0) hCand.push(ny + nh, ny + nh / 2, ny);
    var sx = snapAxis(vCand, guides.v, pr.width, SNAP);
    var sy = snapAxis(hCand, guides.h, pr.height, SNAP);
    if (sx.offset) { if (dir.indexOf("w") >= 0) nx += sx.offset; else nw += sx.offset; }
    if (sy.offset) { if (dir.indexOf("n") >= 0) ny += sy.offset; else nh += sy.offset; }
    drawGuides(page, sx.matched, sy.matched);
    el.style.setProperty("--sg-x", nx + "%");
    el.style.setProperty("--sg-y", ny + "%");
    el.style.setProperty("--sg-w", nw + "%");
    el.style.setProperty("--sg-h", nh + "%");
    renderHandles(page, resizeState.id);
  }
  function onResizeUp() {
    document.removeEventListener("mousemove", onResizeMove);
    document.removeEventListener("mouseup", onResizeUp);
    clearGuides();
    if (!resizeState) return;
    var el = document.querySelector("[data-sg-id=\\"" + resizeState.id + "\\"]");
    var res = {
      id: resizeState.id,
      x: el.style.getPropertyValue("--sg-x"),
      y: el.style.getPropertyValue("--sg-y"),
      w: el.style.getPropertyValue("--sg-w"),
      h: el.style.getPropertyValue("--sg-h"),
    };
    resizeState = null;
    window.parent.postMessage({ source: "sg-editor-preview", type: "resize", item: res }, "*");
  }

  function onRotateMove(e) {
    if (!rotateState) return;
    var el = document.querySelector("[data-sg-id=\\"" + rotateState.id + "\\"]");
    if (!el) return;
    var ang = Math.atan2(e.clientY - rotateState.cy, e.clientX - rotateState.cx) * 180 / Math.PI;
    var deg = rotateState.base + (ang - rotateState.startAng);
    deg = Math.round(deg);
    el.style.setProperty("--sg-rot", deg + "deg");
  }
  function onRotateUp() {
    document.removeEventListener("mousemove", onRotateMove);
    document.removeEventListener("mouseup", onRotateUp);
    if (!rotateState) return;
    var el = document.querySelector("[data-sg-id=\\"" + rotateState.id + "\\"]");
    var deg = el ? el.style.getPropertyValue("--sg-rot") : "0deg";
    var id = rotateState.id;
    rotateState = null;
    window.parent.postMessage({ source: "sg-editor-preview", type: "rotate", item: { id: id, rot: deg } }, "*");
  }

  function onMarqueeMove(e) {
    if (!marquee) return;
    var page = currentPage(); if (!page) return;
    var pr = page.getBoundingClientRect();
    var x1 = e.clientX - pr.left, y1 = e.clientY - pr.top;
    var left = Math.min(marquee.x0, x1), top = Math.min(marquee.y0, y1);
    var w = Math.abs(x1 - marquee.x0), h = Math.abs(y1 - marquee.y0);
    marquee.el.style.left = left + "px"; marquee.el.style.top = top + "px";
    marquee.el.style.width = w + "px"; marquee.el.style.height = h + "px";
    marquee.rect = { left: left, top: top, right: left + w, bottom: top + h };
  }
  function onMarqueeUp() {
    document.removeEventListener("mousemove", onMarqueeMove);
    document.removeEventListener("mouseup", onMarqueeUp);
    if (!marquee) return;
    var rect = marquee.rect;
    var page = currentPage();
    if (marquee.el && marquee.el.parentNode) marquee.el.parentNode.removeChild(marquee.el);
    var hits = [];
    if (rect && page) {
      document.querySelectorAll("[data-sg-id]").forEach(function (el) {
        var r = el.getBoundingClientRect();
        // 跳过隐藏 / 零尺寸元素（display:none 时 rect 全 0，会误命中原点）
        if (!r.width || !r.height) return;
        var pr = page.getBoundingClientRect();
        var cx = r.left - pr.left + r.width / 2, cy = r.top - pr.top + r.height / 2;
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
          var id = el.getAttribute("data-sg-id"); if (id) hits.push(id);
        }
      });
    }
    marquee = null;
    window.parent.postMessage({ source: "sg-editor-preview", type: "select-multiple", ids: hits }, "*");
  }

  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-sg-id]") : null;
    // 排除页面 section 容器本身：它带 data-sg-id 但不是可编辑元素，
    // 选中它会让宿主 selectedIds 指向一个 elements 里不存在的 id 而崩溃。
    if (el && el.tagName !== "SECTION") {
      window.parent.postMessage({ source: "sg-editor-preview", type: "select", id: el.getAttribute("data-sg-id") }, "*");
    }
  });

  /* 双击文本元素 → 内联编辑（contenteditable），失焦/回车提交，ESC 取消 */
  function commitEdit() {
    if (!editingEl) return;
    var el = editingEl; editingEl = null;
    el.removeAttribute("contenteditable");
    el.classList.remove("sg-editor-editing");
    el.removeEventListener("blur", commitEdit);
    el.removeEventListener("keydown", onEditKey);
    window.parent.postMessage({
      source: "sg-editor-preview",
      type: "edit-text",
      id: el.getAttribute("data-sg-id"),
      text: el.textContent || "",
    }, "*");
  }
  function onEditKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); }
    else if (e.key === "Escape") { e.preventDefault(); if (editingEl) { editingEl.textContent = editingEl.getAttribute("data-sg-text-origin") || ""; commitEdit(); } }
  }
  document.addEventListener("dblclick", function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-sg-kind="text"]') : null;
    if (!el || !el.getAttribute("data-sg-id")) return;
    e.preventDefault();
    if (editingEl && editingEl !== el) commitEdit();
    editingEl = el;
    el.setAttribute("data-sg-text-origin", el.textContent || "");
    el.setAttribute("contenteditable", "true");
    el.classList.add("sg-editor-editing");
    el.focus();
    el.addEventListener("blur", commitEdit);
    el.addEventListener("keydown", onEditKey);
  });

  window.addEventListener("message", function (ev) {
    var d = ev.data || {};
    if (d.source !== "sg-editor") return;
    if (d.type === "highlight") {
      document.querySelectorAll(".sg-editor-selected,.sg-editor-multi").forEach(function (x) { x.classList.remove("sg-editor-selected"); x.classList.remove("sg-editor-multi"); });
      var ids = d.ids || (d.id ? [d.id] : []);
      ids.forEach(function (i) {
        var t = document.querySelector("[data-sg-id=\\"" + i + "\\"]");
        if (t) t.classList.add(ids.length > 1 ? "sg-editor-multi" : "sg-editor-selected");
      });
      window.__sgSelected = ids;
      clearHandles(); clearGuides();
      if (ids.length === 1) renderHandles(currentPage(), ids[0]);
    } else if (d.type === "navigate") {
      showPage(d.pageId || null);
      clearHandles(); clearGuides();
      settleEditorPage();
    } else if (d.type === "cancel-edit") {
      if (editingEl) { editingEl.textContent = editingEl.getAttribute("data-sg-text-origin") || ""; commitEdit(); }
    }
  });
  // Initialize after the platform Runtime as well. Runtime starts on
  // DOMContentLoaded and otherwise resets the editor back to page 1.
  var initialPage = window.__sgEditorInitialPage || null;
  function applyInitialPage() { showPage(initialPage); }
  applyInitialPage();
  settleEditorPage();
  document.addEventListener("DOMContentLoaded", applyInitialPage);
  document.addEventListener("DOMContentLoaded", settleEditorPage);
  setTimeout(applyInitialPage, 0);
  setTimeout(settleEditorPage, 0);
  var initialSyncTimer = setInterval(applyInitialPage, 100);
  setTimeout(function () { clearInterval(initialSyncTimer); }, 2000);
})();
</script>`;

/** 预览 srcDoc：在原 HTML 末尾注入编辑桥接脚本（静态结束态 + 翻页控制）。 */
function buildPreviewSrcDoc(html: string, initialPageId: string | null = null): string {
  if (!html)
    return "<!doctype html><html><head><style>body{padding:20px;color:#999}</style></head><body>加载中...</body></html>";
  const source = ensurePresentationRuntimeHtml(html);
  const initialPageScript = `<script>window.__sgEditorInitialPage=${JSON.stringify(initialPageId)};</script>`;
  return source.includes("</body>")
    ? source.replace("</body>", `${initialPageScript}${SG_EDIT_BRIDGE}</body>`)
    : `${source}${initialPageScript}${SG_EDIT_BRIDGE}`;
}

/** 缩略图 srcDoc：保留完整 HTML、Runtime 和脚本，只切换当前页，保证与主画布共享渲染链。 */
function buildThumbnailSrcDoc(html: string, pageIndex: number): string {
  const source = ensurePresentationRuntimeHtml(html);
  // The thumbnail iframe is already sized to the sidebar card. Keep the
  // document in that viewport so SG Runtime performs exactly one stage fit;
  // applying another 960px canvas scale here makes dense pages unreadable.
  const thumbStyle = `<style data-sg-thumbnail-style>${SG_STATICIZE_CSS}
html,body{width:100%!important;height:100%!important;margin:0!important;padding:0!important;overflow:hidden!important}
[data-sg-page]{transform-origin:0 0!important}
</style>`;
  const thumbScript = `<script data-sg-thumbnail-script>(function(){
  var target=${Math.max(0, pageIndex)};
  function sync(){
    document.documentElement.setAttribute("data-sg-static","1");
    var pages=Array.prototype.slice.call(document.querySelectorAll("[data-sg-page]"));
    pages.forEach(function(p,i){
      var active=i===target;
      p.classList.toggle("sg-active",active);
      p.setAttribute("aria-hidden",active?"false":"true");
      p.style.setProperty("display",active?"flex":"none","important");
    });
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",sync);else sync();
  setTimeout(sync,80);
})();</script>`;
  const withStyle = source.includes("</head>")
    ? source.replace("</head>", `${thumbStyle}</head>`)
    : `${thumbStyle}${source}`;
  return withStyle.includes("</body>")
    ? withStyle.replace("</body>", `${thumbScript}</body>`)
    : `${withStyle}${thumbScript}`;
}

export function buildPlaybackSrcDoc(html: string): string {
  const source = ensurePresentationRuntimeHtml(html, { player: "engine" });
  // Hide only the platform's embedded controls. Animation CSS belongs to the
  // AI-authored HTML and remains untouched in playback.
  const playerStyle = `<style data-sg-player-style>
#sg-progress,#sg-page-no,body > .sg-nav{display:none!important}
</style>`;
  return source.includes("</head>")
    ? source.replace("</head>", `${playerStyle}</head>`)
    : `${playerStyle}${source}`;
}

/** 定位元素所属页面 id（用于点击预览选中时同步左侧高亮）。 */
function locateElementPage(html: string, elementId: string): string | null {
  try {
    const tree = parsePresentationHtml(html);
    for (const page of listPages(tree)) {
      if (listEditableElements(tree, page.id).some((el) => el.id === elementId)) return page.id;
    }
  } catch {
    // ignore
  }
  return null;
}

interface AssetPage {
  items: Asset[];
  nextCursor?: string | null;
}

async function loadPresentationSet(includeDeleted: boolean): Promise<Asset[]> {
  const items: Asset[] = [];
  let cursor: string | undefined;
  do {
    const page = await api<AssetPage>("/assets", {
      params: { type: "presentation", includeDeleted, limit: 100, cursor },
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

async function loadPresentations(): Promise<Asset[]> {
  const [active, deleted] = await Promise.all([
    loadPresentationSet(false),
    loadPresentationSet(true),
  ]);
  return [...active, ...deleted];
}

export function PresentationsPage() {
  const navigate = useNavigate();
  const authSession = getAuthSession();
  const [tab, setTab] = useState<"all" | "mine" | "shared" | "favorites" | "trash">("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("updated");
  const [onlyMine, setOnlyMine] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [publishTarget, setPublishTarget] = useState<Asset | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const value = window.localStorage.getItem("shiguang.presentation-favorites");
      const parsed = value ? JSON.parse(value) : [];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  const { data, isLoading: presentationsLoading } = useQuery<Asset[]>({
    queryKey: ["assets", "presentation"],
    queryFn: loadPresentations,
  });
  const { data: publishes = [] } = useQuery<Publish[]>({
    queryKey: ["publishes"],
    queryFn: () => api<Publish[]>("/publishes"),
  });
  const { data: analytics } = useQuery<PublishStatsSummary>({
    queryKey: ["publishes", "stats", "presentation"],
    queryFn: () =>
      api<PublishStatsSummary>("/publishes/stats/summary", {
        params: { assetType: "presentation" },
      }),
  });
  const presentations = useMemo(
    () => (data ?? []).filter((a) => a.type === "presentation"),
    [data],
  );
  const activePresentations = useMemo(
    () => presentations.filter((item) => !item.deletedAt),
    [presentations],
  );
  const activePresentationIds = useMemo(
    () => new Set(activePresentations.map((item) => item.id)),
    [activePresentations],
  );
  const presentationPublishes = useMemo(
    () => publishes.filter((item) => activePresentationIds.has(item.assetId)),
    [activePresentationIds, publishes],
  );
  const viewsByAsset = useMemo(() => {
    const result = new Map<string, number>();
    for (const publish of presentationPublishes) {
      result.set(publish.assetId, (result.get(publish.assetId) ?? 0) + publish.viewCount);
    }
    return result;
  }, [presentationPublishes]);
  const viewCount = useCallback((asset: Asset) => viewsByAsset.get(asset.id) ?? 0, [viewsByAsset]);
  const totalViews = useMemo(
    () => presentationPublishes.reduce((sum, item) => sum + item.viewCount, 0),
    [presentationPublishes],
  );
  const averageLikes = analytics?.averageLikes ?? 0;
  const uniqueVisitors = analytics?.uniqueVisitors ?? 0;
  const averageWatchTime = formatWatchTime(analytics?.averageWatchSeconds ?? 0);

  useEffect(() => {
    window.localStorage.setItem("shiguang.presentation-favorites", JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  useEffect(() => setPage(1), [tab, query, status, sort, onlyMine, pageSize]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return presentations
      .filter((item) => {
        if (tab === "mine" && !isOwnedBySession(item, authSession)) return false;
        if (tab === "shared" && isOwnedBySession(item, authSession)) return false;
        if (tab === "favorites" && !favoriteIds.includes(item.id)) return false;
        if (tab === "trash" && !item.deletedAt) return false;
        if (tab !== "trash" && item.deletedAt) return false;
        if (onlyMine && !isOwnedBySession(item, authSession)) return false;
        if (status !== "all" && item.status !== status) return false;
        if (
          normalized &&
          !`${item.title} ${item.description ?? ""}`.toLowerCase().includes(normalized)
        )
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "title") return a.title.localeCompare(b.title, "zh-CN");
        if (sort === "views") return viewCount(b) - viewCount(a);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [authSession, favoriteIds, onlyMine, presentations, query, sort, status, tab, viewCount]);
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const topPresentations = [...activePresentations]
    .filter((item) => viewCount(item) > 0)
    .sort((a, b) => viewCount(b) - viewCount(a))
    .slice(0, 3);
  const monthly = activePresentations.filter((item) => {
    const created = new Date(item.createdAt);
    const now = new Date();
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
  }).length;
  const tabs = [
    { id: "all", label: "全部演示" },
    { id: "mine", label: "我创建的" },
    { id: "shared", label: "分享给我的" },
    { id: "favorites", label: "收藏" },
    { id: "trash", label: "回收站" },
  ] as const;
  const sharePresentation = (asset: Asset) => {
    setPublishTarget(asset);
  };
  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="sg-presentation-page">
      <section className="sg-presentation-heading">
        <div className="sg-presentation-title">
          <span>
            <Play size={18} />
          </span>
          <div>
            <h1>在线演示</h1>
            <p>将报告、文档、调研内容转化为精美的 H5 演示，支持在线播放与分享。</p>
          </div>
        </div>
        <div className="sg-presentation-heading-actions">
          <Button type="primary" onClick={() => navigate("/presentations/new")}>
            <Plus size={14} />
            新建
          </Button>
          <Button onClick={() => navigate("/presentations/new?source=document")}>
            <Import size={14} />
            导入
          </Button>
          <Button onClick={() => setTab("trash")}>
            <Trash2 size={14} />
            回收站
          </Button>
        </div>
      </section>

      <div className="sg-presentation-layout">
        <main>
          <section className="sg-presentation-stats">
            {[
              {
                label: "全部演示",
                value: activePresentations.length,
                icon: FileText,
                tone: "violet",
              },
              {
                label: "本月创建",
                value: monthly,
                icon: Play,
                tone: "blue",
              },
              {
                label: "总浏览量",
                value: totalViews.toLocaleString("zh-CN"),
                delta: "21%",
                icon: Eye,
                tone: "cyan",
              },
              {
                label: "平均点赞",
                value: averageLikes.toLocaleString("zh-CN"),
                delta: "18%",
                icon: ThumbsUp,
                tone: "orange",
              },
            ].map((item) => {
              const StatIcon = item.icon;
              return (
                <article key={item.label}>
                  <span className={item.tone}>
                    <StatIcon size={20} />
                  </span>
                  <div>
                    <small>{item.label}</small>
                    <strong>{item.value}</strong>
                    <p>
                      较上月 <TrendingUp size={11} /> {"delta" in item ? item.delta : "16%"}
                    </p>
                  </div>
                </article>
              );
            })}
          </section>

          <AppTabs
            items={tabs.map((item) => ({ key: item.id, label: item.label }))}
            activeKey={tab}
            onChange={(key) => setTab(key as typeof tab)}
          />

          <section className="sg-presentation-toolbar">
            <Input
              className="sg-presentation-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索演示标题或描述..."
              prefix={<Search size={14} />}
              allowClear
            />
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "全部状态" },
                { value: "ready", label: "已完成" },
                { value: "draft", label: "草稿" },
                { value: "processing", label: "生成中" },
              ]}
              className="sg-presentation-select"
            />
            <Select
              value={sort}
              onChange={setSort}
              options={[
                { value: "updated", label: "更新时间" },
                { value: "views", label: "浏览量" },
                { value: "title", label: "标题" },
              ]}
              className="sg-presentation-select"
            />
            <Checkbox
              className="sg-presentation-own"
              checked={onlyMine}
              onChange={(event) => setOnlyMine(event.target.checked)}
            >
              仅看我创建
            </Checkbox>
            <Segmented
              className="sg-presentation-view-switch"
              aria-label="视图模式"
              value={view}
              onChange={(value) => setView(value as typeof view)}
              options={[
                {
                  value: "grid",
                  icon: <Grid2X2 size={14} aria-hidden="true" />,
                  tooltip: "卡片视图",
                },
                {
                  value: "list",
                  icon: <LayoutList size={14} aria-hidden="true" />,
                  tooltip: "列表视图",
                },
              ]}
            />
          </section>

          {presentationsLoading ? (
            <Loading loading minHeight={300} />
          ) : pageItems.length === 0 ? (
            <div className="sg-presentation-empty">
              <Empty
                title={tab === "trash" ? "回收站为空" : "没有匹配的演示"}
                hint={
                  tab === "trash" ? "删除的演示会保留 30 天。" : "调整筛选条件或创建新的在线演示。"
                }
                action={
                  tab !== "trash" ? (
                    <Button type="primary" onClick={() => navigate("/presentations/new")}>
                      新建
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : view === "list" ? (
            <div className="sg-presentation-table-wrap">
              <AppTable<Asset>
                rowKey="id"
                dataSource={pageItems}
                pagination={false}
                size="middle"
                columns={[
                  {
                    title: "演示标题",
                    dataIndex: "title",
                    width: "47%",
                    render: (_v, item, index) => (
                      <div className="sg-presentation-name">
                        <PresentationThumbnail title={item.title} tone={index} />
                        <div>
                          <button
                            type="button"
                            onClick={() => navigate(`/presentations/${item.id}`)}
                          >
                            {item.title}
                          </button>
                        </div>
                        <button
                          type="button"
                          className={`sg-presentation-favorite${favoriteIds.includes(item.id) ? " active" : ""}`}
                          aria-label={favoriteIds.includes(item.id) ? "取消收藏" : "收藏"}
                          onClick={() => toggleFavorite(item.id)}
                        >
                          <Star size={13} />
                        </button>
                      </div>
                    ),
                  },
                  {
                    title: "来源类型",
                    dataIndex: "sourceType",
                    width: 120,
                    render: (_v, item) => (
                      <span className="sg-presentation-source">
                        <FileText size={13} />
                        {item.sourceType === "manual" ? "文档" : "报告"}
                      </span>
                    ),
                  },
                  {
                    title: "创建者",
                    dataIndex: "ownerDisplayName",
                    width: 120,
                    render: (_v, item) => (
                      <OwnerAvatar name={ownerDisplayName(item, authSession)} />
                    ),
                  },
                  {
                    title: "更新时间",
                    dataIndex: "updatedAt",
                    width: 160,
                    render: (v) => new Date(v).toLocaleString("zh-CN", { hour12: false }),
                  },
                  {
                    title: "浏览量",
                    dataIndex: "viewCount",
                    width: 90,
                    render: (_v, item) => viewCount(item).toLocaleString("zh-CN"),
                  },
                  {
                    title: "操作",
                    key: "actions",
                    width: 120,
                    render: (_v, item) => (
                      <div className="sg-presentation-row-actions">
                        <Button
                          size="small"
                          type="text"
                          className="sg-list-action-btn"
                          icon={<Play size={13} />}
                          aria-label={`播放 ${item.title}`}
                          title="播放"
                          onClick={() => navigate(`/presentations/${item.id}/play`)}
                        />
                        <Button
                          size="small"
                          type="text"
                          className="sg-list-action-btn"
                          icon={<Share2 size={13} />}
                          aria-label={`分享 ${item.title}`}
                          title="分享"
                          onClick={() => void sharePresentation(item)}
                        />
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          ) : (
            <div className="sg-presentation-grid">
              {pageItems.map((item, index) => (
                <article key={item.id}>
                  <PresentationThumbnail title={item.title} tone={index} />
                  <div>
                    <button type="button" onClick={() => navigate(`/presentations/${item.id}`)}>
                      {item.title}
                    </button>
                    <p>{item.description || "在线演示内容"}</p>
                    <span>
                      <Eye size={12} /> {viewCount(item).toLocaleString("zh-CN")}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <AppPagination
              total={filtered.length}
              current={page}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="条"
            />
          )}

          <section className="sg-presentation-quickstart">
            <div>
              <Sparkles size={17} />
              <strong>快速开始</strong>
            </div>
            <ol>
              {[
                ["选择来源", "从报告、文档或空白开始"],
                ["AI 生成大纲", "智能提炼核心观点"],
                ["一键生成", "自动生成精美 H5 演示"],
                ["编辑发布", "在线编辑并分享"],
              ].map(([title, description], index) => (
                <li key={title}>
                  <span>{index + 1}</span>
                  <div>
                    <b>{title}</b>
                    <small>{description}</small>
                  </div>
                  {index < 3 && <ChevronRight size={14} />}
                </li>
              ))}
            </ol>
          </section>
        </main>

        <aside className="sg-presentation-side">
          <section className="sg-presentation-analytics">
            <div className="sg-presentation-side-title">
              <h2>演示数据概览</h2>
              <Select
                value="30"
                onChange={() => undefined}
                options={[{ value: "30", label: "近 30 天" }]}
                className="sg-presentation-range"
              />
            </div>
            <PresentationTrendChart daily={analytics?.daily ?? []} />
            <dl>
              <div>
                <dt>浏览量</dt>
                <dd>{totalViews.toLocaleString("zh-CN")}</dd>
                <small>↑ 21%</small>
              </div>
              <div>
                <dt>独立访客</dt>
                <dd>{uniqueVisitors.toLocaleString("zh-CN")}</dd>
                <small>↑ 18%</small>
              </div>
              <div>
                <dt>平均观看时长</dt>
                <dd>{averageWatchTime}</dd>
                <small>↑ 12%</small>
              </div>
            </dl>
          </section>
          <section>
            <div className="sg-presentation-side-title">
              <h2>热门演示 TOP 3</h2>
              <button type="button" onClick={() => setSort("views")}>
                查看全部
              </button>
            </div>
            {topPresentations.length === 0 ? (
              <p className="sg-subtle">暂无发布访问记录</p>
            ) : (
              <ol className="sg-presentation-top-list">
                {topPresentations.map((item, index) => (
                  <li key={item.id}>
                    <b>{index + 1}</b>
                    <button type="button" onClick={() => navigate(`/presentations/${item.id}`)}>
                      {item.title}
                    </button>
                    <span>
                      <Eye size={11} /> {viewCount(item).toLocaleString("zh-CN")}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section>
            <div className="sg-presentation-side-title">
              <h2>最近更新</h2>
              <button type="button" onClick={() => setSort("updated")}>
                查看全部
              </button>
            </div>
            <div className="sg-presentation-recent">
              {[...presentations]
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 6)
                .map((item, index) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => navigate(`/presentations/${item.id}`)}
                  >
                    <PresentationThumbnail title={item.title} tone={index} />
                    <span>
                      <b>{item.title}</b>
                      <small>
                        {new Date(item.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                      </small>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        </aside>
      </div>
      {publishTarget && (
        <PublishDialog asset={publishTarget} open onClose={() => setPublishTarget(null)} />
      )}
    </div>
  );
}

function PresentationThumbnail({ title, tone }: { title: string; tone: number }) {
  return (
    <span className={`sg-presentation-thumb tone-${tone % 4}`} aria-hidden="true">
      <i />
      <b>{title.slice(0, 12)}</b>
      <small>SHIGUANG LAB</small>
    </span>
  );
}

function formatWatchTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function PresentationTrendChart({
  daily,
}: {
  daily: Array<{ day: string; views: number; uniqueVisitors: number }>;
}) {
  const points = daily.slice(-30);
  const max = Math.max(1, ...points.map((item) => item.views));
  const coordinates = (points.length > 1 ? points : [{ day: "", views: 0, uniqueVisitors: 0 }]).map(
    (item, index, source) => {
      const x = source.length === 1 ? 130 : (index / (source.length - 1)) * 260;
      const y = 110 - (item.views / max) * 95;
      return { x, y, day: item.day };
    },
  );
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `M${coordinates[0]?.x ?? 0} 120 L${line} L${coordinates.at(-1)?.x ?? 260} 120 Z`;
  const labels = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const point = points[Math.min(points.length - 1, Math.round((points.length - 1) * ratio))];
    return point?.day.slice(5) ?? "--";
  });
  return (
    <div className="sg-presentation-chart" role="img" aria-label="近 30 天浏览趋势">
      <span>{max.toLocaleString("zh-CN")}</span>
      <span>{Math.round(max * 0.75).toLocaleString("zh-CN")}</span>
      <span>{Math.round(max * 0.5).toLocaleString("zh-CN")}</span>
      <span>{Math.round(max * 0.25).toLocaleString("zh-CN")}</span>
      <span>0</span>
      <svg viewBox="0 0 260 120" aria-hidden="true">
        <defs>
          <linearGradient id="presentation-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7c3cff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#7c3cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#presentation-area)" />
        <polyline points={line} fill="none" stroke="#8f63ff" strokeWidth="2" />
      </svg>
      <div>
        {labels.map((label, index) => (
          <small key={`${label}-${index}`}>{label}</small>
        ))}
      </div>
    </div>
  );
}

export function PresentationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const {
    present: html,
    set: setHtml,
    reset: resetHtml,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<string>("");
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds[0] ?? null;
  const [publishOpen, setPublishOpen] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [aiScope, setAiScope] = useState<"page" | "presentation">("page");
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiProposal, setAiProposal] = useState<string | null>(null);
  // AI 生成元素（insert scope）：在当前页末尾追加新元素
  const [aiInsertOpen, setAiInsertOpen] = useState(false);
  const [aiInsertKind, setAiInsertKind] = useState<string>("text");
  const [aiInsertInstruction, setAiInsertInstruction] = useState("");
  const previewRef = useRef<HTMLIFrameElement>(null);
  const postPreviewNavigation = useCallback((pageId: string | null) => {
    previewRef.current?.contentWindow?.postMessage(
      { source: "sg-editor", type: "navigate", pageId },
      "*",
    );
  }, []);
  const { styles } = usePresentationEditorStyles();

  const { data } = useQuery<{ asset: Asset; html: string }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });

  useShellBreadcrumb("在线演示", data?.asset.title ?? "未命名演示");

  useEffect(() => {
    if (data) resetHtml(data.html);
  }, [data]);

  // 撤销 / 重做快捷键（useHistory 提供，稳定）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // 预览 iframe 消息：选中 / 多选 / 拖拽移动 / 文本编辑
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as {
        source?: string;
        type?: string;
        id?: string;
        ids?: string[];
        text?: string;
        items?: Array<{ id: string; x: string; y: string }>;
        item?: { id: string; x: string; y: string; w: string; h: string };
        rotItem?: { id: string; rot: string };
      } | null;
      if (data?.source !== "sg-editor-preview") return;
      if (data.type === "select" && data.id) {
        setSelectedIds([data.id]);
        const pageId = locateElementPage(html, data.id);
        if (pageId) setActivePageId(pageId);
      } else if (data.type === "select-multiple") {
        setSelectedIds(data.ids?.length ? data.ids : []);
        if (data.ids?.[0]) {
          const pageId = locateElementPage(html, data.ids[0]);
          if (pageId) setActivePageId(pageId);
        }
      } else if (data.type === "move" && data.items) {
        // 拖拽结束 → 回写每个元素的 x/y（批量，合并为同一步撤销）
        const ids = (data.items ?? []).map((it) => it.id).join(",");
        applyAst((tree) => {
          for (const it of data.items ?? []) {
            setDataAttribute(tree, it.id, "data-sg-x", it.x);
            setDataAttribute(tree, it.id, "data-sg-y", it.y);
          }
        }, `drag-${ids}`);
      } else if (data.type === "resize" && data.item) {
        // 缩放结束 → 回写 x/y/w/h（单元素，合并为同一步）
        const it = data.item;
        applyAst((tree) => {
          setDataAttribute(tree, it.id, "data-sg-x", it.x);
          setDataAttribute(tree, it.id, "data-sg-y", it.y);
          setDataAttribute(tree, it.id, "data-sg-w", it.w);
          setDataAttribute(tree, it.id, "data-sg-h", it.h);
        }, `drag-${it.id}`);
      } else if (data.type === "rotate" && data.rotItem) {
        const it = data.rotItem;
        applyAst((tree) => {
          setDataAttribute(tree, it.id, "data-sg-rot", it.rot);
        }, `drag-${it.id}`);
      } else if (data.type === "edit-text" && data.id) {
        if (typeof data.text === "string") editText(data.id, data.text);
        setSelectedIds([data.id]);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [html]);

  // 高亮选中元素（发送到预览 iframe，支持多选）
  useEffect(() => {
    previewRef.current?.contentWindow?.postMessage(
      { source: "sg-editor", type: "highlight", ids: selectedIds },
      "*",
    );
  }, [selectedIds, html]);

  // 左侧缩略图点击 → 通知预览 iframe 翻到对应页
  useEffect(() => {
    postPreviewNavigation(activePageId);
  }, [activePageId, html, postPreviewNavigation]);

  const pages = useMemo(() => {
    try {
      return listPages(parsePresentationHtml(html));
    } catch {
      return [];
    }
  }, [html]);

  const applyAst = (
    fn: (tree: ReturnType<typeof parsePresentationHtml>) => void,
    mergeKey?: string,
  ) => {
    try {
      const tree = parsePresentationHtml(html);
      fn(tree);
      setHtml(serializePresentationHtml(tree), mergeKey);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "HTML 解析失败");
    }
  };

  const makePageId = () => `page-${Date.now().toString(36)}`;

  /** 列表底部新增页面（对应业内“新增按钮沉到列表底部”的惯例）。 */
  const addPage = () => {
    const nid = makePageId();
    applyAst((tree) => astInsertPage(tree, { id: nid, layout: "content", title: "新页面" }, null));
    setActivePageId(nid);
  };

  /** 在指定页码之后插入新页面（分割线上的“＋”插入入口）。 */
  const insertPageAfter = (index: number) => {
    const afterId = pages[index]?.id ?? null;
    const nid = makePageId();
    applyAst((tree) =>
      astInsertPage(tree, { id: nid, layout: "content", title: "新页面" }, afterId),
    );
    setActivePageId(nid);
  };

  /* 右键菜单用：以页面 id 直接操作，不依赖当前选中项 */
  const removePageById = (pageId: string) => {
    applyAst((tree) => astRemovePage(tree, pageId));
    if (activePageId === pageId) setActivePageId(null);
  };
  const movePageById = (pageId: string, direction: -1 | 1) => {
    applyAst((tree) => astMovePage(tree, pageId, direction));
  };
  const duplicateActivePageById = (pageId: string) => {
    const nid = `page-${Date.now().toString(36)}`;
    applyAst((tree) => astDuplicatePage(tree, pageId, nid));
    setActivePageId(nid);
  };

  const [theme, setTheme] = useState("light");
  const [themePalette, setThemePalette] = useState<{
    background: string;
    textPrimary: string;
    textSecondary: string;
    surface: string;
    primary: string;
  } | null>(null);
  const elements = useMemo(() => {
    if (!activePageId) return [];
    try {
      return listEditableElements(parsePresentationHtml(html), activePageId);
    } catch {
      return [];
    }
  }, [html, activePageId]);

  /** 跟随选区：只取当前选中的元素，右侧只显示它的配置 */
  const selectedEl = useMemo(
    () => elements.find((e) => e.id === selectedId) ?? null,
    [elements, selectedId],
  );

  // 选区自愈：单选但元素不在当前页可编辑列表中（如点击页面 section 容器、
  // 或选中元素已被删除/切到别的页）时，清空选区，避免渲染层拿到 undefined 崩溃。
  useEffect(() => {
    if (selectedIds.length === 1 && !selectedEl) setSelectedIds([]);
  }, [selectedIds, selectedEl]);

  const applyTheme = (value: string) => {
    setTheme(value);
    setThemePalette(null);
    applyAst((tree) => astSetTheme(tree, value, null));
  };
  /** 应用内置配色预设（写入 :root 主色等变量，覆盖基础主题）。 */
  const applyThemePreset = (presetKey: string) => {
    const preset = THEME_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    setThemePalette(preset.palette);
    applyAst((tree) => astSetTheme(tree, theme, preset.palette));
  };
  /** 仅自定义主色（其余沿用当前基础主题的派生色）。 */
  const applyCustomPrimary = (primary: string) => {
    const palette = {
      background: themePalette?.background ?? "#ffffff",
      textPrimary: themePalette?.textPrimary ?? "#172033",
      textSecondary: themePalette?.textSecondary ?? "#667085",
      surface: themePalette?.surface ?? "#f7f8fb",
      primary,
    };
    setThemePalette(palette);
    applyAst((tree) => astSetTheme(tree, theme, palette));
  };
  /** 重置配色：清除自定义/预设覆盖，回到当前主题默认色板。 */
  const resetThemePalette = () => {
    setThemePalette(null);
    applyAst((tree) => astSetTheme(tree, theme, null));
  };
  const editText = (elementId: string, value: string) =>
    applyAst((tree) => updateTextContent(tree, elementId, value));
  const editImage = (elementId: string, value: string) =>
    applyAst((tree) => updateImageSrc(tree, elementId, value));
  const editLink = (elementId: string, value: string) =>
    applyAst((tree) => updateLinkHref(tree, elementId, value));
  const editAttr = (elementId: string, name: string, value: string) =>
    applyAst(
      (tree) => setDataAttribute(tree, elementId, name, value || null),
      `attr-${elementId}-${name}`,
    );
  const deleteSelectedElements = () => {
    if (!selectedIds.length) return;
    // 锁定的元素不可删除（防误删），仅删未锁定的选中项
    const ids = selectedIds.filter((id) => {
      const el = elements.find((e) => e.id === id);
      return el?.lock !== "on";
    });
    if (!ids.length) {
      toast("info", "已锁定的元素不可删除，请先解锁");
      return;
    }
    applyAst((tree) => {
      for (const id of ids) astRemoveElement(tree, id);
    });
    setSelectedIds([]);
  };
  /** 复制选中元素（锁定元素跳过），副本偏移以防重叠，并选中副本。 */
  const duplicateSelectedElements = () => {
    if (selectedIds.length === 0) return;
    const ids = selectedIds.filter((id) => {
      const el = elements.find((e) => e.id === id);
      return el?.lock !== "on";
    });
    if (!ids.length) {
      toast("info", "已锁定的元素不可复制，请先解锁");
      return;
    }
    let created: string[] = [];
    applyAst((tree) => {
      created = astDuplicateElements(tree, ids);
    });
    if (created.length) setSelectedIds(created);
  };
  /** 批量对齐：把选中元素对齐到某一 x（百分比）或统一 y。axis="x" 表示所有元素 left 对齐到最小 x。 */
  const alignSelected = (mode: "left" | "center-x" | "top" | "middle-y") => {
    if (selectedIds.length < 2) return;
    const els = elements.filter((el) => selectedIds.includes(el.id));
    if (!els.length) return;
    applyAst((tree) => {
      if (mode === "left" || mode === "top") {
        const xs = els.map((e) => parseFloat(e.x ?? "0"));
        const ys = els.map((e) => parseFloat(e.y ?? "0"));
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        for (const el of els) {
          if (mode === "left") setDataAttribute(tree, el.id, "data-sg-x", `${minX}%`);
          else setDataAttribute(tree, el.id, "data-sg-y", `${minY}%`);
        }
      } else if (mode === "center-x" || mode === "middle-y") {
        const xs = els.map((e) => parseFloat(e.x ?? "0"));
        const ys = els.map((e) => parseFloat(e.y ?? "0"));
        const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
        for (const el of els) {
          if (mode === "center-x") setDataAttribute(tree, el.id, "data-sg-x", `${avgX}%`);
          else setDataAttribute(tree, el.id, "data-sg-y", `${avgY}%`);
        }
      }
    });
  };

  // 元素 / 页面快捷键：Delete 删元素、Cmd/Ctrl+D 复制页（非内联编辑态）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const editing = !!target?.closest?.("[contenteditable='true']");
      if (mod) {
        if (e.key.toLowerCase() === "d") {
          if (e.shiftKey && !editing && selectedIds.length) {
            e.preventDefault();
            duplicateSelectedElements();
          } else if (!editing && activePageId) {
            e.preventDefault();
            duplicateActivePageById(activePageId);
          }
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !editing && selectedIds.length) {
        e.preventDefault();
        deleteSelectedElements();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activePageId,
    selectedIds,
    deleteSelectedElements,
    duplicateActivePageById,
    duplicateSelectedElements,
  ]);

  const saveMutation = useMutation({
    mutationFn: () => api(`/presentations/${id}`, { method: "PUT", body: { html } }),
    onSuccess: () => {
      toast("success", "已保存");
      void queryClient.invalidateQueries({ queryKey: ["presentation", id] });
    },
  });

  const aiEdit = useMutation({
    mutationFn: () =>
      api<{ proposal: string }>(`/presentations/${id}/ai-edit`, {
        method: "POST",
        body: {
          scope: aiScope,
          targetId: aiScope === "page" ? activePageId : undefined,
          instruction: aiInstruction || "让内容更精炼、更有冲击力",
        },
      }),
    onSuccess: (res) => setAiProposal(res.proposal),
    onError: (error) => toast("error", error instanceof Error ? error.message : "AI 修改失败"),
  });

  const openAiEdit = (scope: "page" | "presentation") => {
    setAiScope(scope);
    setAiInstruction("");
    setAiProposal(null);
    setAiEditOpen(true);
  };

  // AI 生成元素：在当前页末尾追加一个新元素（insert scope）
  const aiInsert = useMutation({
    mutationFn: () =>
      api<{ proposal: string }>(`/presentations/${id}/ai-edit`, {
        method: "POST",
        body: {
          scope: "insert",
          targetId: activePageId ?? undefined,
          instruction: `新增一个${AI_INSERT_KIND_LABEL[aiInsertKind] ?? "文本"}元素：${aiInsertInstruction || "根据上下文自动生成合适内容"}`,
        },
      }),
    onSuccess: (res) => {
      setHtml(res.proposal);
      setAiInsertOpen(false);
      setAiInsertInstruction("");
      toast("success", "AI 已生成新元素");
    },
    onError: (error) => toast("error", error instanceof Error ? error.message : "AI 生成失败"),
  });

  const applyAiProposal = () => {
    if (aiProposal == null) return;
    setHtml(aiProposal);
    setAiProposal(null);
    setAiEditOpen(false);
    toast("success", "AI 修改已应用");
  };

  if (!data) return <Empty title="加载中…" />;

  return (
    <div className={"sg-page"}>
      <div className="sg-row-between sg-mb">
        <div>
          <span className="sg-subtle">
            已自动保存 · {new Date().toLocaleTimeString("zh-CN", { hour12: false })}
          </span>
        </div>
        <div className="sg-row">
          <Button size="small" disabled={!canUndo} onClick={undo} aria-label="撤销">
            ↺ 撤销
          </Button>
          <Button size="small" disabled={!canRedo} onClick={redo} aria-label="重做">
            ↻ 重做
          </Button>
          <Button size="small" onClick={() => openAiEdit("presentation")}>
            ✦ AI 整篇
          </Button>
          <Button size="small" onClick={() => openAiEdit("page")}>
            ✦ AI 本页
          </Button>
          <Button size="small" onClick={() => setAiInsertOpen(true)}>
            ✦ AI 生成元素
          </Button>
          <Button size="small" onClick={() => saveMutation.mutate()}>
            保存
          </Button>
          <Button size="small" onClick={() => navigate(`/presentations/${id}/play`)}>
            ▶ 播放
          </Button>
          <Button size="small" type="primary" onClick={() => setPublishOpen(true)}>
            发布
          </Button>
        </div>
      </div>

      <div className="sg-slide-editor">
        <Scrollbar className="sg-slide-list">
          <div className="sg-slide-list-head">
            <strong>页面（{pages.length}）</strong>
          </div>

          {pages.map((p, i) => (
            <div className="sg-slide-item" key={p.id}>
              {/* 分割线插入按钮：hover 出现在两个缩略图之间，对应业内“slice 间的 ＋ 插入”惯例 */}
              <button
                type="button"
                className="sg-slide-insert"
                title="在此后插入页面"
                onClick={() => insertPageAfter(i)}
              >
                <Plus size={14} />
              </button>

              <Dropdown
                trigger={["contextMenu"]}
                menu={{
                  items: [
                    { key: "dup", icon: <Copy size={14} />, label: "复制页面" },
                    {
                      key: "up",
                      icon: <ArrowUp size={14} />,
                      label: "上移",
                      disabled: i === 0,
                    },
                    {
                      key: "down",
                      icon: <ArrowDown size={14} />,
                      label: "下移",
                      disabled: i === pages.length - 1,
                    },
                    { type: "divider" },
                    { key: "del", icon: <Trash2 size={14} />, label: "删除页面", danger: true },
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.preventDefault();
                    if (key === "dup") duplicateActivePageById(p.id);
                    else if (key === "up") movePageById(p.id, -1);
                    else if (key === "down") movePageById(p.id, 1);
                    else if (key === "del") removePageById(p.id);
                  },
                }}
              >
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex === null || dragIndex === i) return;
                    const sourceId = pages[dragIndex]?.id;
                    if (sourceId) {
                      const direction = i > dragIndex ? 1 : -1;
                      const steps = Math.abs(i - dragIndex);
                      applyAst((tree) => {
                        for (let s = 0; s < steps; s++) astMovePage(tree, sourceId, direction);
                      });
                    }
                    setDragIndex(null);
                  }}
                  className={`sg-slide-thumb ${activePageId === p.id ? "active" : ""}`}
                  onClick={() => {
                    setActivePageId(p.id);
                    setSelectedIds([]);
                    // Send immediately as well as from the effect above. This
                    // keeps thumbnail navigation responsive when React batches
                    // the state update or the iframe has just finished loading.
                    postPreviewNavigation(p.id);
                  }}
                >
                  <span className="sg-slide-thumb-no">{String(i + 1).padStart(2, "0")}</span>
                  <iframe
                    title={p.title || `第 ${i + 1} 页`}
                    className="sg-slide-thumb-frame"
                    sandbox="allow-scripts allow-forms allow-popups allow-modals"
                    srcDoc={buildThumbnailSrcDoc(html, i)}
                    tabIndex={-1}
                  />
                  <span className="sg-slide-thumb-label">{p.title || "未命名"}</span>
                </button>
              </Dropdown>
            </div>
          ))}

          {/* 列表底部固定“新增页面”入口，对应业内把新增动作沉到列表底部的惯例 */}
          <button type="button" className="sg-slide-add" onClick={addPage}>
            <Plus size={15} />
            <span>新建页面</span>
          </button>
        </Scrollbar>

        <Scrollbar className="sg-slide-workarea">
          {pages.length === 0 ? (
            <div className="sg-slide-empty">
              <div className="sg-slide-empty-card">
                <h3>还没有页面</h3>
                <p>点击左侧「新建页面」开始创作，或选中已有演示后编辑。</p>
                <Button type="primary" onClick={addPage}>
                  <Plus size={14} />
                  新建页面
                </Button>
              </div>
            </div>
          ) : (
            <div className="sg-slide-stage">
              <iframe
                ref={previewRef}
                title="演示预览"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                srcDoc={buildPreviewSrcDoc(html, activePageId)}
                className="sg-slide-frame"
                onLoad={() => postPreviewNavigation(activePageId)}
              />
            </div>
          )}
          <div className="sg-editor-hint">
            <span>点击预览中的元素可选中，右侧面板实时编辑文字/图片/链接/动画。</span>
          </div>
        </Scrollbar>

        <Scrollbar className="sg-editor-right">
          <div className="sg-el-section">
            <h4>主题</h4>
            <Select
              value={theme}
              onChange={applyTheme}
              options={[
                { value: "light", label: "明亮" },
                { value: "dark", label: "深色" },
                { value: "brand", label: "商务" },
                { value: "minimal", label: "简约" },
                { value: "gradient", label: "渐变" },
              ]}
              className="sg-el-full"
            />
            <div className={`sg-el-field ${styles.paletteField}`}>
              <div className="sg-el-palette-head">
                <span className="sg-el-label">配色</span>
                {themePalette && (
                  <Button
                    size="small"
                    type="link"
                    className="sg-el-palette-reset"
                    onClick={resetThemePalette}
                  >
                    重置
                  </Button>
                )}
              </div>
              <div className="sg-el-palette-row">
                {THEME_PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    title={p.label}
                    className={`sg-el-palette ${isSamePalette(themePalette, p.palette) ? "active" : ""}`}
                    onClick={() => applyThemePreset(p.key)}
                  >
                    <span className="sg-el-palette-swatch">
                      <PaletteColorSwatch color={p.palette.background} />
                      <PaletteColorSwatch color={p.palette.surface} />
                      <PaletteColorSwatch color={p.palette.primary} />
                    </span>
                    <span className="sg-el-palette-name">{p.label}</span>
                  </button>
                ))}
                <ColorPicker
                  value={themePalette?.primary?.startsWith("#") ? themePalette.primary : "#7c5cff"}
                  onChange={(c) => applyCustomPrimary(c.toHexString())}
                >
                  <span
                    className={`sg-el-palette sg-el-palette-custom ${
                      themePalette &&
                      !THEME_PRESETS.some((p) => isSamePalette(themePalette, p.palette))
                        ? "active"
                        : ""
                    }`}
                    title="自定义主色"
                  >
                    <span className="sg-el-palette-swatch">
                      <PaletteColorSwatch color={themePalette?.background ?? "#ffffff"} />
                      <PaletteColorSwatch color={themePalette?.surface ?? "#f7f8fb"} />
                      <PaletteColorSwatch color={themePalette?.primary ?? "#7c5cff"} />
                    </span>
                    <span className="sg-el-palette-name">自定义</span>
                  </span>
                </ColorPicker>
              </div>
            </div>
          </div>

          {selectedIds.length > 0 && !(selectedIds.length === 1 && !selectedEl) ? (
            <div className="sg-el-section">
              <h4>元素配置</h4>
              {selectedIds.length > 1 ? (
                <div className="sg-el-multi-bar">
                  <p className="sg-el-empty-title">已选中 {selectedIds.length} 个元素</p>
                  <div className="sg-row sg-el-multi-actions">
                    <Button size="small" onClick={() => alignSelected("left")}>
                      左对齐
                    </Button>
                    <Button size="small" onClick={() => alignSelected("center-x")}>
                      水平居中
                    </Button>
                    <Button size="small" onClick={() => alignSelected("top")}>
                      顶对齐
                    </Button>
                    <Button size="small" onClick={() => alignSelected("middle-y")}>
                      垂直居中
                    </Button>
                    <Button size="small" onClick={duplicateSelectedElements}>
                      复制
                    </Button>
                    <Button size="small" danger onClick={deleteSelectedElements}>
                      批量删除
                    </Button>
                  </div>
                </div>
              ) : selectedEl ? (
                <ElementInspector
                  el={selectedEl}
                  onText={editText}
                  onImage={editImage}
                  onLink={editLink}
                  onAttr={editAttr}
                />
              ) : null}
            </div>
          ) : null}
        </Scrollbar>
      </div>

      {publishOpen && data && (
        <PublishDialog asset={data.asset} open onClose={() => setPublishOpen(false)} />
      )}

      <Modal
        open={aiEditOpen}
        onCancel={() => setAiEditOpen(false)}
        title={aiScope === "page" ? "AI 重写本页" : "AI 修改整篇演示"}
        footer={
          <div className="sg-row">
            <Button onClick={() => setAiEditOpen(false)}>取消</Button>
            {aiProposal == null ? (
              <Button type="primary" disabled={aiEdit.isPending} onClick={() => aiEdit.mutate()}>
                {aiEdit.isPending ? "生成中…" : "生成"}
              </Button>
            ) : (
              <Button type="primary" onClick={applyAiProposal}>
                应用修改
              </Button>
            )}
          </div>
        }
        destroyOnHidden
      >
        <div className={`sg-col ${styles.aiBody}`}>
          <div className="sg-option-row">
            <span>作用范围</span>
            <span>{aiScope === "page" ? "当前页" : "整个演示"}</span>
          </div>
          <Input.TextArea
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
            placeholder="例如：让内容更精炼、更有冲击力"
            className={styles.aiInstruction}
          />
          {aiProposal != null && (
            <div className={`sg-col ${styles.aiProposal}`}>
              <strong className={styles.aiProposalTitle}>AI 建议（应用后可用撤销回退）</strong>
              <Scrollbar as="pre" className={styles.aiProposalCode}>
                {aiProposal}
              </Scrollbar>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={aiInsertOpen}
        onCancel={() => setAiInsertOpen(false)}
        title="AI 生成元素"
        footer={
          <div className="sg-row">
            <Button onClick={() => setAiInsertOpen(false)}>取消</Button>
            <Button type="primary" disabled={aiInsert.isPending} onClick={() => aiInsert.mutate()}>
              {aiInsert.isPending ? "生成中…" : "生成并插入"}
            </Button>
          </div>
        }
        destroyOnHidden
      >
        <div className={`sg-col ${styles.aiBody}`}>
          <div className="sg-el-field">
            <span className="sg-el-label">元素类型</span>
            <Select
              value={aiInsertKind}
              onChange={setAiInsertKind}
              options={AI_INSERT_KINDS}
              className="sg-el-full"
            />
          </div>
          <Input.TextArea
            value={aiInsertInstruction}
            onChange={(e) => setAiInsertInstruction(e.target.value)}
            placeholder="描述要生成的内容，例如：一段关于 Q3 增长的三句话总结"
            className={styles.aiInsertInstruction}
          />
          <p className="sg-hint">
            将在当前页（{pages.find((p) => p.id === activePageId)?.title || "—"}
            ）末尾追加一个新元素，不影响已有内容。
          </p>
        </div>
      </Modal>
    </div>
  );
}

export function PresentationPlayback({
  html,
  title,
  onExit,
}: {
  html: string;
  title: string;
  onExit?: () => void;
}) {
  const { styles } = usePlayerStyles();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [pageNo, setPageNo] = useState<{ index: number; total: number }>({ index: 0, total: 0 });
  const [navOpen, setNavOpen] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const playerPages = useMemo(() => {
    if (!html) return [];
    try {
      return listPages(parsePresentationHtml(html));
    } catch {
      return [];
    }
  }, [html]);
  const totalPages = playerPages.length || pageNo.total;
  const playbackSource = useMemo(() => (html ? buildPlaybackSrcDoc(html) : ""), [html]);

  const goTo = useCallback(
    (index: number) => {
      if (totalPages <= 0) return;
      const next = Math.max(0, Math.min(totalPages - 1, index));
      setPageNo({ index: next, total: totalPages });
      frameRef.current?.contentWindow?.postMessage({ sg: "goto", index: next }, "*");
    },
    [totalPages],
  );

  // 键盘在播放器外层与 iframe 内都可工作；Esc 优先关闭目录，再退出播放。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (navOpen) setNavOpen(false);
        else onExit?.();
      } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        goTo(pageNo.index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goTo(pageNo.index - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(totalPages - 1);
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (e.data && e.data.sg === "page" && typeof e.data.total === "number") {
        const total = Math.max(playerPages.length, e.data.total);
        setPageNo({ index: e.data.index ?? 0, total });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
    };
  }, [goTo, navOpen, onExit, pageNo.index, playerPages.length, totalPages]);

  useEffect(() => {
    if (playerPages.length <= 0) return;
    setPageNo((current) => ({
      index: Math.min(current.index, playerPages.length - 1),
      total: playerPages.length,
    }));
  }, [playerPages.length]);

  useEffect(() => setFrameReady(false), [playbackSource]);

  if (!html) return <Empty title="加载中…" />;

  const progress = totalPages > 0 ? ((pageNo.index + 1) / totalPages) * 100 : 0;

  // 播放器渲染 HTML Artifact，并运行在独立 opaque origin 沙箱中（对应设计文档 Preview Sandbox）。
  return (
    <div className={styles.root}>
      <main className={styles.frameArea}>
        {!frameReady && <div className={styles.frameLoading}>正在准备演示画面…</div>}
        <iframe
          ref={frameRef}
          className={`sg-player-frame ${styles.frame}`}
          title={title}
          sandbox="allow-scripts allow-forms allow-popups allow-modals"
          srcDoc={playbackSource}
          onLoad={() => {
            setFrameReady(true);
            window.setTimeout(() => {
              frameRef.current?.contentWindow?.postMessage(
                { sg: "goto", index: pageNo.index },
                "*",
              );
            }, 0);
          }}
        />
      </main>

      {totalPages > 0 && (
        <div
          className={styles.progressBar}
          role="slider"
          aria-label="演示进度"
          aria-valuemin={1}
          aria-valuemax={totalPages}
          aria-valuenow={pageNo.index + 1}
          tabIndex={0}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
            goTo(Math.round(Math.max(0, Math.min(1, ratio)) * (totalPages - 1)));
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              goTo(pageNo.index + 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              goTo(pageNo.index - 1);
            }
          }}
        >
          <span className={styles.progressBarFill} style={{ width: `${progress}%` }} />
        </div>
      )}

      {totalPages > 0 && (
        <footer className={styles.dock}>
          <div className={styles.dockActions}>
            <button
              type="button"
              aria-label="打开演示目录"
              title="打开演示目录"
              aria-expanded={navOpen}
              className={styles.pagerButton}
              onClick={() => setNavOpen((open) => !open)}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              aria-label="上一页"
              title="上一页"
              className={`${styles.pagerButton} ${pageNo.index === 0 ? styles.pagerButtonDisabled : ""}`}
              disabled={pageNo.index === 0}
              onClick={() => goTo(pageNo.index - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span className={styles.pagerLabel}>
              {String(pageNo.index + 1).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
            </span>
            <button
              type="button"
              aria-label="下一页"
              title="下一页"
              className={`${styles.pagerButton} ${pageNo.index >= totalPages - 1 ? styles.pagerButtonDisabled : ""}`}
              disabled={pageNo.index >= totalPages - 1}
              onClick={() => goTo(pageNo.index + 1)}
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              aria-label="全屏播放"
              title="全屏播放"
              className={styles.pagerButton}
              onClick={() => void document.documentElement.requestFullscreen?.()}
            >
              <Maximize2 size={15} />
            </button>
          </div>
        </footer>
      )}

      {navOpen && (
        <aside className={styles.drawer} aria-label="演示目录">
          <div className={styles.drawerHead}>
            <strong className={styles.drawerTitle}>演示目录</strong>
            <button
              type="button"
              className={styles.drawerClose}
              aria-label="关闭目录"
              title="关闭目录"
              onClick={() => setNavOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
          {playerPages.length > 0 ? (
            <nav className={styles.drawerList}>
              {playerPages.map((page, index) => (
                <button
                  type="button"
                  key={page.id || index}
                  aria-current={index === pageNo.index ? "page" : undefined}
                  className={`${styles.drawerItem} ${index === pageNo.index ? styles.drawerItemActive : ""}`}
                  onClick={() => {
                    goTo(index);
                    setNavOpen(false);
                  }}
                >
                  <span
                    className={`${styles.drawerNo} ${index === pageNo.index ? styles.drawerItemActiveNo : ""}`}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.drawerItemTitle}>
                    {page.title || `第 ${index + 1} 页`}
                    <small className={styles.drawerItemLayout}>
                      {page.layout === "title"
                        ? "PHO同业APP分析"
                        : page.layout === "section"
                          ? "章节"
                          : "专题分析"}
                    </small>
                  </span>
                </button>
              ))}
            </nav>
          ) : (
            <div className={styles.emptyNav}>没有检测到可播放页面</div>
          )}
        </aside>
      )}
    </div>
  );
}

export function PresentationPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data } = useQuery<{ asset: Asset; html: string }>({
    queryKey: ["presentation", id],
    queryFn: () => api(`/presentations/${id}`),
  });
  return (
    <PresentationPlayback
      html={data?.html ?? ""}
      title={data?.asset.title ?? "演示"}
      onExit={() => navigate(-1)}
    />
  );
}

export function PresentationSnapshotPlayerPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { data } = useQuery<{ html: string; updatedAt?: string }>({
    queryKey: ["presentation-snapshot-player", taskId],
    queryFn: () => api(`/tasks/${taskId}/presentation-snapshot`),
    enabled: Boolean(taskId),
    retry: 2,
  });
  return (
    <PresentationPlayback
      html={data?.html ?? ""}
      title="生成页面快照"
      onExit={() => navigate(-1)}
    />
  );
}
