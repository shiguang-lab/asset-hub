# 在线 H5 演示生成最佳实践方案

> 状态：P0/P1 已落地，P2 渲染后质量预检与素材资产协议已落地，P3 已完成线上浏览器 smoke QA；自动化截图/多模态审查仍需接入浏览器运行器  
> 日期：2026-08-23  
> 目标：把文档、研究报告和数据源转换为真正具有叙事、数据表达和视觉节奏的在线 H5 演示。

## 1. 结论

在线演示不是“把文档按目录切成页面”，也不是“摘要后把每段文字放进卡片”。它是一次面向特定受众的重新表达：

```text
源材料
  → 事实与证据抽取
  → 观点和叙事重组
  → 页面功能规划
  → 视觉编码与版式选择
  → 图片/图表/图解编排
  → H5 渲染
  → 截图级视觉审查与修复
```

当前项目的 HTML Artifact、`data-sg-*` 协议、沙箱播放器和 AST 编辑器可以继续使用；本轮已重构生成编译器的核心契约、证据补全、视觉块映射、稳定布局变体和静态质量门禁，并增加渲染后 HTML 视觉预检。线上生产环境已完成容器级健康检查、公网 HTTPS 检查和编辑器/演示入口的浏览器 smoke QA。素材搜索/生成代理以及可在 CI 中逐页运行的浏览器截图/多模态审查仍需接入专用浏览器运行器。

## 2. 设计目标与非目标

### 2.1 目标

- 面向受众和目的生成叙事，而不是复述源文档目录。
- 每页有一个明确的核心信息（message）。
- 定量事实优先转成 KPI、图表或对比结构；没有可靠数据时不伪造图表。
- 页面在 Scroll 和 Presentation 两种 H5 模式下都可用。
- 视觉由布局系统、素材系统和图表系统共同完成。
- 所有关键事实和外部素材可回溯到来源。
- 生成后必须经过截图级 QA 和修复。

### 2.2 非目标

- 首期不做完整 PowerPoint/Canva Clone。
- 不把 LLM 生成的任意 CSS 当作长期版式系统。
- 不为了填满页面而增加无意义的装饰、伪数据或过多动画。
- 不把每个文档章节强行映射为一个页面。

## 3. 业内实践的共同结论

从 Gamma、Beautiful.ai、Canva 的公开产品能力以及近年的演示生成研究可以归纳出五点：

1. **先形成故事，再生成页面。** Gamma 的 Agent 流程允许导入多种来源、回答澄清问题、共同调整 outline，再按风格生成；不同风格会同时改变布局和写作方式。[Gamma Create with Agent](https://help.gamma.app/en/articles/15002203-how-do-i-create-with-agent)
2. **页面是功能类型，不是空白文本框。** Beautiful.ai 使用 Smart Slides，根据页面功能自动对齐、缩放、更新图表和动画。[Beautiful.ai Smart Slides](https://www.beautiful.ai/smart-slides)
3. **布局、数据图表和图片素材是不同能力。** Canva Magic Design 负责根据内容推荐模板，Magic Charts 和 Magic Media 分别负责数据可视化和媒体素材。[Canva Magic Design](https://www.canva.com/help/use-magic-design/) [Canva AI Presentations](https://www.canva.com/create/ai-presentations/)
4. **必须渲染后再审查。** PreGenie 采用初次生成、渲染、审查、重新生成的闭环；研究结果指出，直接从长文档生成平铺摘要会缺少叙事和视觉一致性。[PreGenie](https://aclanthology.org/2025.findings-emnlp.165/) [Multi-Staged Slide Generation](https://aclanthology.org/2024.inlg-main.18/)
5. **设计应先于代码，质量需分维度评估。** DeepSlides 把页面设计与实现解耦；PPTAgent 同时评价 Content、Design、Coherence；受众和演讲时长也应作为生成条件。[DeepSlides](https://aclanthology.org/2026.findings-acl.1524/) [PPTAgent](https://aclanthology.org/2025.emnlp-main.728/) [Persona-Aware Slides](https://aclanthology.org/2024.eacl-long.163/)

## 4. 目标架构

```text
Source Ingestion
  ├─ 文档解析（Markdown/Word/PDF/HTML）
  ├─ 表格与数字抽取
  ├─ 图片与图表抽取
  └─ 来源定位与可信度
        ↓
Evidence Graph
  ├─ claims（判断）
  ├─ metrics（单值指标）
  ├─ series（时间/类别序列）
  ├─ comparisons（对比关系）
  ├─ quotes（引用）
  ├─ entities（实体）
  └─ assets（图片/附件）
        ↓
Narrative Planner
  ├─ audience / purpose / duration
  ├─ thesis（总论点）
  ├─ story arc（叙事弧线）
  └─ slide messages（逐页观点）
        ↓
Visual Planner
  ├─ visual type（KPI/Chart/Timeline/Process/Image/...）
  ├─ chart specification
  ├─ asset brief
  ├─ layout family + variant
  └─ density / responsive constraints
        ↓
Asset Composer + Layout Compiler
  ├─ 图片搜索/生成/裁切
  ├─ 图表生成
  ├─ 图解与流程组件
  └─ SG HTML Artifact
        ↓
Render + Visual QA
  ├─ 每页截图
  ├─ 溢出/重叠/空白检测
  ├─ 文本密度/标题换行检测
  ├─ 图表与来源校验
  ├─ 连续页面相似度检测
  └─ 修复后重新渲染
```

## 5. 核心数据契约

### 5.1 Evidence：事实不应只存在于字符串

```ts
type Evidence = {
  id: string;
  kind: "claim" | "metric" | "series" | "quote" | "entity" | "image";
  label: string;
  text?: string;
  value?: number;
  unit?: string;
  period?: string;
  labels?: string[];
  values?: number[];
  sourceRef: string;
  confidence: number;
};
```

示例：

```json
{
  "id": "ev-revenue-2025",
  "kind": "metric",
  "label": "收入同比增长",
  "value": 38,
  "unit": "%",
  "period": "2025",
  "sourceRef": "document#section-4",
  "confidence": 0.98
}
```

### 5.2 StoryPlan：逐页表达观点

```ts
type StoryPlan = {
  title: string;
  audience: "executive" | "customer" | "investor" | "team" | "general";
  purpose: "inform" | "persuade" | "teach" | "report" | "launch";
  durationMinutes?: number;
  thesis: string;
  slides: StorySlide[];
};

type StorySlide = {
  id: string;
  role:
    | "cover"
    | "thesis"
    | "problem"
    | "evidence"
    | "comparison"
    | "process"
    | "case"
    | "implication"
    | "action"
    | "closing";
  message: string;
  evidenceIds: string[];
  visualType: VisualType;
  sourceRefs: string[];
};
```

页面标题必须是观点或结论，例如“留存才是增长瓶颈”，而不是“用户增长情况”。

### 5.3 VisualBrief：视觉由数据和观点共同决定

```ts
type VisualType =
  | "hero"
  | "big-number"
  | "chart"
  | "comparison"
  | "timeline"
  | "process"
  | "quote"
  | "image-caption"
  | "case-study"
  | "architecture"
  | "text-only";

type VisualBrief = {
  type: VisualType;
  chart?: {
    chartType: "line" | "bar" | "stacked-bar" | "area" | "donut" | "scatter";
    labels: string[];
    values: number[] | number[][];
    unit?: string;
    highlightIndex?: number;
  };
  image?: {
    query: string;
    aspectRatio: string;
    focalPoint: "left" | "center" | "right";
    sourcePolicy: "provided" | "search" | "generate";
  };
  density: "sparse" | "balanced" | "dense";
};
```

## 6. 文档到故事的生成规则

### 6.1 不按目录切页

目录只用于建立主题范围。生成器必须重新回答：

- 这份演示的核心结论是什么？
- 哪些事实是证据，哪些只是背景？
- 哪些章节应该合并或删掉？
- 受众在 30 秒、3 分钟和 10 分钟时分别需要知道什么？
- 哪些内容必须可视化？
- 哪些内容适合进入 speaker notes，而不应放到页面上？

### 6.2 推荐的故事弧线

根据 profile 选择叙事，不强制所有演示使用同一结构：

```text
研究汇报：问题 → 现状 → 证据 → 解释 → 结论 → 建议
产品发布：场景 → 痛点 → 产品 → 关键能力 → 证明 → CTA
融资路演：机会 → 痛点 → 方案 → 市场 → 增长 → 商业模式 → 融资用途
数据故事：异常 → 分解 → 趋势 → 原因 → 预测 → 行动
内部汇报：目标 → 进展 → 偏差 → 原因 → 决策 → Owner
```

### 6.3 每页一个主要观点

建议每页输出：

```text
message：页面希望观众记住的一句话
evidence：支持 message 的事实
visual：最适合表达证据的视觉形式
supporting copy：最多 2~4 条辅助文字
```

如果一个页面同时有三个互不相关的观点，应拆页或重新组织。

## 7. 数据与图表策略

### 7.1 图表选择规则

| 证据形态 | 默认视觉 | 说明 |
|---|---|---|
| 单个关键指标 | Big Number | 同时展示口径、时间和变化 |
| 时间序列 | Line / Area | 突出趋势和拐点 |
| 类别比较 | Horizontal Bar | 类别多时优先横向条形图 |
| 构成关系 | Stacked Bar / Donut | 只在总量和组成都重要时使用 |
| 阶段进度 | Timeline / Gantt | 同时表达顺序和时间 |
| 方案步骤 | Process | 节点数量控制在 3~6 个 |
| 两种方案差异 | Comparison | 左右结构必须有共同维度 |
| 两个变量关系 | Scatter | 需要足够数据点，不能用两三个点伪造 |

### 7.2 数据可信度规则

- 所有数字必须关联 `sourceRef`。
- 文档没有数据时，不生成带数字的图表。
- 只有一个指标时，不强行画柱状图。
- 图表标题直接表达发现，例如“留存率在第三个月后明显下滑”，而不是“留存率趋势图”。
- 图表必须显示单位、时间范围和来源。
- 数据不足时可以生成“待补数据”的编辑占位，但不能用 `[1,2,3]` 等默认数据发布。

## 8. H5 页面和布局系统

### 8.1 页面布局族

首期建议实现 12 个布局族，每个布局族 2~3 个变体：

```text
hero
thesis
big-number
chart-story
comparison
timeline
process
quote
image-caption
case-study
architecture
closing
```

### 8.2 布局槽位

布局不是一张静态图片，而是带约束的槽位：

```ts
type LayoutSpec = {
  id: string;
  family: string;
  slots: Array<{
    id: string;
    kind: "text" | "image" | "chart" | "metric" | "card";
    required: boolean;
    maxChars?: number;
  }>;
  densityBudget: {
    maxChars: number;
    maxBullets: number;
    minVisualArea: number;
  };
};
```

### 8.3 H5 双模式

- `scroll`：允许页面按内容自然增长，适合案例、流程和长图解。
- `slide`：固定 16:9，适合会议演示；内容超出时必须换布局或拆页，而不是缩小字号。
- 相同的 `StorySlide` 通过不同 layout variant 渲染，不能维护两套内容。

### 8.4 视觉节奏

一个 8~12 页演示可以参考：

```text
1 页封面
1 页总论点/问题
2~3 页证据型页面
1~2 页图表或对比
1 页过程/方案
1 页案例或图片叙事
1 页结论
1 页行动/CTA
```

不是所有页都要有图片，但不能所有页都只有标题和列表。

## 9. 素材系统

素材分为三类：

1. **用户素材**：文档中的图片、产品截图、品牌 Logo、数据表。
2. **检索素材**：允许联网检索时获取，并记录 URL、作者、许可和下载时间。
3. **生成素材**：根据 `image brief` 通过 ImageGen 生成，并记录 prompt 和生成版本。

图片进入页面前应完成：

```text
比例匹配 → 构图/焦点检查 → 裁切 → 清晰度检查 → 来源记录
```

运行时不应依赖不可控的外链；发布时应将批准的素材存入资产系统或以内联形式打包。

## 10. 质量评估与修复

### 10.1 结构质量

- 叙事是否有总论点？
- 页间是否有因果、递进或对比关系？
- 是否有重复页面？
- 是否存在“背景很多、结论很少”的问题？

### 10.2 内容质量

- 数字是否来自源材料？
- 图表是否与标题表达同一个结论？
- 是否把可视化内容误写成列表？
- 是否超出受众和时长？

### 10.3 视觉质量

- 每页是否有主视觉层级？
- 是否连续使用同一 silhouette？
- 标题是否意外换行？
- 是否有空图、溢出、重叠、模糊图片？
- 文本和视觉的面积比例是否合理？

### 10.4 建议的硬门槛

```text
10 页中至少 5 页包含非纯文本视觉
单页最多 4 条 bullet
连续两页不能使用相同布局变体
所有图表都必须有 labels + data + source
所有指标都必须有单位或口径
不能出现空图表、默认伪数据或缺失图片
必须完成逐页截图渲染
```

## 11. 与当前代码的迁移关系

### 保留

- `presentation.html` 作为 H5 Artifact。
- `data-sg-page / data-sg-id / data-sg-kind` 协议。
- `SG.presentation`、`SG.chart` 和沙箱 iframe。
- AST 编辑和页面级撤销能力。

### 重构

- `presentationSectionSchema`：增加结构化数据和证据引用。
- `expandOutlineToSlides`：改为 `StoryPlan → VisualPlan → LayoutPlan`。
- `renderPresentationHtml`：从固定 block renderer 变为 layout registry compiler。
- `presentation-skill.ts`：加入 audience、purpose、duration、sourceRef、visualBrief 和 QA 约束。
- worker：加入截图渲染、多模态审查和 repair loop。

### 新增模块建议

```text
packages/content/src/presentation-evidence.ts
packages/content/src/presentation-qa.ts
packages/content/src/presentation-story-planner.ts
packages/content/src/presentation-visual-planner.ts
packages/content/src/presentation-layouts.ts
packages/content/src/presentation-quality.ts
apps/worker/src/workflows/presentation-assets.ts
apps/worker/src/workflows/presentation-qa.ts
```

## 12. 分阶段实施计划

### P0：生成语义修复

- 增加 `Evidence` 和结构化 section data。
- 让 sourceText 在确认阶段完整透传。
- 将 `metrics/chart/two-column/quote` 映射为真实 block。
- 删除默认伪图表数据。
- 增加单元测试，验证每种 visual 都能产生对应 block。

### P1：故事规划和布局注册表

- 新增 `StoryPlan`、`VisualBrief`、`LayoutSpec`。
- 建立 12 个布局族和 2~3 个变体。
- 增加 audience/purpose/duration 输入。
- 增加“连续页面不能相同”的结构校验。

### P2：素材与数据能力

- 已落地表格/数字抽取和图表推荐的 deterministic fallback。
- 已落地渲染后 HTML 视觉预检：图表数据、图片 src、来源定位、文字密度、重复布局和视觉覆盖率。
- 已落地 `PresentationAsset` 资产协议、`asset:` 引用重写和图片来源策略；产品截图、Logo 和用户资产可在生成结果中保留来源定位。
- 图片检索、ImageGen、裁切和来源自动填充仍需接入素材服务；没有可靠素材时继续保持保守占位，不伪造 URL。

### P3：视觉 QA 闭环

- 已提供 `pnpm presentation:qa <presentation.html>` 本地预检入口。
- 已完成线上首页、在线演示新建入口和已有 12 页 H5 演示编辑器的浏览器 smoke QA；页面可加载、iframe 预览可渲染、缩略图和编辑操作区可见。
- 自动化逐页截图、浏览器级溢出/重叠检测和多模态页面审查需要接入可在 CI 运行的浏览器运行器后再作为发布门禁。
- 失败页面定向修复，不重新生成整篇。

### P4：编辑器增强

- 让用户替换布局而不破坏内容语义。
- 让用户在图表、图片、指标和文本之间切换。
- AI 编辑支持“强化视觉”“压缩文字”“改成数据故事”等明确操作。

## 13. 验收标准

一个合格的 H5 演示至少应满足：

1. 用户只提供文档时，系统仍能生成独立的叙事主线。
2. 页面标题大多数是结论句，而不是章节名。
3. 有数据的内容会自动产生合理图表或 KPI。
4. 无数据的内容不会生成伪图表。
5. 页面之间有明显的视觉节奏变化。
6. Scroll 和 Presentation 模式都不溢出。
7. 每个数字、图表和外部素材都能回溯来源。
8. 生成结果经过截图级检查后才进入可发布状态。
