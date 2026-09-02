import { describe, expect, it } from "vitest";
import {
  ensurePresentationRuntimeHtml,
  renderPresentationAccessHtml,
  renderPresentationHtml,
  stripPresentationPlatformShell,
  validatePresentationDocumentQuality,
  validatePresentationHtml,
} from "./presentation.js";
import { instrumentPresentationHtml } from "./presentation-instrument.js";
import { SG_STATICIZE_CSS } from "./presentation-runtime.js";

const doc = {
  theme: "light",
  slides: [
    {
      id: "s1",
      layout: "title",
      layoutVariant: "hero-center",
      title: "封面",
      blocks: [{ id: "b1", type: "heading", content: "新能源汽车市场" }],
    },
    {
      id: "s2",
      layout: "content",
      title: "要点",
      blocks: [
        { id: "b2", type: "heading", content: "核心要点" },
        { id: "b3", type: "chart", content: "1 2 3" },
      ],
    },
  ],
};

describe("renderPresentationHtml", () => {
  it("renders source HTML with data-sg-* protocol but no platform player", () => {
    const html = renderPresentationHtml(doc as never, "演示标题");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('data-sg-page="title"');
    expect(html).toContain('data-sg-id="b1"');
    expect(html).toContain('data-sg-kind="chart"');
    expect(html).toContain("sg-layout-hero-center");
    expect(html).not.toContain("data-sg-presentation-player");
    expect(html).not.toContain("SG.presentation({");
  });

  it("does not fabricate chart values when the chart block has no numbers", () => {
    const html = renderPresentationHtml(
      {
        theme: "light",
        slides: [
          {
            id: "s1",
            layout: "data",
            title: "待补充数据",
            blocks: [{ id: "c1", type: "chart", content: "趋势图" }],
          },
        ],
      },
      "t",
    );
    expect(html).toContain(
      "data-sg-chart='{&quot;type&quot;:&quot;bar&quot;,&quot;data&quot;:[]}'",
    );
    expect(html).not.toContain("1,2,3");
  });

  it("escapes user content", () => {
    const html = renderPresentationHtml(
      {
        theme: "light",
        slides: [
          {
            id: "s1",
            layout: "content",
            title: "x",
            blocks: [{ id: "b1", type: "heading", content: "<script>" }],
          },
        ],
      },
      "t",
    );
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("validatePresentationHtml", () => {
  it("accepts clean presentation HTML", () => {
    const html = renderPresentationHtml(doc as never, "t");
    expect(validatePresentationHtml(html)).toEqual([]);
  });

  it("allows external scripts/styles while rejecting dangerous execution and network APIs", () => {
    const issues = validatePresentationHtml(
      `<section data-sg-page="a"></section><script src="https://x/a.js"></script><script>eval("1"); fetch("/x");</script>`,
    );
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("EVAL_NOT_ALLOWED");
    expect(codes).toContain("NETWORK_NOT_ALLOWED");
  });

  it("accepts scripts and stylesheets from any external origin", () => {
    const issues = validatePresentationHtml(
      `<section data-sg-page="a"><h1>标题</h1></section><script src="https://cdn.jsdelivr.net/npm/echarts"></script><link href="https://unpkg.com/a.css" />`,
    );
    expect(issues).toEqual([]);
  });

  it("rejects model prompt leakage rendered as slide content", () => {
    const issues = validatePresentationHtml(
      `<section data-sg-page="a"><h1>system: 你是 Web Presentation 生成专家</h1></section>`,
    );
    expect(issues.map((issue) => issue.code)).toContain("PROMPT_CONTENT_LEAKED");
  });

  it("allows capability contract terminology from legitimate source material", () => {
    const issues = validatePresentationHtml(
      `<section data-sg-page="content"><h1>能力契约与版本协商</h1></section>`,
    );
    expect(issues.map((issue) => issue.code)).not.toContain("PROMPT_CONTENT_LEAKED");
  });

  it("requires at least one data-sg-page", () => {
    expect(validatePresentationHtml("<p>no page</p>").map((i) => i.code)).toContain("NO_PAGE");
  });
});

describe("ensurePresentationRuntimeHtml", () => {
  it("injects the fixed stage and runtime exactly once", () => {
    const source = `<!doctype html><html><head></head><body><section data-sg-page="title"><h1>标题</h1></section></body></html>`;
    const once = ensurePresentationRuntimeHtml(source);
    const twice = ensurePresentationRuntimeHtml(once);
    expect(once).toContain("data-sg-platform-stage");
    expect(once).toContain("width: 1920px");
    expect(once).not.toContain('classList.add("sg-enter-active")');
    expect(once).not.toContain('classList.remove("sg-enter-active")');
    expect(once).toContain("__sgAuthoredDisplay");
    expect(once).not.toContain("[data-sg-page].sg-active { display: flex; }");
    expect(once).toContain("SG.presentation");
    expect(once).toContain(
      '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,',
    );
    expect(twice.match(/data-sg-platform-stage/g)).toHaveLength(1);
    expect(twice.match(/data-sg-platform-runtime/g)).toHaveLength(1);
  });

  it("repairs legacy page selectors before iframe or public playback", () => {
    const source = `<!doctype html><html><head><style>#page-4 .metric{display:grid}</style></head><body><section data-sg-page="data" data-sg-id="page-4"><div class="metric">内容</div></section></body></html>`;
    const result = ensurePresentationRuntimeHtml(source);
    expect(result).toContain('data-sg-id="page-4" id="page-4"');
  });

  it("mirrors the page identity as a class so .page-N author CSS matches the section", () => {
    const bare = `<!doctype html><html><head></head><body><section data-sg-page="page-2" data-sg-id="page-2"><h1>标题</h1></section></body></html>`;
    expect(ensurePresentationRuntimeHtml(bare)).toContain('class="page-2"');

    const withClass = `<!doctype html><html><head></head><body><section data-sg-page="page-3" data-sg-id="page-3" class="cover dark"><h1>标题</h1></section></body></html>`;
    const result = ensurePresentationRuntimeHtml(withClass);
    expect(result).toContain('class="cover dark page-3"');
  });

  it("resolves the mirrored class from data-sg-page when data-sg-id is absent", () => {
    const source = `<!doctype html><html><head></head><body><section data-sg-page="page-7"><h1>标题</h1></section></body></html>`;
    const result = ensurePresentationRuntimeHtml(source);
    expect(result).toContain('id="page-7"');
    expect(result).toContain('class="page-7"');
  });

  it("upgrades an existing platform runtime instead of preserving stale chart behavior", () => {
    const source = `<!doctype html><html><head><style data-sg-platform-stage>old stage</style></head><body><section data-sg-page="title"><h1>标题</h1></section><script data-sg-platform-runtime>old SG.chart behavior</script></body></html>`;
    const upgraded = ensurePresentationRuntimeHtml(source);
    expect(upgraded).not.toContain("old SG.chart behavior");
    expect(upgraded).toContain("el.__sgEcharts = chart");
    expect(upgraded).toContain("SG.resizeCharts");
    expect(upgraded.match(/data-sg-platform-stage/g)).toHaveLength(1);
    expect(upgraded.match(/data-sg-platform-runtime/g)).toHaveLength(1);
  });

  it("adds the selected player mode to the generated artifact, not at gateway response time", () => {
    const source = `<!doctype html><html><head></head><body><section data-sg-page="title"><h1>标题</h1></section></body></html>`;
    const full = ensurePresentationRuntimeHtml(source, { player: "full" });
    const engine = ensurePresentationRuntimeHtml(source, { player: "engine" });
    expect(full).toContain('data-sg-player-ui="true"');
    expect(engine).toContain('data-sg-player-ui="false"');
    expect(
      ensurePresentationRuntimeHtml(full, { player: "full" }).match(/data-sg-presentation-player/g),
    ).toHaveLength(1);
  });

  it("composes the current access shell around source HTML", () => {
    const source =
      '<!doctype html><html><head></head><body><section data-sg-page="title"><h1>标题</h1></section></body></html>';
    const result = renderPresentationAccessHtml(source, {
      visibility: "unlisted",
      allowCopy: true,
      downloadHref: "/s/demo/download",
    });
    expect(result).toContain("data-sg-presentation-player");
    expect(result).toContain("data-sg-player-downloads hidden");
    expect(result).toContain('href="/s/demo/download"');
  });

  it("strips legacy platform shell before re-composition", () => {
    const legacy =
      '<html><body><div id="sg-progress"></div><section data-sg-page="title"></section><script data-sg-platform-runtime>SG.presentation()</script></body></html>';
    const source = stripPresentationPlatformShell(legacy);
    expect(source).not.toContain("sg-progress");
    expect(source).not.toContain("data-sg-platform-runtime");
  });

  it("strips leaked foundation preview overlays before publishing", () => {
    const legacy = `<html><body><!-- 设计系统预览（仅用于开发阶段验证，运行时会被移除） --><div style="position:absolute;inset:0">浮层内容</div><!-- 预览结束 --><section data-sg-page="title"><h1>标题</h1></section></body></html>`;
    const source = stripPresentationPlatformShell(legacy);
    expect(source).not.toContain("设计系统预览");
    expect(source).not.toContain("浮层内容");
    expect(source).toContain('data-sg-page="title"');
  });
});

describe("instrumentPresentationHtml", () => {
  it("mirrors the page identity as id and class so #page-N and .page-N CSS both match", () => {
    const html = `<section data-sg-page="page-3" data-sg-id="page-3"><h1 class="headline">标题</h1><p>正文内容</p></section>`;
    const result = instrumentPresentationHtml(html);
    expect(result.html).toContain('id="page-3"');
    expect(result.html).toContain('class="page-3"');
    // Existing page elements are instrumented without losing their classes.
    expect(result.html).toContain('class="headline"');
  });

  it("renumbers echoed duplicate data-sg-id values instead of keeping collisions", () => {
    const html = `<section data-sg-page="page-2" data-sg-id="page-2"><h1 data-sg-id="el-ai-2-5">一</h1><p data-sg-id="el-ai-2-5">重复</p><p>新增</p></section>`;
    const result = instrumentPresentationHtml(html);
    const ids = [...result.html.matchAll(/data-sg-id="(el-ai-\d+-\d+)"/g)].map((match) => match[1]);
    expect(ids.length).toBe(3);
    expect(new Set(ids).size).toBe(ids.length);
    // The first echo keeps its identity; only the duplicate is renumbered.
    expect(ids[0]).toBe("el-ai-2-5");
  });
});

describe("SG_STATICIZE_CSS", () => {
  it("seeks authored animations to their terminal state before freezing edits", () => {
    expect(SG_STATICIZE_CSS).toContain("animation-duration: 0s !important");
    expect(SG_STATICIZE_CSS).toContain("animation-delay: 0s !important");
    expect(SG_STATICIZE_CSS).toContain("animation-fill-mode: forwards !important");
    expect(SG_STATICIZE_CSS).toContain("animation-play-state: running !important");
    expect(SG_STATICIZE_CSS).toContain("opacity: 1 !important");
    expect(SG_STATICIZE_CSS).toContain("visibility: visible !important");
    expect(SG_STATICIZE_CSS).toContain("transform: none !important");
    expect(SG_STATICIZE_CSS.split("html[data-sg-static=\"1\"] [data-sg-page] [data-sg-enter]")[0]).not.toContain(
      "transform: none !important",
    );
    expect(SG_STATICIZE_CSS).not.toContain("animation: none !important");
    expect(SG_STATICIZE_CSS).toContain("transition: none");
  });
});

describe("validatePresentationDocumentQuality", () => {
  it("accepts real metric and chart blocks", () => {
    const issues = validatePresentationDocumentQuality({
      theme: "light",
      slides: [
        {
          id: "s1",
          layout: "title",
          title: "标题",
          blocks: [{ id: "b1", type: "text", content: "定位" }],
        },
        {
          id: "s2",
          layout: "content",
          title: "收入增长形成主要证据",
          blocks: [
            {
              id: "m1",
              type: "metric",
              content: "38",
              meta: { label: "收入同比", value: 38, unit: "%" },
            },
          ],
        },
        {
          id: "s3",
          layout: "data",
          title: "增长在最近三年持续加速",
          blocks: [
            {
              id: "c1",
              type: "chart",
              content: "增长趋势",
              meta: { chart: { type: "line", labels: ["2023", "2024"], data: [10, 20] } },
            },
          ],
        },
        {
          id: "s4",
          layout: "closing",
          title: "下一步",
          blocks: [{ id: "b4", type: "text", content: "行动" }],
        },
      ],
    });
    expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("rejects charts without real data and warns on text-only pages", () => {
    const issues = validatePresentationDocumentQuality({
      theme: "light",
      slides: [
        {
          id: "s1",
          layout: "data",
          title: "没有真实数据",
          blocks: [{ id: "c1", type: "chart", content: "图表", meta: {} }],
        },
        {
          id: "s2",
          layout: "content",
          title: "只有文字",
          blocks: [{ id: "b1", type: "bullet", content: "一\n二" }],
        },
      ],
    });
    expect(issues.map((issue) => issue.code)).toContain("CHART_DATA_MISSING");
    expect(issues.map((issue) => issue.code)).toContain("TEXT_ONLY_SLIDE");
  });
});
