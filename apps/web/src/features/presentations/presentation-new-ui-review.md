# 新建在线演示 UI 审查报告

审查对象：`apps/web/src/features/presentations/presentation-new.tsx`
审查日期：2026-08-22

---

## 一、用户反馈的问题

### 问题 1：「新建在线演示」标题不应显示

- **位置**：`presentation-new.tsx:230`
- **现状**：页面顶部渲染 `<h1 className="sg-h1 sg-mb">新建在线演示</h1>`。
- **原因**：该页面已通过面包屑（`layout.tsx:179`）和步骤条标识当前流程，顶部 H1 标题冗余，占用纵向空间。
- **建议**：删除第 230 行的 `<h1>`，保留步骤条作为页面唯一导航标识。

### 问题 2：选择文档的下拉框无法显示较长的文档名

- **位置**：`presentation-new.tsx:317-325`
- **现状**：
  ```tsx
  <Select
    value={assetId}
    onChange={setAssetId}
    options={[
      { value: "", label: "选择来源文档…" },
      ...docAssets.map((a) => ({ value: a.id, label: a.title })),
    ]}
    style={{ maxWidth: 300 }}
  />
  ```
- **问题**：
  1. `maxWidth: 300` 限制了下拉框触发器宽度，长文档名被截断且无 tooltip。
  2. 未设置 `showSearch`，文档数量多时无法按关键字过滤定位。
  3. 未设置 `optionFilterProp` / `optionRender`，长文本在弹出层中也可能被省略。
- **建议**：
  - 移除 `maxWidth: 300`，改为弹性宽度（如 `flex: 1` 或 `width: "100%"`），让下拉框在表单行中占据合理空间。
  - 增加 `showSearch`、`optionFilterProp="label"`、`placeholder="搜索或选择来源文档…"`。
  - 可选：设置 `listHeight={256}` 增大弹出层高度；用 `optionRender` 或 `label` 自定义渲染，对超长文本加 `title` 属性实现原生 tooltip。

### 问题 3：不支持输入生成大纲的用户提示词

- **位置**：`presentation-new.tsx:120-133`、`316-351`
- **现状**：
  - 状态仅有 `assetId / title / theme / outline`，**没有 `prompt` 状态**。
  - 生成大纲请求体（第 132 行）为 `{ assetId, title, theme }`，**未携带任何用户指令**。
  - 表单中仅有"演示标题" Input（第 326-331 行），无独立的提示词/指令输入框。
- **影响**：用户无法表达"侧重财务数据"、"面向高管汇报"、"精简到 5 页"等生成意图，AI 大纲可控性不足。
- **建议**：
  - 新增 `prompt` 状态，并从 URL `?topic=` 读取初值（`assistant.tsx:41` 已传入 `topic` 但当前被丢弃）。
  - 在表单中新增 `Input.TextArea`，placeholder 如"补充生成要求，例如：侧重财务数据、面向高管、控制在 6 页以内"。
  - 将 `prompt` 加入 `/presentations/outline` 请求体（需后端配合接收 `prompt` 字段；前端先传，后端未用时也不影响现有逻辑）。

### 问题 4：表单过于紧凑，未充分利用页面空间

- **位置**：`presentation-new.tsx:316-351`
- **现状**：来源文档 Select、演示标题 Input、主题 Select、生成按钮全部挤在同一个 `sg-row`（单行）内，且各自设置 `maxWidth: 300 / 260 / width: 120`，控件窄小、标签缺失、视觉拥挤。
- **问题**：
  1. 控件无 `<label>`，用户只能靠 placeholder 猜测字段含义。
  2. 单行排列在宽屏下左右大量留白，控件本身却很窄，空间利用率低。
  3. 生成按钮与表单控件混在同一行，缺少视觉层次。
- **建议**：
  - 将表单改为多行/网格布局（如 `sg-grid` 两列或三列），每个字段配 `<label>` 文案。
  - 控件宽度改为弹性（`width: "100%"`），由网格控制列宽。
  - "生成大纲"按钮单独一行或放在表单卡片底部右对齐，与表单字段分离。
  - 适当增加卡片内边距与字段间距，提升呼吸感。

---

## 二、审查中发现的额外问题

### 问题 5：`?topic=` 与 `?template=` URL 参数未被消费

- **位置**：`presentation-new.tsx:119`
- **现状**：仅读取 `params.get("asset")`，未读取 `topic` / `template` / `source`。
- **影响**：
  - `assistant.tsx:41` 跳转 `?topic=...`，用户在 AI 助手输入的主题被静默丢弃。
  - `templates.tsx:23` 跳转 `?template=...`，模板选择被丢弃。
  - `presentations.tsx:319` 跳转 `?source=document`，来源模式被丢弃。
- **建议**：在初始化状态时读取这些参数：`topic` → `prompt`（或 `title`），`template` → 预填标题/主题，`source` → 预选来源模式。

### 问题 6：Step 1 来源卡片未区分来源类型

- **位置**：`presentation-new.tsx:252-265`
- **现状**：4 张卡片（从文档/从报告/从模板/AI 智能生成）的 `onClick` 全部是 `setStep(2)`，未记录用户选择的来源模式。
- **影响**：Step 2 无法根据来源模式做差异化引导（例如"从报告"应默认筛选 report 类型、"AI 智能生成"应隐藏文档下拉框并聚焦提示词输入）。
- **建议**：新增 `sourceMode` 状态，卡片 onClick 时 `setSourceMode(mode); setStep(2)`，Step 2 根据 `sourceMode` 调整表单字段显隐与默认值。

### 问题 7：`recentAssets` 未按"最近使用"语义排序

- **位置**：`presentation-new.tsx:170`
- **现状**：`recentAssets = (assets?.items ?? []).slice(0, 4)`，直接取前 4 条，依赖接口返回顺序。
- **影响**：展示的未必是真正最近使用的资产，与"最近使用"标题语义不符。
- **建议**：若资产对象有 `updatedAt` / `lastUsedAt` 字段，按其降序排序后取前 4 条；否则将标题改为"资产"避免误导。

---

## 三、建议修复优先级

| 优先级 | 问题 | 说明 |
|---|---|---|
| P0 | 问题 1（删除标题） | 改动小、收益明确 |
| P0 | 问题 4（表单布局宽松化） | 用户明确反馈，核心体验 |
| P0 | 问题 2（下拉框长文本+搜索） | 用户明确反馈，核心功能可用性 |
| P1 | 问题 3（新增提示词输入） | 需前后端配合，前端可先落地 |
| P1 | 问题 5（消费 URL 参数） | 与问题 3 关联，修复后助手入口才生效 |
| P2 | 问题 6（来源模式区分） | 体验优化，可后续迭代 |
| P2 | 问题 7（最近使用排序） | 数据语义修正，可后续迭代 |

---

## 四、待确认事项

1. **问题 3**：后端 `/presentations/outline` 接口是否已支持 `prompt` 字段？若暂未支持，前端是否先传字段（后端忽略不影响现有逻辑）？
2. **问题 6**：是否需要在本轮一并实现来源模式区分，还是后续迭代？
3. **问题 7**：资产对象是否有 `updatedAt` / `lastUsedAt` 等可排序字段？

请确认上述问题与修复范围后，我再开始实施修复。