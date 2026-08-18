---
name: presentation
description: 从文档/研究报告/数据提炼章节大纲，并据此规划、生成符合 asset-hub 规范的单文件 HTML 演示文稿（data-sg-* 协议，含视觉布局与图表）。用于 asset-hub 演示生成 Agent。
version: 1.1.0
tags:
  - presentation
  - html
  - outline
  - design
---

# 在线演示生成 Skill

为 asset-hub 生成单文件 HTML 演示（HTML Artifact）。本 Skill 覆盖从「源内容 → 章节大纲 → 页面规划 → HTML」的完整链路，遵循 `data-sg-*` Authoring Protocol，供 SG Runtime 与可视化编辑器消费。

## 何时使用

- 将文档、研究报告、数据集洞察、知识库内容转成在线演示。
- 从主题或大纲直接生成演示。
- 修改/重排已有演示页面（EDIT scope: element / page / presentation）。

## 输入

- `goal`：演示主题/标题。
- `source`：源材料（Markdown 或文本）。
- `profile`：演示类型（research / pitch / product-launch / data-story）。
- `outline`：可选的章节大纲（生成阶段输入）。

## 阶段一：大纲提炼（Outline）

从源内容提炼「章节大纲」，**不要**逐条照抄标题。参考金字塔原理（Pyramid Principle）与断言-证据法（Assertion-Evidence）：

1. 每章一个「结论先行」的断言式标题（完整句子表达观点，如「AI 正加速渗透传统行业」，而非「AI 趋势」这类标签）。
2. 每章含 2~4 个具体要点：来自正文的数据、事实、判断，禁止「背景与现状/关键数据/结论与建议」这类通用套话。
3. 尽量抽取可量化数据点（数值 + 口径/来源/时间）。
4. 章节间叙事递进：现状 → 问题 → 分析 → 结论 → 行动。
5. 每章标注视觉类型 visual：metrics（指标卡）/ chart（图表）/ two-column（对比）/ quote（金句）/ timeline（阶段演进）/ default。

章节大纲 JSON 结构：

```json
{
  "title": "演示标题",
  "theme": "light",
  "aspectRatio": "16:9",
  "sections": [
    {
      "id": "sec-1",
      "title": "断言式章节标题",
      "summary": "一句话概述",
      "points": ["要点1", "要点2"],
      "data": [{ "id": "d1", "label": "指标名", "value": "数值", "note": "口径" }],
      "visual": "metrics"
    }
  ]
}
```

## 阶段二：页面规划（Page Plan）

把章节大纲展开为具体页面，**允许 1 个章节拆成 1~3 页**（不要求 1:1）：

- 第 1 页 `title`（封面），最后 1 页 `closing`（总结）。
- 内容丰富的章节拆成「章节引言页（section）+ 内容页」。
- visual 映射：metrics → metric 块（大数字）；chart → chart 块（meta.chart 给 `{type, data, labels}`）；two-column → two-column 布局 + card；quote → quote 页；timeline → timeline 块（每行「时期：事件」）；default → heading + bullet。
- 每页标题用断言式完整句；bullet 每条 ≤ 24 字；数值必须来自大纲 data，不得编造。

## 阶段三：HTML 生成

输出完整 HTML 文档（`<!doctype html><html><head><style>…</style></head><body>…</body></html>`），不要 Markdown 代码围栏、不要解释。

- 每个页面用 `<section data-sg-page="layout" data-sg-id="page-…" aria-label="标题">` 包裹。
- 可编辑元素带稳定锚点 `data-sg-id`，按类型标注 `data-sg-kind`（`text` / `image` / `link` / `chart` / `counter` / `code-island`）。
- 图表块用 `data-sg-kind="chart"` + `data-sg-chart` JSON；运行时由 SG.chart 渲染（ECharts 或 SVG 兜底）。
- 动画用 `data-sg-enter`（fade / fade-up / slide / scale），Hover 用 `data-sg-hover`（lift / glow / scale / border）。
- `:root` 内放主题 CSS 变量（--sg-primary / --sg-background / --sg-text-primary 等）。

## 视觉设计规范（Design Guidelines）

- **布局**：封面/章节页居中大标题；内容页「标题 + 卡片/指标/图表」；避免整页堆纯文字。
- **层级**：标题（clamp 28~48px）> 指标数值（36~56px）> 正文（16~18px）；正文行高 1.7。
- **卡片化**：要点、指标、对比用卡片承载，圆角 8~24px，浅色 surface 背景 + 主色描边。
- **数据可视化**：有量化数据优先用 metric 大数字卡或 chart；图表标轴/单位/来源。
- **留白**：页面 padding 64px+，卡片间距 20~28px。
- **克制动画**：进场 fade-up（每块 stagger 60ms），Hover 用 lift；research 类演示动画克制。

## 约束

- 单文件、无外部网络依赖；图片可用外部 URL 或 `asset:<id>`。
- 结构以 `data-sg-page` 分页；正文引用遵循 `asset:<id>` 协议。
- 禁止引入未列出的第三方库、CDN、`<script src>`、`<link href>`、fetch/XHR/eval。
