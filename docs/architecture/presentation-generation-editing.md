# 在线演示：自由生成与编辑态编译

## 目标

复杂演示不再被固定 `SlideBlock` 或页面模板限制。AI 先自由生成单文件 HTML/CSS/SVG/图表，平台再把结果编译为带稳定锚点的可编辑 Artifact。

## 两阶段管线

```text
源内容 → AI 自由设计 HTML → HTML 安全/视觉校验
                         ↓
                 Deterministic Instrumenter
                         ↓
                 AI Semantic Annotator
                         ↓
                 data-sg-* + Edit Manifest
                         ↓
                 预览 / 局部编辑 / 发布
```

第一阶段只约束安全、来源和运行协议，不限制视觉版式。AI 可以使用 CSS Grid/Flex/absolute、SVG、图表、表格和自定义装饰。

第二阶段不重排页面，只识别并标注元素：

- `data-sg-id`：稳定编辑锚点
- `data-sg-kind`：text / image / chart / table / metric / counter / code-island
- `data-sg-editable`：元素或 custom-region 是否可编辑
- `data-sg-role`：title / summary / source / chart / table / decoration 等语义
- `data-sg-group`：组合编辑边界
- `data-sg-enter` / `data-sg-delay` / `data-sg-duration`：动画参数

## 为什么不直接只用结构化 JSON

固定 JSON 适合简单页面和可靠编辑，但无法表达 AI 自由设计的复杂组合版式。当前结构化路径继续保留，作为旧数据和大纲确认流程的兼容路径；“直接生成高保真演示”使用 HTML-first 路径。

## 编辑原则

- 文本、图片、图表、表格、指标和动画走元素级 patch。
- 自定义 SVG/复杂视觉识别为 `custom-region`，允许整体移动、缩放和 AI 局部重做。
- AI 局部编辑只返回 patch，不重写整份演示。
- 任何 patch 经过 AST、来源、安全和视觉校验后才保存。

## 实现位置

- `packages/content/src/presentation-instrument.ts`：确定性锚点编译器和 AI 语义标注合并器。
- `apps/worker/src/workflows/presentation.ts`：自由 HTML → 编译 → ECharts 注入 → 语义标注 → 校验。
- `apps/web/src/features/presentations/presentation-new.tsx`：高保真直达生成入口。
- `packages/content/src/presentation-ast.ts`：编辑器使用的 AST 操作和元素枚举。
