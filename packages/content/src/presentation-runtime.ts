/**
 * SG Runtime —— Web Presentation 标准运行时。
 *
 * 依据《AI_Web_Presentation 技术设计文档》：
 *   - 最终 Artifact 是单个 presentation.html；
 *   - AI 只组合平台能力，运行时由 SG Runtime 统一提供；
 *   - 通过 `data-sg-*` 薄协议承载编辑语义（Page / Text / Image / Chart / Code Island / enter / hover）。
 *
 * 该模块导出可内联进 HTML 的 CSS / JS 字符串，供 api（发布打包）与 web（预览沙箱）共用。
 */

export const SG_FIXED_STAGE_CSS = /* css */ `
/* SG fixed-stage contract: author every slide at 1920×1080 and scale the whole page. */
html, body {
  width: 100%;
  height: 100%;
  margin: 0;
}
html[data-sg-runtime-ready="1"][data-sg-mode="slide"],
html[data-sg-runtime-ready="1"][data-sg-mode="slide"] body {
  overflow: hidden;
}
html[data-sg-runtime-ready="1"][data-sg-mode="slide"] body { position: relative; }
html[data-sg-runtime-ready="1"][data-sg-mode="slide"] [data-sg-page] {
  position: absolute !important;
  inset: 0 auto auto 0 !important;
  width: 1920px !important;
  min-width: 1920px !important;
  max-width: 1920px !important;
  height: 1080px !important;
  min-height: 1080px !important;
  max-height: 1080px !important;
  overflow: hidden !important;
  transform-origin: 0 0 !important;
  box-sizing: border-box !important;
}
html[data-sg-mode="slide"][data-sg-runtime-ready="1"] [data-sg-page] { display: none; }
/* Legacy compatibility only: old artifacts used data-sg-enter as a platform
   animation protocol. New AI-authored animations do not use this attribute. */
[data-sg-enter] {
  opacity: 1 !important;
  visibility: visible !important;
  transform: none !important;
  animation: none !important;
}
.sg-speaker-notes {
  display: none !important;
}
@media print {
  html, body { width: 1920px; height: auto; overflow: visible; }
  [data-sg-page] {
    position: relative !important;
    display: flex !important;
    transform: none !important;
    break-after: page;
    page-break-after: always;
  }
}
`;

/**
 * Static-state override used only by the editor and render/slice workers.
 * Playback never enables data-sg-static, so AI-authored CSS animations remain
 * untouched in the final HTML. The editor first seeks finite animations to
 * their terminal state and commits the computed styles, then this rule keeps
 * later edits from restarting animations or transitions. The legacy
 * data-sg-enter rule is only a safety net for old artifacts.
 */
export const SG_STATICIZE_CSS = /* css */ `
html[data-sg-static="1"] [data-sg-page],
html[data-sg-static="1"] [data-sg-page] *,
html[data-sg-static="1"] [data-sg-page] *::before,
html[data-sg-static="1"] [data-sg-page] *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  animation-fill-mode: forwards !important;
  animation-play-state: running !important;
  transition: none !important;
  /* AI-authored animation classes often carry an inline opacity:0 while
     waiting for their keyframes to run. Static review must capture the
     composed end state, even when the renderer also prefers reduced motion;
     inline styles otherwise win over the reduced-motion rule and leave
     charts/sections invisible in audit screenshots. */
  opacity: 1 !important;
  visibility: visible !important;
}
html[data-sg-static="1"] [data-sg-page] [data-sg-enter] {
  opacity: 1 !important;
  visibility: visible !important;
  transform: none !important;
}
`;

export const SG_RUNTIME_CSS = /* css */ `
:root {
  --sg-primary: #7c5cff;
  --sg-accent: #6d5dfc;
  --sg-background: #ffffff;
  --sg-surface: #f7f8fb;
  --sg-text-primary: #172033;
  --sg-text-secondary: #667085;
  --sg-radius-sm: 8px;
  --sg-radius-md: 16px;
  --sg-radius-lg: 24px;
  --sg-font-title: 64px;
  /* Body copy has to stay legible when a 1920×1080 stage is shown full screen.
     Anything below 22px is what the render audit rejects as too small, and the
     template renderer must not ship text that the AI path would fail. */
  --sg-font-body: 22px;
  --sg-transition: 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
  color: var(--sg-text-primary);
  background: var(--sg-background);
  -webkit-font-smoothing: antialiased;
  background-image: linear-gradient(color-mix(in srgb, var(--sg-text-secondary) 5%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--sg-text-secondary) 5%, transparent) 1px, transparent 1px);
  background-size: 72px 72px;
}

/* ---- 页面 ---- */
[data-sg-page] {
  display: flex;
  min-height: 1080px;
  width: 100%;
  padding: 64px 96px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  position: relative;
}
/* 元素自由定位（Visual Editor 写入 data-sg-x / data-sg-y / data-sg-w / data-sg-h / data-sg-z / data-sg-rot，由 SG_RUNTIME_JS 应用为 CSS 变量） */
[data-sg-x] { position: absolute; left: var(--sg-x, 0%); top: var(--sg-y, 0%); width: var(--sg-w, auto); height: var(--sg-h, auto); z-index: var(--sg-z, auto); transform: rotate(var(--sg-rot, 0deg)); transform-origin: center center; }
/* 隐藏属性：data-sg-hidden="on" 时元素完全不显示（编辑预览与播放一致） */
[data-sg-hidden="on"] { display: none !important; }
/* Slide 模式：每页撑满视口 */
html[data-sg-mode="slide"][data-sg-runtime-ready="1"] [data-sg-page] { height: 1080px; min-height: 1080px; overflow: hidden; }
html[data-sg-mode="slide"][data-sg-runtime-ready="1"] [data-sg-page] { display: none; }

/* Scroll 模式：连续滚动 */
html[data-sg-mode="scroll"] [data-sg-page] { display: flex; height: auto; min-height: 1080px; }

/* ---- 控件 ---- */
.sg-progress {
  position: fixed; top: 0; left: 0; height: 4px; background: var(--sg-primary);
  width: 0; transition: width 0.3s ease; z-index: 1000;
}
.sg-page-no {
  position: fixed; bottom: 20px; right: 24px; font-size: 13px; color: var(--sg-text-secondary);
  z-index: 1000; font-variant-numeric: tabular-nums;
}
.sg-nav {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 8px; z-index: 1000;
}
.sg-nav button {
  border: 1px solid var(--sg-primary); background: transparent; color: var(--sg-text-primary);
  border-radius: 999px; width: 40px; height: 40px; cursor: pointer; font-size: 18px;
}
.sg-nav button:hover { background: var(--sg-primary); color: #fff; }

/* ---- Hover 协议 data-sg-hover ---- */
[data-sg-hover] { transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease; }
[data-sg-hover="lift"]:hover { transform: translateY(-6px); box-shadow: 0 18px 40px rgba(23, 32, 51, 0.14); }
[data-sg-hover="glow"]:hover { box-shadow: 0 0 0 1px var(--sg-primary), 0 0 40px rgba(124, 92, 255, 0.35); }
[data-sg-hover="scale"]:hover { transform: scale(1.04); }
[data-sg-hover="border"]:hover { border-color: var(--sg-primary); }

/* ---- 基础排版 ---- */
h1, h2, h3 { margin: 0; line-height: 1.15; }
h1 { font-size: var(--sg-font-title); }
p, li { font-size: var(--sg-font-body); line-height: 1.7; }
a { color: var(--sg-primary); }
img { max-width: 100%; height: auto; }

/* ---- 页面主体布局 ---- */
.sg-page-body {
  width: 100%;
  max-width: 1120px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  margin-top: 32px;
}
[data-sg-page].sg-layout-metrics-grid .sg-page-body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
}
[data-sg-page].sg-layout-chart-story .sg-page-body {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  align-items: center;
  gap: 36px;
}
[data-sg-page].sg-layout-chart-story .sg-chart { min-height: 360px; }
[data-sg-page].sg-layout-data-dashboard .sg-page-body { max-width: 1440px; display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(420px, .92fr); grid-template-rows: minmax(0, 1fr) auto; gap: 22px; align-items: stretch; }
[data-sg-page].sg-layout-data-dashboard .sg-chart { min-height: 420px; padding: 18px 22px; background: color-mix(in srgb, var(--sg-surface) 82%, transparent); border: 1px solid color-mix(in srgb, var(--sg-text-secondary) 20%, transparent); }
[data-sg-page].sg-layout-data-dashboard .sg-data-table-wrap { min-height: 420px; }
[data-sg-page].sg-layout-data-dashboard .sg-page-body > .sg-data-table-wrap { grid-column: 2; grid-row: 1; }
[data-sg-page].sg-layout-data-dashboard .sg-page-body > .sg-chart { grid-column: 1; grid-row: 1; }
[data-sg-page].sg-layout-comparison-sides .sg-page-body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
}
[data-sg-page].sg-layout-copy-stack-alt .sg-page-body { align-items: flex-end; text-align: right; }
[data-sg-page].sg-layout-copy-stack-alt .sg-ul { align-items: flex-end; }
[data-sg-page].sg-layout-quote-focus .sg-quote { font-size: 58px; }
[data-sg-page].sg-layout-image-caption .sg-page-body {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.65fr);
  align-items: center;
  gap: 36px;
}
[data-sg-page].sg-layout-image-caption .sg-figure { min-height: 420px; }
[data-sg-page].sg-layout-timeline-flow .sg-timeline { max-width: 900px; width: 100%; }
[data-sg-page].sg-layout-closing-action .sg-closing { max-width: 900px; }
.sg-slide-title {
  font-size: 44px;
  color: var(--sg-primary);
  margin-bottom: 8px;
  letter-spacing: -0.01em;
}
.sg-two-column {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: start;
}

/* ---- 封面 ---- */
.sg-cover { text-align: center; max-width: 960px; }
.sg-cover-atmosphere { position: absolute; inset: 0; overflow: hidden; pointer-events: none; color: var(--sg-primary); opacity: .13; }
.sg-cover-atmosphere::after { content: "北京 · SHIGUANG LAB"; position: absolute; right: 7%; top: 8%; font-size: 13px; letter-spacing: .28em; color: var(--sg-primary); opacity: .8; }
.sg-cover-orb { position: absolute; width: 520px; height: 520px; right: 9%; top: 4%; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--sg-primary) 28%, transparent), transparent 68%); filter: blur(3px); }
.sg-cover-skyline { position: absolute; width: 100%; height: 34%; left: 0; bottom: 0; }
.sg-cover::after { content: ""; display: block; width: 110px; height: 4px; margin: 28px auto 0; border-radius: 999px; background: linear-gradient(90deg, transparent, var(--sg-primary), transparent); }
.sg-cover-eyebrow {
  display: inline-block;
  font-size: 14px;
  letter-spacing: 0.35em;
  color: var(--sg-primary);
  margin-bottom: 24px;
}
.sg-cover-title {
  font-size: 80px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 24px;
}
.sg-cover .sg-p { font-size: 24px; color: var(--sg-text-secondary); max-width: 640px; margin: 0 auto; }

/* ---- 章节页 ---- */
.sg-section { text-align: left; max-width: 960px; width: 100%; }
.sg-section-no {
  font-size: 15px;
  letter-spacing: 0.3em;
  color: var(--sg-primary);
  font-variant-numeric: tabular-nums;
}
.sg-section-title { font-size: 72px; font-weight: 800; margin: 16px 0 32px; }

/* ---- 引用页 ---- */
.sg-quote-wrap { max-width: 900px; text-align: center; }
.sg-quote {
  font-size: 48px;
  font-weight: 700;
  line-height: 1.4;
  margin: 0 0 24px;
}
.sg-quote-wrap::before {
  content: "“";
  font-size: 96px;
  color: var(--sg-primary);
  opacity: 0.35;
  display: block;
  line-height: 0.6;
  margin-bottom: 16px;
}

/* ---- 结束页 ---- */
.sg-closing { text-align: center; }
.sg-closing h1 { font-size: 84px; font-weight: 800; margin-bottom: 24px; }

/* ---- 标题 / 正文 / 列表 ---- */
.sg-h { font-size: 32px; font-weight: 700; }
.sg-p { margin: 0; color: var(--sg-text-primary); }
.sg-ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
.sg-ul li { display: flex; gap: 12px; align-items: flex-start; }
.sg-bullet-dot {
  flex: 0 0 auto;
  width: 8px; height: 8px;
  border-radius: 999px;
  background: var(--sg-primary);
  margin-top: 0.6em;
}

/* ---- 图片 ---- */
.sg-figure { margin: 0; }
.sg-figure img { border-radius: var(--sg-radius-md); display: block; width: 100%; max-height: 626px; object-fit: cover; }
.sg-figure figcaption { font-size: 13px; color: var(--sg-text-secondary); margin-top: 8px; text-align: center; }

/* ---- 图表 ---- */
.sg-chart { width: 100%; min-height: 300px; }
.sg-data-table-wrap { overflow: hidden; border: 1px solid color-mix(in srgb, var(--sg-text-secondary) 20%, transparent); background: color-mix(in srgb, var(--sg-surface) 72%, transparent); }
.sg-data-table { width: 100%; border-collapse: collapse; font-size: 16px; font-variant-numeric: tabular-nums; }
.sg-data-table th, .sg-data-table td { padding: 12px 14px; text-align: right; border-bottom: 1px solid color-mix(in srgb, var(--sg-text-secondary) 16%, transparent); white-space: nowrap; }
.sg-data-table th:first-child, .sg-data-table td:first-child { text-align: left; }
.sg-data-table th { color: var(--sg-text-secondary); font-size: 14px; letter-spacing: .04em; }
.sg-data-table td { color: var(--sg-text-primary); }
.sg-data-table tbody tr:last-child td { border-bottom: 0; }

/* ---- 指标卡 / 大数字 ---- */
.sg-metric-card {
  background: var(--sg-surface);
  border-radius: var(--sg-radius-md);
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--sg-primary) 12%, transparent);
}
.sg-metric-label { font-size: 14px; color: var(--sg-text-secondary); }
.sg-metric-value { font-size: 56px; font-weight: 800; color: var(--sg-primary); font-variant-numeric: tabular-nums; }
.sg-metric-note { font-size: 13px; color: var(--sg-text-secondary); }

/* ---- 卡片块 ---- */
.sg-card-block {
  background: var(--sg-surface);
  border-radius: var(--sg-radius-md);
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sg-card-title { font-size: 18px; font-weight: 700; }
.sg-card-body { white-space: pre-line; }

/* ---- 时间轴 ---- */
.sg-timeline { display: flex; flex-direction: column; gap: 0; position: relative; }
.sg-timeline-item { display: flex; gap: 16px; position: relative; padding-bottom: 28px; }
.sg-timeline-item::before {
  content: "";
  position: absolute; left: 5px; top: 14px; bottom: 0;
  width: 2px; background: color-mix(in srgb, var(--sg-primary) 30%, transparent);
}
.sg-timeline-item:last-child::before { display: none; }
.sg-timeline-dot { flex: 0 0 auto; width: 12px; height: 12px; border-radius: 999px; background: var(--sg-primary); margin-top: 5px; }
.sg-timeline-item b { display: block; font-size: 16px; margin-bottom: 4px; }
.sg-timeline-item p { margin: 0; font-size: 15px; color: var(--sg-text-secondary); }

/* ---- 可复用叙事图解：步骤 / 上升 / 四象限 ---- */
.sg-process { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; width: 100%; }
.sg-process-step { position: relative; min-height: 170px; padding: 22px; border-radius: var(--sg-radius-md); background: var(--sg-surface); border: 1px solid color-mix(in srgb, var(--sg-primary) 18%, transparent); }
.sg-process-step:not(:last-child)::after { content: "→"; position: absolute; right: -18px; top: 50%; color: var(--sg-primary); font-size: 25px; transform: translateY(-50%); }
.sg-process-step > span { color: var(--sg-primary); font: 800 24px/1 ui-monospace, monospace; }
.sg-process-step p { margin: 24px 0 0; font-size: 17px; line-height: 1.45; }
.sg-rise { position: relative; height: 360px; width: 100%; padding: 12px 8% 0; display: flex; align-items: flex-end; justify-content: space-between; overflow: hidden; }
.sg-rise::before { content: ""; position: absolute; inset: 12px 8% 28px; background: repeating-linear-gradient(to top, color-mix(in srgb, var(--sg-text-secondary) 12%, transparent) 0 1px, transparent 1px 72px); }
.sg-rise-line { position: absolute; left: 8%; right: 8%; bottom: 40px; height: 3px; background: linear-gradient(90deg, color-mix(in srgb, var(--sg-primary) 20%, transparent), var(--sg-primary)); transform: rotate(-18deg); transform-origin: left center; box-shadow: 0 0 22px color-mix(in srgb, var(--sg-primary) 35%, transparent); }
.sg-rise-point { position: relative; z-index: 1; height: var(--rise); min-height: 72px; width: 18%; display: flex; flex-direction: column; justify-content: flex-end; gap: 12px; }
.sg-rise-point i { width: 18px; height: 18px; border-radius: 50%; background: var(--sg-primary); box-shadow: 0 0 0 7px color-mix(in srgb, var(--sg-primary) 16%, transparent); }
.sg-rise-point span { font-size: 15px; color: var(--sg-text-secondary); }
.sg-quadrant { position: relative; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 12px; width: 100%; min-height: 390px; padding: 14px; }
.sg-quadrant-cell { padding: 22px; border-radius: 14px; background: color-mix(in srgb, var(--sg-primary) 8%, var(--sg-surface)); border: 1px solid color-mix(in srgb, var(--sg-primary) 20%, transparent); display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; }
.sg-quadrant-cell b { font-size: 18px; }.sg-quadrant-cell small { color: var(--sg-text-secondary); font-size: 14px; }
.sg-quadrant-cell.q1 { background: color-mix(in srgb, var(--sg-primary) 18%, var(--sg-surface)); }.sg-quadrant-cell.q4 { opacity: .72; }
.sg-quadrant-axis { position: absolute; z-index: 2; background: color-mix(in srgb, var(--sg-text-secondary) 42%, transparent); }.sg-quadrant-axis.x { left: 50%; top: 0; bottom: 0; width: 1px; }.sg-quadrant-axis.y { top: 50%; left: 0; right: 0; height: 1px; }
.sg-quadrant-label { position: absolute; font-size: 12px; color: var(--sg-text-secondary); font-style: normal; }.sg-quadrant-label.top { left: 10px; top: -4px; }.sg-quadrant-label.right { right: 4px; bottom: -4px; }


/* ---- 引用块 / 分隔线 / 代码 ---- */
.sg-blockquote {
  border-left: 4px solid var(--sg-primary);
  padding: 8px 0 8px 20px;
  font-size: 24px;
  font-style: italic;
  margin: 0;
}
.sg-blockquote cite { display: block; margin-top: 12px; font-size: 14px; color: var(--sg-text-secondary); font-style: normal; }
.sg-divider { border: none; border-top: 1px solid color-mix(in srgb, var(--sg-text-secondary) 25%, transparent); margin: 8px 0; }
.sg-pre, .sg-code {
  background: var(--sg-surface);
  border-radius: var(--sg-radius-md);
  padding: 20px;
  overflow: auto;
  font-size: 14px;
  line-height: 1.6;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* ---- 卡片 / 网格容器（供 AI 生成时用） ---- */
.metric { font-size: 48px; font-weight: 700; color: var(--sg-primary); font-variant-numeric: tabular-nums; }
.card { background: var(--sg-surface); border-radius: var(--sg-radius-md); padding: 28px; }
.sg-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; }

/* ---- 元素级样式覆盖（Visual Editor 写入的 data-sg-* 属性，color/weight/style 由 SG_RUNTIME_JS 应用，align/size/radius/border/shadow 走 CSS） ---- */
[data-sg-align="left"] { text-align: left; }
[data-sg-align="center"] { text-align: center; }
[data-sg-align="right"] { text-align: right; }
[data-sg-size="sm"] { font-size: 0.8em; }
[data-sg-size="md"] { font-size: 1em; }
[data-sg-size="lg"] { font-size: 1.35em; }
[data-sg-size="xl"] { font-size: 1.8em; }
/* 图片外观覆盖 */
[data-sg-radius="none"] img,
[data-sg-radius="none"] { border-radius: 0; }
[data-sg-radius="sm"] img,
[data-sg-radius="sm"] { border-radius: var(--sg-radius-sm); }
[data-sg-radius="md"] img,
[data-sg-radius="md"] { border-radius: var(--sg-radius-md); }
[data-sg-radius="lg"] img,
[data-sg-radius="lg"] { border-radius: var(--sg-radius-lg); }
[data-sg-radius="full"] img,
[data-sg-radius="full"] { border-radius: 999px; }
[data-sg-border="on"] img,
[data-sg-border="on"] { border: 1px solid color-mix(in srgb, var(--sg-primary) 30%, transparent); }
[data-sg-shadow="on"] img,
[data-sg-shadow="on"] { box-shadow: 0 12px 32px rgba(23, 32, 51, 0.12); }
/* 图片填充方式：data-sg-fit 控制 object-fit（cover 裁切填满 / contain 完整显示 / fill 拉伸） */
[data-sg-kind="image"] img { width: 100%; height: 100%; object-fit: var(--sg-fit, cover); display: block; }
[data-sg-fit="cover"] img, [data-sg-fit="cover"] { object-fit: cover; }
[data-sg-fit="contain"] img, [data-sg-fit="contain"] { object-fit: contain; background: var(--sg-surface); }
[data-sg-fit="fill"] img, [data-sg-fit="fill"] { object-fit: fill; }
/* 图片滤镜：data-sg-filter 控制 filter 预设（灰阶/复古/暖/冷/模糊/亮/对比） */
[data-sg-kind="image"] img { filter: var(--sg-filter, none); }
[data-sg-filter="grayscale"] img, [data-sg-filter="grayscale"] { filter: grayscale(1); }
[data-sg-filter="sepia"] img, [data-sg-filter="sepia"] { filter: sepia(0.7) contrast(1.05); }
[data-sg-filter="warm"] img, [data-sg-filter="warm"] { filter: sepia(0.35) saturate(1.3) hue-rotate(-12deg); }
[data-sg-filter="cool"] img, [data-sg-filter="cool"] { filter: saturate(1.1) hue-rotate(12deg) brightness(1.02); }
[data-sg-filter="blur"] img, [data-sg-filter="blur"] { filter: blur(3px); }
[data-sg-filter="brightness"] img, [data-sg-filter="brightness"] { filter: brightness(1.2); }
[data-sg-filter="contrast"] img, [data-sg-filter="contrast"] { filter: contrast(1.3); }

${SG_FIXED_STAGE_CSS}
`;

export const SG_RUNTIME_JS = /* js */ `
(function () {
  "use strict";
  var SG = window.SG = window.SG || {};

  /* ---------- 元素级样式覆盖：把 data-sg-* 属性应用到内联样式（color/weight/style 无法用纯 CSS attr() 可靠实现） ---------- */
  function applyElementStyles() {
    document.querySelectorAll("[data-sg-color]").forEach(function (el) {
      var c = el.getAttribute("data-sg-color");
      if (c) el.style.color = c;
    });
    document.querySelectorAll("[data-sg-weight]").forEach(function (el) {
      el.style.fontWeight = el.getAttribute("data-sg-weight") === "bold" ? "700" : "";
    });
    document.querySelectorAll("[data-sg-style]").forEach(function (el) {
      el.style.fontStyle = el.getAttribute("data-sg-style") === "italic" ? "italic" : "";
    });
    document.querySelectorAll("[data-sg-x]").forEach(function (el) {
      var x = el.getAttribute("data-sg-x");
      var y = el.getAttribute("data-sg-y");
      var w = el.getAttribute("data-sg-w");
      var h = el.getAttribute("data-sg-h");
      var z = el.getAttribute("data-sg-z");
      var rot = el.getAttribute("data-sg-rot");
      if (x) el.style.setProperty("--sg-x", x);
      if (y) el.style.setProperty("--sg-y", y);
      if (w) el.style.setProperty("--sg-w", w);
      if (h) el.style.setProperty("--sg-h", h);
      if (z) el.style.setProperty("--sg-z", z);
      if (rot) el.style.setProperty("--sg-rot", rot);
    });
    document.querySelectorAll("[data-sg-fit]").forEach(function (el) {
      var fit = el.getAttribute("data-sg-fit");
      if (fit) el.style.setProperty("--sg-fit", fit);
    });
    document.querySelectorAll("[data-sg-filter]").forEach(function (el) {
      var f = el.getAttribute("data-sg-filter");
      if (f) el.style.setProperty("--sg-filter", f);
    });
  }
  applyElementStyles();
  // 主题切换 / DOM 动态变化后重新应用
  SG.applyElementStyles = applyElementStyles;

  /* ---------- Presentation：扫描 [data-sg-page]，提供 slide / scroll 两种模式 ---------- */
  SG.presentation = function (opts) {
    opts = opts || {};
    var mode = opts.mode || "slide";
    var pages = Array.prototype.slice.call(document.querySelectorAll("[data-sg-page]"));
    if (!pages.length) return;
    // Preserve the display mode authored by each page. Setting every page to
    // flex changes normal-flow pages into horizontal flex rows (and can make
    // a title consume the whole stage), which is especially visible in
    // AI-authored HTML pages that intentionally use block/grid composition.
    pages.forEach(function (page) {
      if (page.__sgAuthoredDisplay) return;
      var authored = window.getComputedStyle(page).display;
      page.__sgAuthoredDisplay = authored === "none" ? "block" : authored;
    });
    document.documentElement.setAttribute("data-sg-mode", mode);
    document.documentElement.setAttribute("data-sg-runtime-ready", "1");
    var current = 0;
    function fitStage() {
      if (mode !== "slide") return;
      var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      var x = (window.innerWidth - 1920 * scale) / 2;
      var y = (window.innerHeight - 1080 * scale) / 2;
      pages.forEach(function (page) {
        page.style.setProperty("transform", "translate(" + x + "px," + y + "px) scale(" + scale + ")", "important");
      });
      document.documentElement.style.setProperty("--sg-stage-scale", String(scale));
      document.documentElement.style.setProperty("--sg-stage-x", x + "px");
      document.documentElement.style.setProperty("--sg-stage-y", y + "px");
    }
    function show(i) {
      current = Math.max(0, Math.min(pages.length - 1, i));
      pages.forEach(function (p, idx) {
        p.classList.toggle("sg-active", idx === current);
        p.setAttribute("aria-hidden", idx === current ? "false" : "true");
        p.style.setProperty(
          "display",
          idx === current
            ? mode === "slide"
              ? p.__sgAuthoredDisplay || "block"
              : "flex"
            : "none",
          "important",
        );
      });
      var activePage = pages[current];
      var refreshCharts = function () { SG.resizeCharts(activePage); };
      requestAnimationFrame(refreshCharts);
      setTimeout(refreshCharts, 80);
      var progress = document.getElementById("sg-progress");
      if (progress) progress.style.width = ((current + 1) / pages.length) * 100 + "%";
      var pageNo = document.getElementById("sg-page-no");
      if (pageNo) pageNo.textContent = (current + 1) + " / " + pages.length;
      // 上报当前页 / 总页数给宿主（播放页 overlay 用）
      try {
        window.parent.postMessage({ sg: "page", index: current, total: pages.length }, "*");
      } catch (e) { /* ignore */ }
      window.scrollTo({ top: 0 });
    }
    function next() { show(current + 1); }
    function prev() { show(current - 1); }

    if (mode === "slide") {
      fitStage();
      window.addEventListener("resize", fitStage);
      document.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
        else if (e.key === "Home") { show(0); }
        else if (e.key === "End") { show(pages.length - 1); }
      });
      var touchX = 0;
      document.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
      document.addEventListener("touchend", function (e) {
        var dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
      }, { passive: true });
    }
    show(0);
    // 接收宿主发来的跳转指令（播放页页码点选）
    window.addEventListener("message", function (e) {
      var d = e.data;
      if (d && d.sg === "goto" && typeof d.index === "number") show(d.index);
    });
    return { next: next, prev: prev, show: show, fit: fitStage };
  };

  /* ---------- 数字滚动：data-sg-counter ---------- */
  SG.counter = function (el, opts) {
    opts = opts || {};
    var target = parseFloat(el.getAttribute("data-sg-counter") || el.textContent || "0");
    var duration = opts.duration || 1200;
    var start = null;
    function frame(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatNum(target * eased, opts);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };
  function formatNum(n, opts) {
    return opts.decimals != null ? n.toFixed(opts.decimals) : Math.round(n).toLocaleString("zh-CN");
  }

  /* ---------- 图表：data-sg-kind="chart" 的原生 SVG 渲染（ECharts 为 P1 approved dependency） ---------- */
  SG.chart = function (el, opts) {
    opts = opts || {};
    // 保留 AI 生成的 SVG / Canvas，避免空配置把已有图形清空。
    if (el.children.length > 0 || (el.textContent || "").trim()) return null;
    // 优先使用 ECharts（平台 approved dependency，内联进 presentation.html）；
    // 未内联时回退到原生 SVG 渲染，保证单 HTML 始终可运行。
    if (window.echarts) {
      try {
        var chart = window.echarts.init(el);
        chart.setOption(toEChartsOption(opts));
        el.__sgEcharts = chart;
        return chart;
      } catch (e) { /* fallthrough to SVG */ }
    }
    var type = opts.type || "bar";
    var data = opts.data || [];
    var labels = opts.labels || data.map(function (_, i) { return String(i + 1); });
    if (!Array.isArray(data) || data.length === 0) {
      el.innerHTML = '<span style="display:block;padding:16px;color:var(--sg-text-secondary,#667085);font-size:14px">图表数据待补充</span>';
      return null;
    }
    var w = el.clientWidth || 600;
    var h = opts.height || 300;
    if (type === "radar") {
      renderRadar(el, data, labels, w, h);
      return;
    }
    if (type === "funnel") {
      renderFunnel(el, data, labels, w, h);
      return;
    }
    var pad = { l: 40, r: 16, t: 16, b: 32 };
    var iw = w - pad.l - pad.r;
    var ih = h - pad.t - pad.b;
    var max = Math.max.apply(null, data.concat([1]));
    var svg = [];
    svg.push('<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img">');
    if (type === "pie") {
      var cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 12;
      var total = data.reduce(function (a, b) { return a + b; }, 0);
      var angle = -Math.PI / 2;
      data.forEach(function (v, i) {
        var a2 = angle + (v / total) * Math.PI * 2;
        var large = a2 - angle > Math.PI ? 1 : 0;
        var x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
        var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        svg.push('<path d="M' + cx + ',' + cy + ' L' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + ' Z" fill="' + palette(i) + '"/>');
        angle = a2;
      });
    } else {
      var bw = iw / data.length * 0.6;
      data.forEach(function (v, i) {
        var x = pad.l + (i + 0.5) * (iw / data.length) - bw / 2;
        var barH = (v / max) * ih;
        var y = h - pad.b - barH;
        if (type === "line" && i > 0) {
          var prev = data[i - 1];
          var x0 = pad.l + (i - 0.5) * (iw / data.length);
          var y0 = h - pad.b - (prev / max) * ih;
          var x1c = pad.l + (i + 0.5) * (iw / data.length);
          var y1c = h - pad.b - (v / max) * ih;
          svg.push('<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1c + '" y2="' + y1c + '" stroke="' + palette(0) + '" stroke-width="3"/>');
        }
        if (type === "line") {
          svg.push('<circle cx="' + (x + bw / 2) + '" cy="' + y + '" r="4" fill="' + palette(0) + '"/>');
        } else {
          svg.push('<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + barH + '" rx="4" fill="' + palette(i) + '"/>');
        }
      });
    }
    svg.push("</svg>");
    el.innerHTML = svg.join("");
  };
  /* 隐藏页初始化的 ECharts 可能拿到 0 尺寸，切页后必须重新测量。 */
  SG.resizeCharts = function (root) {
    (root || document).querySelectorAll("[data-sg-kind='chart']").forEach(function (el) {
      var chart = el.__sgEcharts;
      if (!chart && window.echarts && window.echarts.getInstanceByDom) {
        chart = window.echarts.getInstanceByDom(el);
      }
      if (chart && chart.resize) {
        try { chart.resize(); } catch (e) { /* ignore a disposed chart */ }
      }
    });
  };
  /* 雷达图原生 SVG 渲染（无 ECharts 时的兜底） */
  function renderRadar(el, data, labels, w, h) {
    var cx = w / 2, cy = h / 2 + 4, r = Math.min(w, h) / 2 - 28;
    var max = Math.max.apply(null, data.concat([1]));
    var n = data.length || 1;
    var svg = ['<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img">'];
    // 网格圈（3 层）
    for (var g = 1; g <= 3; g++) {
      var rr = (r * g) / 3;
      var pts = [];
      for (var i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
        pts.push((cx + rr * Math.cos(ang)) + "," + (cy + rr * Math.sin(ang)));
      }
      svg.push('<polygon points="' + pts.join(" ") + '" fill="none" stroke="rgba(124,92,255,0.18)"/>');
    }
    // 轴线 + 标签
    for (var j = 0; j < n; j++) {
      var a = -Math.PI / 2 + (j / n) * Math.PI * 2;
      var ex = cx + r * Math.cos(a), ey = cy + r * Math.sin(a);
      svg.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + ex + '" y2="' + ey + '" stroke="rgba(124,92,255,0.25)"/>');
      var lx = cx + (r + 14) * Math.cos(a), ly = cy + (r + 14) * Math.sin(a);
      var anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
      svg.push('<text x="' + lx + '" y="' + (ly + 4) + '" font-size="11" fill="#667085" text-anchor="' + anchor + '">' + (labels[j] || "") + '</text>');
    }
    // 数据多边形
    var dpts = [];
    for (var k = 0; k < n; k++) {
      var ak = -Math.PI / 2 + (k / n) * Math.PI * 2;
      var v = (data[k] || 0) / max * r;
      dpts.push((cx + v * Math.cos(ak)) + "," + (cy + v * Math.sin(ak)));
    }
    svg.push('<polygon points="' + dpts.join(" ") + '" fill="rgba(124,92,255,0.28)" stroke="#7c5cff" stroke-width="2"/>');
    svg.push("</svg>");
    el.innerHTML = svg.join("");
  }
  /* 漏斗图原生 SVG 渲染（无 ECharts 时的兜底） */
  function renderFunnel(el, data, labels, w, h) {
    var max = Math.max.apply(null, data.concat([1]));
    var n = data.length || 1;
    var topW = w - 80;
    var left = 40;
    var gap = n > 1 ? Math.min(10, (h - 20) / n / 3) : 0;
    var layerH = (h - 20 - gap * (n - 1)) / n;
    var y = 10;
    var svg = ['<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img">'];
    for (var i = 0; i < n; i++) {
      var curW = (data[i] || 0) / max * topW;
      var nextW = i < n - 1 ? (data[i + 1] || 0) / max * topW : curW * 0.6;
      var x1 = left + (topW - curW) / 2;
      var x2 = left + (topW - curW) / 2 + curW;
      var x3 = left + (topW - nextW) / 2 + nextW;
      var x4 = left + (topW - nextW) / 2;
      var cy = y + layerH / 2;
      svg.push('<polygon points="' + x1 + ',' + y + ' ' + x2 + ',' + y + ' ' + x3 + ',' + (y + layerH) + ' ' + x4 + ',' + (y + layerH) + '" fill="' + palette(i) + '" opacity="0.9"/>');
      svg.push('<text x="' + (left + topW / 2) + '" y="' + (cy + 4) + '" font-size="12" fill="#fff" text-anchor="middle">' + (labels[i] || "") + ' ' + (data[i] || 0) + '</text>');
      y += layerH + gap;
    }
    svg.push("</svg>");
    el.innerHTML = svg.join("");
  };
  function toEChartsOption(opts) {
    var type = opts.type || "bar";
    var data = opts.data || [];
    var labels = opts.labels || data.map(function (_, i) { return String(i + 1); });
    if (type === "pie") {
      return { series: [{ type: "pie", radius: "65%", data: data.map(function (v, i) { return { name: labels[i], value: v }; }) }] };
    }
    if (type === "radar") {
      var maxVal = Math.max.apply(null, data.concat([1]));
      return {
        radar: { radius: "62%", indicator: labels.map(function (name) { return { name: name, max: maxVal }; }) },
        series: [{ type: "radar", data: [{ value: data, name: "" }] }],
      };
    }
    if (type === "funnel") {
      var maxF = Math.max.apply(null, data.concat([1]));
      return {
        tooltip: { trigger: "item" },
        series: [{ type: "funnel", left: "10%", right: "10%", top: 20, bottom: 20, min: 0, max: maxF,
          label: { show: true, position: "inside" },
          data: data.map(function (v, i) { return { name: labels[i], value: v }; }) }],
      };
    }
    return {
      grid: { left: 40, right: 20, top: 20, bottom: 32 },
      xAxis: { type: "category", data: labels },
      yAxis: { type: "value" },
      series: [{ type: type === "line" ? "line" : "bar", data: data, smooth: type === "line" }],
    };
  }
  function palette(i) {
    var colors = ["#7c5cff", "#6d5dfc", "#f04e2c", "#12b76a", "#f79009", "#0ba5ec"];
    return colors[i % colors.length];
  }

  /* ---------- Tooltip：data-sg-tooltip ---------- */
  SG.tooltip = function (root) {
    (root || document).querySelectorAll("[data-sg-tooltip]").forEach(function (el) {
      el.setAttribute("title", el.getAttribute("data-sg-tooltip") || "");
    });
  };

  /* ---------- 自动初始化 ---------- */
  function boot() {
    document.querySelectorAll("[data-sg-kind='chart']").forEach(function (el) {
      try {
        SG.chart(el, JSON.parse(el.getAttribute("data-sg-chart") || "{}"));
      } catch (e) { /* ignore malformed chart config */ }
    });
    document.querySelectorAll("[data-sg-kind='counter']").forEach(function (el) { SG.counter(el); });
    SG.tooltip(document);
    setTimeout(function () { SG.resizeCharts(document); }, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
`;

/** Authoring Protocol 常量：data-sg-* 属性名。 */
export const SG_PROTOCOL = {
  page: "data-sg-page",
  id: "data-sg-id",
  kind: "data-sg-kind",
  hover: "data-sg-hover",
} as const;
