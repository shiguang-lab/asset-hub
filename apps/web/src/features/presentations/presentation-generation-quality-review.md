# 演示文档生成质量审查：为什么只是"标题+列表"而非真正 PPT

## 一、结论先行

**不是 skills 不对，是生成流程不完善。** 渲染层（chart/metric/card/timeline/image/two-column）能力齐全且都写好了，但生成链路（大纲 → 展开 → HTML）没有把结构化数据传递下去、没有把 `visual` 真正映射到对应块类型，导致渲染层的丰富视觉能力被闲置——"舞台搭好了，但演员没上场"。

## 二、完整生成流程链

```
前端 presentation-new.tsx
  └─ POST /presentations/outline  {assetId, title, theme, prompt}
      │  apps/api/src/modules/presentations.ts:313-379
      ├─ 读取源文档全文 source（截$截断 40000 字符）
      ├─ LLM completeJson(buildOutlineSystemPrompt(), source)
      │    └─ 返回 {title, theme, sections:[{id,title,summary,points,visual}]}
      └─ 返回大纲给用户确认

  └─ POST /presentations/outline/confirm  {sections, ...}
      │  presentations.ts:381-453
      ├─ expandOutlineToSlides(...)  // 大纲 → slides
      │    ├─ AI 路径: LLM(buildPagePlanSystemPrompt(), outline+source)  :141-156
      │    └─ 回退路径: deterministicSlides(title, sections)             :164-239
      │    └─ 返回 slides[{id, layout, title, blocks:[{type, content, meta}]}]
      ├─ html = renderPresentationHtml(document, title)  // slides → HTML
      │    └─ packages/content/src/presentation.ts:38-75
      │        ├─ renderSlide 按 layout 分支            :77-123
      │        └─ renderSlideBlock 按 block.type 分支   :129-182（支持 12 种块）
      └─ 保存为 asset（content.text = html）
```

## 三、根因（四层，从深到浅）

### 根因 1（最核心）：大纲阶段没有提取结构化数据

- 大纲 schema（`contracts/src/index.ts:406-412`）每个 section 只有 `points: string[]`（纯文本要点）+ `visual`（类型标记），**没有结构化数据字段被填充**。
- outline prompt（`presentations.ts:44-74`）要求"量化数据直接写入要点文本"（如"营收同比增长 23%"），数据被塞进字符串，**无法被 chart 块复用**。
- 前端 `Section` 接口有 `data: unknown[]` 字段（`presentation-new.tsx:13`），但 prompt 没要求产出、confirmMutation 也没传 → **永远是空数组**。

### 根因 2：确定性回退路径只产出 bullet

- `determin8239`（`presentations.ts:164-239`）是 AI 失败时的保底路径。
- 它对 `visual=chart/metrics/two-column/quote` 只设了不同 `layout`，但 **blocks 一律是 `bullet`**（line 208-214），只有 `visual=timeline` 才产出 timeline 块。
- 即 `visual=chart` → `layout="data"` + `blocks=[bullet]` → 渲染成"标题+列表"，data 布局的专属样式几乎没用上。

### 根因 3：AI 路径受"不得编造数据"约束

- `buildPagePlanSystemPrompt`（`presentations.ts:85-123`）要求 chart 块给 `meta.chart={type,data,labels}`，但同时要求"所有数值必须来自大纲要点，不得编造"（line 98）。
- 大纲要点是文本（如"营收同比增长 23%"），**没有可结构化的数值数组** → LLM 要么不产出 chart，要么产出空数据 chart（`presentation.ts:184-189` 会从 content 文本里正则提取数字兜底，效果差）。

### 根因 4：渲染层与生成层脱节

- 渲染层（`presentation.ts` + `presentation-runtime.ts`）**能力齐全**：chart（ECharts + 原生 SVG 兜底）、metric/card/timeline/image/two-column 全支持。
- 但生成层（`expandOutlineToSlides` + `deterministicSlides`）**几乎不产出这些块** → 渲染层的丰富能力被闲置。

## 四、业内 AI PPT 产品怎么做的

| 产品 | 大纲阶段 | 展开/渲染阶段 | 视觉丰富度 |
|---|---|---|---|
| **Gamma** | LLM 产出结构化大纲：每页含 layout 建议 + 内容块类型 + 数据点 | 每页按 layout 渲染：封面/数据/对比/引用/时间轴，自动配图标+图表 | 高，每页布局不同 |
| **Tome** | LLM 产出命令式内容（标题+段落+指令），支持嵌入 chart/image | 每块按类型渲染，支持 D3 图表、Unsplash 配图 | 高 |
| **WPS AI / ChatPPT** | 大纲含"数据页/图表页"标记 + 结构化数值 | 模板引擎按页型选择布局，图表用真实数据 | 高，贴合国内汇报场景 |
| **本仓库** | 大纲只有 text points + visual 标记，**无结构化数据** | visual 只改 layout class，blocks 退化为 bullet | 低，几乎全是标题+列表 |

**核心差距**：业内在大纲阶段就提取**结构化数据**（指标值、图表数据集、对比项），展开阶段把页型**真正映射到对应块类型**并填入真实数据。本仓库两层都断了。

## 五、改进方案（待确认后实施）

### 方案 A（推荐，改生成链路，不动渲染层）

渲染层已齐全，只需让生成层"把演员送上场"。

**A1. 大纲阶段提取结构化数据**
- 改 `presentationSectionSchema`（contracts）：section 加 `data` 字段，类型为 `{ metrics?: {label,value,note}[]; chart?: {type, labels, values}; compare?: {left,right}; timeline?: {era,event}[] }`。
- 改 `buildOutlineSystemPrompt`（`presentations.ts:44-74`）：要求 LLM 为 `visual=metrics` 的 section 产出 `data.metrics`（从源文档提取真实指标值）；为 `visual=chart` 产出 `data.chart`（真实数据集 + 图表类型建议）；为 `visual=two-column` 产出 `data.compare`；为 `visual=timeline` 产出 `data.timeline`。
- 前端 `normalizeOutline` 已有 `data` 字段（之前刚补的），confirmMutation 透传 `section.data` 到展开阶段。

**A2. 展开阶段 visual → 块类型真正映射**
- 改 `deterministicSlides`（`presentations.ts:164-239`）：按 visual 产出对应块，用 section.data 填数据：
  - `visual=metrics` → 产出 `metric` 块（用 `data.metrics`）
  - `visual=chart` → 产出 `chart` 块（`meta.chart = data.chart`）
  - `visual=two-column` → 产出左右 `card` 块（用 `data.compare`）
  - `visual=quote` → 产出 `quote` 块
  - `visual=timeline` → 产出 `timeline` 块（用 `data.timeline`，已有）
  - `default` → heading + bullet（保持）
- 改 `buildPagePlanSystemPrompt`（AI 路径）：把"数值必须来自大纲要点"改为"数值必须来自 `section.data`"，并明确要求按 visual 产出对应块类型。

**A3. 放宽数据约束**
- 大纲已提取真实数据（A1），展开阶段直接用，不再需要"不得编造"的硬约束（改为"数据必须来自 section.data"）。

### 方案 B（编辑器侧补强，可选）

**B1. addPage 提供布局选择器**
- 当前 `addPage`/`insertPageAfter` 固定 `layout:"content"`（`presentations.tsx:2123-2137`）。改为弹出布局选择（封面/内容/数据/对比/引用/时间轴），按选择设 layout + 预填对应块骨架。

**B2. AI 编辑引导视觉丰富化**
- `runAiEdit`（`presentations.ts:540-594`）prompt 加视觉优化引导（"在保持数据真实的前提下，优先用 chart/metric/card 替代纯列表"），并传入源数据避免编造。

### 方案 C（长期，模板引擎化）

引入 Gamma 式的"页型模板库"：每种 layout 有 1-3 个精选模板（含背景装饰、图文位置、配色变体），展开阶段按 layout + 内容长度选模板。改动大，建议在 A/B 验证效果后再考虑。

## 六、建议实施顺序

1. **A1 + A2 + A3**（生成链路核心修复，改动集中在 `presentations.ts` prompt + `deterministicSlides` + contracts schema）—— 这是最小可行改动，直接让生成结果用上已有的渲染能力。
2. **B1**（addPage 布局选择器）—— 提升手动新建体验。
3. **B2**（AI 编辑视觉引导）—— 让用户能在编辑器里一键丰富化。
4. **C**（模板引擎化）—— 长期。

## 七、待确认事项

1. 是否按方案 A（A1+A2+A3）实施？这是核心修复，改动集中在后端 `presentations.ts` + `contracts` schema，不动渲染层。
2. 大纲阶段让 LLM 提取结构化数据（指标/图表数据集），会增加 LLM 输出 token 和耗时，是否接受？
3. `visual=chart` 时若源文档没有可提取的数值数据，是回退为 bullet 列表，还是产出占位 chart 让用户手动填数据？
4. 是否同时做 B1（addPage 布局选择器）？
5. 是否同时做 B2（AI 编辑视觉引导）？