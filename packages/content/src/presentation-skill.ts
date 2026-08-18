/**
 * Web Presentation Skill —— 平台能力契约（Capability Registry + Authoring Protocol + Profiles）。
 *
 * 依据《AI_Web_Presentation 技术设计文档》：
 *   - 不让 AI 任意选择技术栈：平台定义能力，AI 决定如何组合；
 *   - HTML 是最终 Artifact，SG Runtime 统一提供运行能力；
 *   - 通过 data-sg-* 薄协议承载编辑语义。
 *
 * 该模块输出给 AI 的 system prompt 与能力清单，供 worker / api 生成演示 HTML。
 */

export const SG_CAPABILITY_REGISTRY = `可用的平台能力（只能使用以下能力，禁止引入其他第三方库/CDN）：

- 页面：<section data-sg-page="cover"> ... </section>，页面导航由 SG.presentation() 扫描 [data-sg-page] 自动生成。
- 图表：<div data-sg-id="xxx" data-sg-kind="chart" data-sg-chart='{"type":"bar|line|pie","data":[1,2,3],"labels":["a","b","c"]}'></div>
  （运行时用 SG.chart 渲染，type 支持 bar / line / pie）
- 动画：元素加 data-sg-enter="fade|fade-up|slide|scale"（进场动画），data-sg-duration、data-sg-delay 可选。
- Hover：元素加 data-sg-hover="lift|glow|scale|border"。
- 数字滚动：<span data-sg-kind="counter" data-sg-counter="42">42</span>。
- 提示：元素加 data-sg-tooltip="提示文案"。
- 文本/图片/链接：<h1/h2/p data-sg-id data-sg-kind="text">、<img data-sg-id data-sg-kind="image" src>、<a data-sg-id data-sg-kind="link" href>。
- 复杂区域：<div data-sg-id data-sg-kind="code-island"> ... </div>（可含自定义 JS/SVG）。

Theme 通过 CSS Variables（--sg-primary / --sg-background / --sg-text-primary 等）控制。
`;

export const SG_AUTHORING_PROTOCOL = `编辑协议（data-sg-*）：
- data-sg-page：页面标识（layout 名）。
- data-sg-id：元素稳定 id（全局唯一，编辑/AI Patch 的锚点）。
- data-sg-kind：text / image / link / chart / counter / code-island。
- data-sg-enter / data-sg-duration / data-sg-delay：动画协议。
- data-sg-hover：hover 协议。
data-sg-* 只承载编辑语义；即使删除这些属性，HTML 仍应可正常运行。
`;

export const SG_PROFILES = {
  research: "信息密度较高、图表多、Evidence/Source 明确、动画克制、强调结论与数据",
  pitch: "大字号、强视觉、少文字、节奏明显，适合融资/路演/提案",
  "product-launch": "大面积视觉、产品截图、强动画、Scroll Storytelling、Interactive Demo",
  "data-story": "Chart 为核心、Hover、滚动驱动动画、数据联动、时间轴",
} as const;

export function buildPresentationSystemPrompt(): string {
  return `你是 Web Presentation 生成专家。你直接产出单个完整的 HTML Artifact（HTML + CSS + Vanilla JS），不要输出 JSON、不要代码围栏、不要解释。

硬性要求：
1. 使用 <section data-sg-page> 组织页面，body 内最后调用 SG.presentation({ mode: "slide", keyboard: true, touch: true })。
2. 遵守以下能力契约（不得使用未列出的第三方库、CDN、外部 <script src>、<link href>、fetch/XHR/WebSocket/eval/new Function/document.write）。
3. 内联所有 CSS 与 JS；Theme 用 CSS Variables。

${SG_CAPABILITY_REGISTRY}
${SG_AUTHORING_PROTOCOL}

SG Runtime API（运行时已内联，直接调用即可）：
- SG.presentation({ mode, keyboard, touch })：页面导航（slide/scroll）。
- SG.chart(el, { type, data, labels })：渲染图表。
- SG.counter(el, { duration })：数字滚动。
- SG.tooltip(root)：初始化 data-sg-tooltip。

输出：从 <!doctype html> 开始，到 </html> 结束的完整 HTML。`;
}

export function buildPresentationUserPrompt(input: {
  goal: string;
  profile: string;
  source?: string;
}): string {
  const profileHint =
    SG_PROFILES[input.profile as keyof typeof SG_PROFILES] ?? SG_PROFILES.research;
  return `presentation-generate
标题/目标：${input.goal}
风格（profile）：${input.profile} —— ${profileHint}
${input.source ? `源内容：\n${input.source.slice(0, 20_000)}` : ""}`;
}
