import type { TableProps } from "antd";
import { Table } from "antd";
import { createStyles } from "antd-style";

/**
 * 外观样式约束（见 docs/web-style-guide.md 3.3.1）：
 *
 * 1. Table 的「主题外观」一律由 ThemeConfig.components.Table 的 Theme Token 驱动
 *    （apps/web/src/theme/tokens.ts）：表头背景/文字、行 hover、选中行、边框、字号、
 *    cell padding、圆角等。因此本组件的 createStyles 中不得重复设置这些属性。
 *
 * 2. createStyles 只做「Table Theme Token 表达不了的」结构修正：
 *    - antd Table 默认是「卡片式」容器（带圆角、外边框、分割线），这里还原为扁平
 *      通栏表格：去掉容器圆角/边框，行与行之间仅保留下边框，无分隔列线。
 *    - 本组件默认不带 antd 的分页外框，分页由调用方自行控制（与既有页面一致）。
 */
const useStyles = createStyles(() => ({
  root: {
    // 容器：扁平通栏，去掉 antd 默认卡片圆角/外框
    ".ant-table": {
      background: "transparent",
      borderRadius: 0,
    },
    ".ant-table-container, .ant-table-content, .ant-table-tbody > tr > td": {
      borderStartStartRadius: 0,
      borderStartEndRadius: 0,
    },
    // 表头：与资产页表头观感一致（背景/文字色由 Token 提供，这里补粘性与无边框处理）
    ".ant-table-thead > tr > th": {
      fontWeight: 500,
      whiteSpace: "nowrap",
    },
    ".ant-table-thead > tr > th::before": {
      display: "none",
    },
    // 行 hover 由 Token rowHoverBg 控制；文本截断由各列 ellipsis 属性自行控制
    // 不在此处设置 whiteSpace: nowrap，否则会导致行高按单行文本计算，裁剪高内容（如缩略图）
    // 表格本体不渲染内部分页（pagination=false），无额外影响
    ".ant-table-pagination.ant-pagination": {
      margin: "12px 0 0",
    },
  },
}));

export type AppTableProps<RecordType extends object = Record<string, unknown>> =
  TableProps<RecordType>;

/**
 * 统一的可复用 Table。基于 antd Table，主题定制为「资产列表」同款暗色扁平表格观感
 * （主题全部由 Table Theme Token 驱动，见 apps/web/src/theme/tokens.ts）：
 * 表头 muted 背景、行 hover 高亮、下边框分隔、紧凑 cell、支持 rowSelection / onRow / render 列等。
 * 所有页面统一使用本组件，禁止再写原生 <table> 或新建 sg-*-table 全局样式。
 */
export function AppTable<RecordType extends object = Record<string, unknown>>(
  props: AppTableProps<RecordType>,
) {
  const { styles, cx } = useStyles();
  return <Table<RecordType> {...props} className={cx(styles.root, props.className)} />;
}

export default AppTable;
