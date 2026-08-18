# 在线演示（Web Presentation）—— 对齐设计文档的差距分析与改造

> 依据：`design/AI_Web_Presentation_技术设计文档_V1.0.md`
> 日期：2026-08-17

## 1. 核心结论

设计文档的核心是：**「Single HTML Artifact + SG Runtime + Authoring Protocol + Validator + Visual Editor + AI Patch」**，最终交付物始终是 `presentation.html`，而非自定义 Presentation JSON DSL。

当前实现走的是**「JSON DSL（slides/blocks）+ 固定 shell 渲染」**，与设计文档的根本方向相反——设计文档「明确不做」里正好包含「自研大型 Layout DSL」「巨型 Presentation JSON Schema」。

本次改造把底座切换到设计文档方向：**HTML 是最终 Artifact，SG Runtime 统一提供运行能力，`data-sg-*` 承载编辑语义，Validator 作为安全边界**。Visual Editor 的 AST 化与 AI Patch 属后续阶段。

## 2. 现状 → 目标差距

| 维度 | 设计文档要求 | 改造前现状 | 改造后 |
| --- | --- | --- | --- |
| 最终 Artifact | 单个 `presentation.html`（HTML/CSS/JS/SVG/JSON 内联） | JSON DSL + 服务端固定 shell 渲染 | ✅ HTML Artifact（SG Runtime 内联） |
| 运行时 | SG Runtime（`SG.presentation/chart/animate/tooltip/counter`） | 每次手写内联 JS 翻页 | ✅ SG Runtime 模块化，供 api/web 共用 |
| 编辑协议 | `data-sg-page / data-sg-id / data-sg-kind / data-sg-enter / data-sg-hover` | 无 | ✅ 渲染时输出 `data-sg-*` |
| Theme | CSS Variables | 服务端硬编码色板 | ✅ CSS Variables（`--sg-*`） |
| 展示模式 | Presentation Mode + Scroll Mode | 仅 slide | ✅ `SG.presentation({mode:"slide"|"scroll"})` |
| 动画/Hover | `data-sg-enter` / `data-sg-hover` 协议 | 无 | ✅ enter 动画 + hover 协议 |
| 安全 | Validator + Sandbox + CSP + 独立 Origin | 无 | ✅ Validator（外链/危险 JS/网络）+ 播放器沙箱 iframe |
| 播放器 | 渲染 HTML Artifact | React 复刻 JSON 渲染 | ✅ 播放器改为沙箱 iframe 渲染 HTML Artifact |
| 图表 | ECharts（`SG.chart` 封装） | 无 | ⚠️ `SG.chart` API + 原生 SVG 兜底（ECharts 内联为 P1） |
| Visual Editor | AST（parse5/hast）+ Undo/Redo | React 直接改 JSON | ⏳ 未做（阶段 2） |
| AI Patch | element/page/presentation Scope + Revision/Diff | slide 级 JSON regenerate | ⏳ 未做（阶段 2） |
| Bundler | 按需内联 SG Runtime + Approved Dependencies | 无 | ⚠️ SG Runtime 全量内联（能力级 Tree Shaking 为 P1） |

## 3. 本次改造落地（阶段 1：HTML Artifact 底座）

### 3.1 SG Runtime（`packages/content/src/presentation-runtime.ts`）

导出 `SG_RUNTIME_CSS` / `SG_RUNTIME_JS`，提供：

- `SG.presentation({ mode, keyboard, touch })`：扫描 `[data-sg-page]`，slide/scroll 两种模式、键盘/触摸翻页、进度条、页码。
- `SG.chart(el, opts)`：`data-sg-kind="chart"` 的原生 SVG 柱状/折线/饼图（ECharts 内联为 P1 approved dependency）。
- `SG.counter(el, opts)`：`data-sg-counter` 数字滚动。
- `SG.tooltip(root)`：`data-sg-tooltip`。
- `data-sg-enter` 进场动画（fade / fade-up / slide / scale，IntersectionObserver）。
- `data-sg-hover` hover 协议（lift / glow / scale / border，纯 CSS）。

### 3.2 HTML 渲染（`packages/content/src/presentation.ts`）

- `renderPresentationHtml(doc, title)`：把演示渲染为单个 HTML Artifact，页面用 `<section data-sg-page>`，块用 `data-sg-id` / `data-sg-kind`，Theme 用 CSS Variables，内联 SG Runtime。
- `validatePresentationHtml(html)`：安全边界——禁外链 `<script src>`/`<link href>`、`eval`/`new Function`/`document.write`、`fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`，并要求至少一个 `data-sg-page`。

### 3.3 发布与播放

- `apps/api/src/platform/render.ts`：演示发布走 `renderPresentationHtml` + `validatePresentationHtml`（校验失败阻断发布）。
- `apps/web/src/features/presentations/presentations.tsx`：`PresentationPlayerPage` 由「React 复刻 JSON」改为「沙箱 iframe 渲染 HTML Artifact」（`sandbox="allow-scripts allow-forms allow-popups allow-modals"`，独立 opaque origin）。

## 4. 后续阶段

### 阶段 2：Visual Editor AST 化 + AI Patch（部分完成）

- ✅ 人工编辑走 Command History（Undo/Redo）：`useHistory` hook，所有编辑经 `set` 入栈，Ctrl/Cmd+Z / Shift+Z / Y 快捷键 + 工具栏按钮。
- ✅ AI 修改改为 Scope + 提案/接受/回退：后端 `POST /presentations/:id/ai-edit`（element/page/presentation 三作用域），前端 AI 弹窗（当前页/整篇）→ 预览 JSON 提案 → 应用（可撤销）。旧 slide 级 regenerate 保留为 page 作用域兼容别名。
- ✅ AST 编辑层（`packages/content/src/presentation-ast.ts`，hast 解析/序列化 + `data-sg-id` 锚点命令）：`updateTextContent / updateImageSrc / updateLinkHref / setDataAttribute / listPages / addPage / removePage / movePage / duplicatePage`，已单测（38 用例）。注意 hast-util-from-html 的 properties 为 camelCase（`dataSgId`），序列化时还原 kebab-case。
- ✅ 存储迁移：presentation 内容从 `manifest`(JSON) 改为 `html`(HTML Artifact)——outline/confirm、worker projection、internal projection、GET/PUT、发布链路全部走 HTML；发布时直接使用存储的 HTML（`buildReleaseBundle` 的 presentation 分支改为 `input.html ?? render(legacy JSON)`，去掉 slides.json 副产物）。
- ✅ 编辑器改走 HTML Artifact：页面列表/增删/排序/复制走 AST 命令（`data-sg-id` 锚点），内容用「HTML 源」编辑 + 沙箱预览，Theme 通过 CSS Variables（源内编辑），Undo/Redo 与 AI Patch 都作用于 HTML。
- ✅ 播放器直接渲染存储的 HTML Artifact（沙箱 iframe）。
- ⏳ Revision 未持久化到 DB（AI 提案由前端暂存，接受后走 PUT）；AI 编辑为「整段 HTML 进出 + scope 指令」，非结构化 Patch/Diff。

### 阶段 3：能力体系

- Capability Registry（Approved Dependency：ECharts / GSAP / Three.js 按需内联，Tree Shaking）。
- Bundler 只内联实际使用的能力。
- 图片 Asset 策略（URL 引用 vs Base64/Data URI 内联）。
- 发布后的独立域名 + 强制 CSP。

### 阶段 4：AI 生成管道

- Presentation Skill（SKILL.md + capabilities/ + profiles/ + templates/）。
- Planner → Capability Selection → HTML Generator → Validator → Repair Loop。
- Outline → Page Plan → Page Generate → Merge → Validate（复杂演示分页生成）。

## 5. 明确不做（首期）

- PPTX 作为核心数据格式。
- 完整 PowerPoint / Canva Clone、任意自由 Canvas 编辑器、任意绝对定位拖拽、Pen/Vector/Shape/Rotate、完整 Animation Timeline、Master Slide、完整 CSS Editor。
