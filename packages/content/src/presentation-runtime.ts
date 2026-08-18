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
  --sg-font-body: 18px;
  --sg-transition: 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: -apple-system, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
  color: var(--sg-text-primary);
  background: var(--sg-background);
  -webkit-font-smoothing: antialiased;
}

/* ---- 页面 ---- */
[data-sg-page] {
  display: none;
  min-height: 100vh;
  width: 100%;
  padding: 64px clamp(24px, 6vw, 96px);
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
[data-sg-page].sg-active { display: flex; }

/* Slide 模式：每页撑满视口 */
html[data-sg-mode="slide"] [data-sg-page] { height: 100vh; min-height: 100vh; overflow: hidden; }

/* Scroll 模式：连续滚动 */
html[data-sg-mode="scroll"] [data-sg-page] { display: flex; height: auto; min-height: 100vh; }

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

/* ---- 动画协议 data-sg-enter ---- */
[data-sg-enter] { opacity: 0; }
[data-sg-enter].sg-enter { opacity: 1; }
[data-sg-enter="fade"] { transition: opacity var(--sg-transition); }
[data-sg-enter="fade-up"] { transform: translateY(28px); transition: opacity var(--sg-transition), transform var(--sg-transition); }
[data-sg-enter="fade-up"].sg-enter { transform: translateY(0); }
[data-sg-enter="slide"] { transform: translateX(40px); transition: opacity var(--sg-transition), transform var(--sg-transition); }
[data-sg-enter="slide"].sg-enter { transform: translateX(0); }
[data-sg-enter="scale"] { transform: scale(0.92); transition: opacity var(--sg-transition), transform var(--sg-transition); }
[data-sg-enter="scale"].sg-enter { transform: scale(1); }

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
.sg-slide-title {
  font-size: clamp(28px, 3.4vw, 44px);
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
@media (max-width: 720px) { .sg-two-column { grid-template-columns: 1fr; } }

/* ---- 封面 ---- */
.sg-cover { text-align: center; max-width: 960px; }
.sg-cover-eyebrow {
  display: inline-block;
  font-size: 14px;
  letter-spacing: 0.35em;
  color: var(--sg-primary);
  margin-bottom: 24px;
}
.sg-cover-title {
  font-size: clamp(40px, 6vw, 80px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0 0 24px;
}
.sg-cover .sg-p { font-size: clamp(18px, 2vw, 24px); color: var(--sg-text-secondary); max-width: 640px; margin: 0 auto; }

/* ---- 章节页 ---- */
.sg-section { text-align: left; max-width: 960px; width: 100%; }
.sg-section-no {
  font-size: 15px;
  letter-spacing: 0.3em;
  color: var(--sg-primary);
  font-variant-numeric: tabular-nums;
}
.sg-section-title { font-size: clamp(36px, 5.5vw, 72px); font-weight: 800; margin: 16px 0 32px; }

/* ---- 引用页 ---- */
.sg-quote-wrap { max-width: 900px; text-align: center; }
.sg-quote {
  font-size: clamp(26px, 4vw, 48px);
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
.sg-closing h1 { font-size: clamp(40px, 6vw, 84px); font-weight: 800; margin-bottom: 24px; }

/* ---- 标题 / 正文 / 列表 ---- */
.sg-h { font-size: clamp(22px, 2.6vw, 32px); font-weight: 700; }
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
.sg-figure img { border-radius: var(--sg-radius-md); display: block; }
.sg-figure figcaption { font-size: 13px; color: var(--sg-text-secondary); margin-top: 8px; text-align: center; }

/* ---- 图表 ---- */
.sg-chart { width: 100%; min-height: 300px; }

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
.sg-metric-value { font-size: clamp(36px, 4vw, 56px); font-weight: 800; color: var(--sg-primary); font-variant-numeric: tabular-nums; }
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

/* ---- 引用块 / 分隔线 / 代码 ---- */
.sg-blockquote {
  border-left: 4px solid var(--sg-primary);
  padding: 8px 0 8px 20px;
  font-size: clamp(18px, 2vw, 24px);
  font-style: italic;
  margin: 0;
}
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

@media (max-width: 640px) {
  :root { --sg-font-title: 40px; --sg-font-body: 16px; }
  [data-sg-page] { padding: 40px 20px; }
}
`;

export const SG_RUNTIME_JS = /* js */ `
(function () {
  "use strict";
  var SG = window.SG = window.SG || {};

  /* ---------- Presentation：扫描 [data-sg-page]，提供 slide / scroll 两种模式 ---------- */
  SG.presentation = function (opts) {
    opts = opts || {};
    var mode = opts.mode || "slide";
    var pages = Array.prototype.slice.call(document.querySelectorAll("[data-sg-page]"));
    if (!pages.length) return;
    document.documentElement.setAttribute("data-sg-mode", mode);
    var current = 0;
    function show(i) {
      current = Math.max(0, Math.min(pages.length - 1, i));
      pages.forEach(function (p, idx) {
        p.classList.toggle("sg-active", idx === current);
        p.setAttribute("aria-hidden", idx === current ? "false" : "true");
        runEnters(p);
      });
      var progress = document.getElementById("sg-progress");
      if (progress) progress.style.width = ((current + 1) / pages.length) * 100 + "%";
      var pageNo = document.getElementById("sg-page-no");
      if (pageNo) pageNo.textContent = (current + 1) + " / " + pages.length;
      window.scrollTo({ top: 0 });
    }
    function next() { show(current + 1); }
    function prev() { show(current - 1); }

    if (mode === "slide") {
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
    return { next: next, prev: prev, show: show };
  };

  /* ---------- 进场动画：data-sg-enter ---------- */
  function runEnters(root) {
    if (!("IntersectionObserver" in window)) {
      (root || document).querySelectorAll("[data-sg-enter]").forEach(function (el) { el.classList.add("sg-enter"); });
      return;
    }
    var els = (root || document).querySelectorAll("[data-sg-enter]:not(.sg-enter)");
    els.forEach(function (el) {
      el.classList.add("sg-enter");
    });
  }
  var enterObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add("sg-enter"); enterObserver.unobserve(entry.target); }
        });
      }, { threshold: 0.15 })
    : null;

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
    // 优先使用 ECharts（平台 approved dependency，内联进 presentation.html）；
    // 未内联时回退到原生 SVG 渲染，保证单 HTML 始终可运行。
    if (window.echarts) {
      try {
        var chart = window.echarts.init(el);
        chart.setOption(toEChartsOption(opts));
        return chart;
      } catch (e) { /* fallthrough to SVG */ }
    }
    var type = opts.type || "bar";
    var data = opts.data || [];
    var labels = opts.labels || data.map(function (_, i) { return String(i + 1); });
    var w = el.clientWidth || 600;
    var h = opts.height || 300;
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
  function toEChartsOption(opts) {
    var type = opts.type || "bar";
    var data = opts.data || [];
    var labels = opts.labels || data.map(function (_, i) { return String(i + 1); });
    if (type === "pie") {
      return { series: [{ type: "pie", radius: "65%", data: data.map(function (v, i) { return { name: labels[i], value: v }; }) }] };
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
    document.querySelectorAll("[data-sg-page]").forEach(function (page) {
      if (enterObserver) page.querySelectorAll("[data-sg-enter]").forEach(function (el) { enterObserver.observe(el); });
    });
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
  enter: "data-sg-enter",
  hover: "data-sg-hover",
} as const;
