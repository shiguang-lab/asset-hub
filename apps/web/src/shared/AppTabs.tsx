import { Tabs } from "antd";
import { createStyles } from "antd-style";
import type { ReactNode } from "react";

export interface AppTabItem {
  key: string;
  label: ReactNode;
  /** 可选数字徽标（如资产页的 <em>count</em>），传 0 也渲染 */
  count?: number | string;
  disabled?: boolean;
}

export interface AppTabsProps {
  items: AppTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

/**
 * 外观样式约束（见 docs/web-style-guide.md）：
 *
 * 1. Tabs 的「主题外观」一律由 ThemeConfig.components.Tabs 的 Theme Token 驱动
 *    （apps/web/src/theme/tokens.ts），包括：字号 titleFontSize、间距
 *    horizontalItemGutter、内边距 horizontalItemPadding、nav 外边距 horizontalMargin、
 *    各态配色 itemColor / itemHoverColor / itemSelectedColor / itemActiveColor、
 *    高亮线 inkBarColor、底部边框 colorBorderSecondary。
 *    因此本组件的 createStyles 中不得重复设置这些属性，避免覆盖 Token 生效。
 *
 * 2. createStyles 只做「Tabs Theme Token 表达不了的」三件事：
 *    - 隐藏占位撑宽：选中项加粗(fontWeight 600)时宽度不变，切换不抖动
 *    - 数字徽标 <em> 的独立字号/颜色
 *    - ink-bar 圆角/高度微调（Token 只给颜色）
 *
 * 3. 注意：createStyles 回调的 token 是「全局 AliasToken」，不含组件专属 Token
 *    （如 Tabs 的 itemColor），因此这里不要依赖 Tabs 专属 token。
 */
const useStyles = createStyles(() => ({
  root: {
    // ink-bar：Token 只给颜色，这里补圆角与高度
    ".ant-tabs-ink-bar": {
      height: 2,
      borderRadius: "2px 2px 0 0",
    },
    // 本组件仅渲染 tab 头，内容由页面按 activeKey 自行渲染，隐藏 antd 空内容区
    ".ant-tabs-content-holder": {
      display: "none",
    },
    ".sg-app-tab-label": {
      display: "inline-flex",
      alignItems: "baseline",
      gap: 6,
      whiteSpace: "nowrap",
    },
    // 占位撑宽：容器宽度由隐藏的 600 字重副本决定，可见文本 400→600 切换时宽度不变（无抖动）
    ".sg-app-tab-txt-wrap": {
      position: "relative",
      display: "inline-block",
    },
    ".sg-app-tab-txt-wrap::after": {
      content: "attr(data-tab)",
      display: "block",
      fontWeight: 600,
      visibility: "hidden",
      whiteSpace: "nowrap",
    },
    ".sg-app-tab-txt-wrap > span": {
      position: "absolute",
      left: 0,
      top: 0,
      whiteSpace: "nowrap",
      transition: "font-weight 120ms ease",
    },
    ".ant-tabs-tab-active .sg-app-tab-txt-wrap > span": {
      fontWeight: 600,
    },
    // 数字徽标：独立 11px/400，选中态换紫色（用全局次级文字色兜底，Token 化见 tokens.ts）
    ".sg-app-tab-count": {
      fontStyle: "normal",
      fontSize: 11,
      fontWeight: 400,
      color: "inherit",
      opacity: 0.55,
    },
  },
}));

function TabLabel({ item }: { item: AppTabItem }) {
  const text = typeof item.label === "string" ? item.label : null;
  const body =
    text !== null ? (
      <span className="sg-app-tab-txt-wrap" data-tab={text}>
        <span>{item.label}</span>
      </span>
    ) : (
      <span>{item.label}</span>
    );
  return (
    <span className="sg-app-tab-label">
      {body}
      {item.count !== undefined && item.count !== "" && (
        <em className="sg-app-tab-count">{item.count}</em>
      )}
    </span>
  );
}

/**
 * 统一的可复用 Tabs。基于 antd Tabs，主题定制为「资产列表」同款观感
 * （主题全部由 Tabs Theme Token 驱动，见 apps/web/src/theme/tokens.ts）：
 * 13px 文字、muted 配色、hover/选中高亮、高亮线（antd ink-bar 自带滑动动画）、可选数字徽标。
 * 选中 tab 加粗但宽度恒定（隐藏 600 字重占位撑宽），切换不抖动。
 * 只渲染 tab 头；内容区由调用方按 activeKey 渲染。
 */
export function AppTabs({ items, activeKey, onChange, className }: AppTabsProps) {
  const { styles, cx } = useStyles();
  return (
    <Tabs
      className={cx(styles.root, className)}
      activeKey={activeKey}
      onChange={onChange}
      items={items.map((item) => ({
        key: item.key,
        disabled: item.disabled,
        label: <TabLabel item={item} />,
      }))}
    />
  );
}
