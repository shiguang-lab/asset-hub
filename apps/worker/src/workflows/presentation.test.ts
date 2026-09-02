import { describe, expect, it } from "vitest";
import {
  applyPresentationRepairsPreservingPageCount,
  assemblePresentationFoundation,
  derivePresentationPageBudget,
  removeBoilerplateClosingSlides,
  globalVisualReviewContent,
  issuePageNumbers,
  matchRepairSections,
  mergeVisualReviews,
  normalizePresentationDataAttributes,
  namespacePresentationPageAnimations,
  pageTitlesForStreamPhase,
  parsePresentationAnnotation,
  parseVisualReview,
  preservePageIdentity,
  renderAuditErrorSignature,
  repairEscalationInstruction,
  shouldParkNoEffectRepair,
  repairGeneratedPresentationPageContract,
  repairGeneratedPresentationPageTitle,
  repairPresentationHtmlContract,
  replacePresentationPages,
  sanitizePresentationStyles,
  selectRepairSection,
  strictRetryInstruction,
  validateFinalPresentationPageSet,
  validateGeneratedPresentationPage,
  visualReviewContent,
} from "./presentation.js";

describe("presentation narrative budget", () => {
  it("keeps ordinary decks compact and reserves room for evidence grouping", () => {
    expect(
      derivePresentationPageBudget({ profile: "research", sourceLength: 12_000 }),
    ).toMatchObject({ target: 10, min: 8, max: 12, explicit: false });
    expect(derivePresentationPageBudget({ profile: "pitch", sourceLength: 12_000 })).toMatchObject({
      target: 9,
      min: 7,
      max: 11,
      explicit: false,
    });
  });

  it("honors an explicit page range", () => {
    expect(
      derivePresentationPageBudget({
        profile: "research",
        sourceLength: 40_000,
        requirements: "请控制在 6-8 页",
      }),
    ).toMatchObject({ target: 7, min: 6, max: 8, explicit: true });
  });

  it("removes a generic closing page unless the user explicitly asked for one", () => {
    const plan = {
      pageBudget: { target: 3, min: 3, max: 3, rationale: "测试" },
      slides: [
        { title: "核心结论", storyRole: "thesis" },
        { title: "报告结束｜数据可复现", storyRole: "closing" },
      ],
    } as Parameters<typeof removeBoilerplateClosingSlides>[0];
    expect(removeBoilerplateClosingSlides(plan).slides).toHaveLength(1);
    plan.slides[1]!.title = "谢谢观看";
    expect(removeBoilerplateClosingSlides(plan).slides).toHaveLength(1);
    expect(removeBoilerplateClosingSlides(plan, "请添加一页谢谢观看作为结束页").slides).toHaveLength(2);
    expect(removeBoilerplateClosingSlides(plan, "不要加谢谢观看页面").slides).toHaveLength(1);
  });
});

describe("presentation annotation boundary", () => {
  it("normalizes a bare element array from the model", () => {
    expect(parsePresentationAnnotation([{ id: "el-1", role: "body" }])).toEqual({
      elements: [{ id: "el-1", role: "body" }],
    });
  });

  it("keeps the wrapped annotation contract", () => {
    expect(parsePresentationAnnotation({ elements: [{ id: "el-2", editable: true }] })).toEqual({
      elements: [{ id: "el-2", editable: true }],
    });
  });

  it("normalizes nullable optional fields from the annotation model", () => {
    expect(parsePresentationAnnotation({ elements: [{ id: "el-3", groupId: null }] })).toEqual({
      elements: [{ id: "el-3" }],
    });
  });
});

describe("presentation page-local repair", () => {
  it("normalizes escaped JSON quotes in chart source attributes", () => {
    const normalized = normalizePresentationDataAttributes(
      `<div data-sg-source="[{\\"label\\":\\"已加固\\",\\"value\\":7}]" data-sg-kind="chart"></div>`,
    );
    expect(normalized).toContain('data-sg-source="[{&quot;label&quot;:&quot;已加固&quot;,&quot;value&quot;:7}]"');
  });

  it("salvages a section wrapped in a full document with scripts and head styles", () => {
    const output = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style data-sg-page-style>#page-1 .hero { font-size: 64px; color: #e0e0e0; }</style>
</head>
<body>
  <section data-sg-page="page-1" data-sg-id="page-1">
    <h1>PHO 同业 APK 人工深度分析报告</h1>
    <style data-sg-page-style>#page-1 .bg { position: absolute; }</style>
    <div class="bg">背景</div>
    <script>
      (function() { const canvas = document.getElementById('binary-stream'); })();
    </script>
  </section>
</body>
</html>`;
    const repaired = repairGeneratedPresentationPageContract(output);
    expect(repaired).not.toBeNull();
    expect(repaired).not.toMatch(/<script|<\/?(?:html|head|body)\b/i);
    expect(repaired).toContain("#page-1 .hero");
    expect(repaired).toContain("#page-1 .bg");
    const validated = validateGeneratedPresentationPage({
      output: repaired ?? "",
      expectedPage: 1,
      expectedTitle: "PHO 同业 APK 人工深度分析报告",
    });
    expect(validated.issues).toEqual([]);
    expect(validated.page?.section).toContain("PHO 同业 APK 人工深度分析报告");
  });

  it("returns null for multi-section or already-clean outputs", () => {
    const clean = `<section data-sg-page="page-1" data-sg-id="page-1"><h1>标题一</h1></section>`;
    expect(repairGeneratedPresentationPageContract(clean)).toBeNull();
    const two = `${clean}<section data-sg-page="page-2" data-sg-id="page-2"><h1>标题二</h1></section>`;
    expect(repairGeneratedPresentationPageContract(two)).toBeNull();
  });

  it("accepts only one page with the exact planned identity and title", () => {
    const result = validateGeneratedPresentationPage({
      output:
        '<section data-sg-page="page-2" data-sg-id="page-2"><h1>第二页</h1><div>正文</div></section><style>.x{}</style>',
      expectedPage: 2,
      expectedTitle: "第二页",
    });
    expect(result.issues).toEqual([]);
    expect(result.page?.page).toBe(2);
  });

  it("namespaces page keyframes and every page-local animation reference", () => {
    const result = validateGeneratedPresentationPage({
      output: `
        <section data-sg-page="page-2" data-sg-id="page-2">
          <h1>第二页</h1>
          <style>@keyframes scan { from { opacity: 0 } to { opacity: 1 } } .beam { animation: scan 1s ease both; }</style>
          <div class="animate-[scan_800ms_ease-out_forwards]" style="animation-name: scan">scan 文案不应改写</div>
        </section>
        <style>@-webkit-keyframes scan { from { opacity: 0 } to { opacity: 1 } } #page-2 .beam { -webkit-animation: scan 1s linear; }</style>`,
      expectedPage: 2,
      expectedTitle: "第二页",
    });

    expect(result.issues).toEqual([]);
    expect(result.page?.section).toContain("@keyframes page-2-scan");
    expect(result.page?.section).toContain("animation: page-2-scan 1s ease both");
    expect(result.page?.section).toContain("animate-[page-2-scan_800ms_ease-out_forwards]");
    expect(result.page?.section).toContain('style="animation-name: page-2-scan"');
    expect(result.page?.section).toContain("scan 文案不应改写");
    expect(result.page?.styles.join("\n")).toContain("@-webkit-keyframes page-2-scan");
    expect(result.page?.styles.join("\n")).toContain("-webkit-animation: page-2-scan 1s linear");
    if (!result.page) throw new Error("期望页面校验成功");
    expect(namespacePresentationPageAnimations(result.page)).toEqual(result.page);
  });

  it("keeps same-named animations isolated after pages are merged", () => {
    const makePage = (page: number, transform: string) =>
      validateGeneratedPresentationPage({
        output: `<section data-sg-page="page-${page}" data-sg-id="page-${page}"><h1>第${page}页</h1><div class="beam"></div></section><style>@keyframes scan { to { transform: ${transform} } } #page-${page} .beam { animation: scan 1s forwards; }</style>`,
        expectedPage: page,
        expectedTitle: `第${page}页`,
      }).page;
    const first = makePage(1, "translateX(100%)");
    const second = makePage(2, "translateY(1080px)");
    if (!first || !second) throw new Error("期望两页都通过校验");

    const html = assemblePresentationFoundation(
      "<!doctype html><html><head></head><body><!-- SG_GENERATED_SLIDES --></body></html>",
      [first.section, second.section],
      [...first.styles, ...second.styles],
    );

    expect(html).toContain("@keyframes page-1-scan");
    expect(html).toContain("@keyframes page-2-scan");
    expect(html).toContain("animation: page-1-scan 1s forwards");
    expect(html).toContain("animation: page-2-scan 1s forwards");
    expect(html).not.toMatch(/@keyframes\s+scan\b/);
  });

  it("accepts a semantic page prefix when the visible heading contains the planned core title", () => {
    const result = validateGeneratedPresentationPage({
      output:
        '<section data-sg-page="page-1" data-sg-id="page-1" aria-label="封面：24个APK的数字取证档案"><h1>24个APK的<br><span>数字取证</span>档案</h1></section>',
      expectedPage: 1,
      expectedTitle: "封面：24个APK的数字取证档案",
    });
    expect(result.issues).toEqual([]);
    expect(result.page?.page).toBe(1);
  });

  it("accepts a shortened range suffix in a planned section title", () => {
    const result = validateGeneratedPresentationPage({
      output:
        '<section data-sg-page="page-15" data-sg-id="page-15"><h1>逐应用核心信息(1-9号)</h1><div>内容</div></section>',
      expectedPage: 15,
      expectedTitle: "逐应用核心信息（1-12号）",
    });
    expect(result.issues).toEqual([]);
  });

  it("treats decimal and hexadecimal HTML entities as the same visible title", () => {
    for (const encodedTitle of ["分析完成 | Q&#38;A", "分析完成 | Q&#x26;A", "分析完成｜Q＆A"]) {
      const result = validateGeneratedPresentationPage({
        output: `<section data-sg-page="page-12" data-sg-id="page-12"><h1>${encodedTitle}</h1></section>`,
        expectedPage: 12,
        expectedTitle: "分析完成 | Q&A",
      });
      expect(result.issues).toEqual([]);
      expect(result.page?.page).toBe(12);
    }
  });

  it("uses the same entity normalization for final page-set validation", () => {
    const html =
      '<section data-sg-page="page-1" data-sg-id="page-1"><h1>分析完成 | Q&#x26;A</h1></section>';
    expect(validateFinalPresentationPageSet(html, ["分析完成 | Q&A"])).toEqual([]);
  });

  it("passes the concrete validation failure into the next retry prompt", () => {
    const instruction = strictRetryInstruction(
      2,
      "html",
      "data-sg-id 必须为 page-1，实际为 page-2",
    );
    expect(instruction).toContain("data-sg-id 必须为 page-1");
    expect(instruction).toContain("本轮修正要求");
  });

  it("escalates repeated visual repair instead of repeating micro-adjustments", () => {
    expect(repairEscalationInstruction(1, [])).toContain("逐项对应");
    expect(repairEscalationInstruction(2, ["第 5 页元素越出固定画布"])).toContain("不得只微调");
    expect(repairEscalationInstruction(3, ["第 5 页元素越出固定画布"])).toContain("紧凑矩阵");
    expect(repairEscalationInstruction(5, ["第 5 页元素越出固定画布"])).toContain("放弃原有构图");
  });

  it("jumps to structural repair when a pass reproduces the same issues", () => {
    const failures = ["第 5 页：el-ai-5-1 舞台有效字号 15.36px"];
    expect(repairEscalationInstruction(2, failures)).toContain("不得只微调");
    expect(repairEscalationInstruction(2, failures, true)).toContain("紧凑矩阵");
    expect(repairEscalationInstruction(2, failures, true)).toContain("先删除条目");
  });

  it("parks a page after two repair calls leave measurements unchanged", () => {
    expect(shouldParkNoEffectRepair({ noEffectAttempts: 1 })).toBe(false);
    expect(shouldParkNoEffectRepair({ noEffectAttempts: 2 })).toBe(true);
  });

  it("reviews only the selected page batch and includes every batch screenshot", () => {
    const slides = Array.from({ length: 4 }, (_, index) => ({
      title: `第 ${index + 1} 页`,
      purpose: "测试",
      layoutIntent: "网格",
      visualType: "表格",
      contentBudget: "保留事实",
      focalPoint: "结论",
      composition: "固定画布",
      visualBrief: "视觉",
      assetBrief: "无",
      motion: "无",
      storyRole: "evidence",
      relationship: "组合证据",
      evidence: ["测试事实 1", "测试事实 2"],
      takeaway: "测试结论",
    }));
    const plan: Parameters<typeof visualReviewContent>[0]["plan"] = {
      audience: "测试受众",
      coreMessage: "测试结论",
      narrative: "测试叙事",
      visualDirection: "专业",
      style: "简洁",
      palette: [],
      motion: "无",
      density: "speaker-led",
      styleCandidates: [],
      selectedStyle: "简洁",
      designSystem: {
        visualThesis: "清晰",
        displayFont: "Inter",
        bodyFont: "Inter",
        colors: [],
        spacing: "32px",
        grid: "12 列",
        shapeLanguage: "直角",
        chartLanguage: "直接标注",
        motionLanguage: "无",
      },
      pageBudget: {
        target: 4,
        min: 4,
        max: 4,
        rationale: "测试",
      },
      slides,
    };
    const content = visualReviewContent({
      plan,
      html: slides
        .map(
          (slide, index) =>
            `<section data-sg-page="page-${index + 1}"><h1>${slide.title}</h1></section>`,
        )
        .join(""),
      deterministicIssues: [],
      audit: {
        available: true,
        pageCount: 4,
        issues: [],
        slides: slides.map((slide, index) => ({
          page: index + 1,
          pageId: `page-${index + 1}`,
          title: slide.title,
          screenshotDataUrl: `data:image/jpeg;base64,page${index + 1}`,
          issueCount: 0,
        })),
        consoleErrors: [],
        summary: "4 页已渲染",
      },
      pageNumbers: [2, 3],
    });

    expect(content.filter((part) => part.type === "image_url")).toHaveLength(2);
    const prompt = content[0]?.type === "text" ? content[0].text : "";
    expect(prompt).toContain('data-sg-page=\\"page-2');
    expect(prompt).toContain('data-sg-page=\\"page-3');
    expect(prompt).not.toContain('data-sg-page=\\"page-1');
  });

  it("merges per-page review with the final global synthesis", () => {
    const batchReview = {
      summary: "逐页结论",
      needsRepair: true,
      issues: [{ severity: "error" as const, page: 2, problem: "越界", recommendation: "重排" }],
    };
    const globalReview = {
      summary: "全局结论",
      needsRepair: false,
      issues: [
        { severity: "warning" as const, page: null, problem: "重复", recommendation: "合并" },
      ],
    };

    expect(mergeVisualReviews([batchReview, globalReview])).toEqual({
      summary: "全局结论",
      needsRepair: true,
      issues: [...batchReview.issues, ...globalReview.issues],
    });
    expect(globalVisualReviewContent({ plan: {} as never, batchReviews: [] })[0]?.type).toBe(
      "text",
    );
  });

  it("omits positive review entries and keeps only actionable severities", () => {
    expect(
      parseVisualReview({
        summary: "第 8、9 页通过，第 7 页需修复",
        needsRepair: true,
        issues: [
          { severity: "error", page: 7, problem: "越界", recommendation: "重排" },
          { severity: "pass", page: 8, problem: "无问题", recommendation: "无需调整" },
          { severity: "good", page: 9, problem: "无问题", recommendation: "无需调整" },
        ],
      }).issues,
    ).toEqual([{ severity: "error", page: 7, problem: "越界", recommendation: "重排" }]);
  });

  it("still rejects unknown actionable review severities", () => {
    expect(() =>
      parseVisualReview({
        summary: "",
        needsRepair: true,
        issues: [{ severity: "critical", page: 7, problem: "越界", recommendation: "重排" }],
      }),
    ).toThrow();
  });

  it("repairs a structurally valid page whose h1 copied the focal point instead of the plan title", () => {
    const output =
      '<section data-sg-page="page-25" data-sg-id="page-25" aria-label="结束页：证据链的终点"><h1>身份隔离优先于<br><span>架构差异化</span></h1><p>保留正文</p></section>';
    const repaired = repairGeneratedPresentationPageTitle({
      output,
      expectedPage: 25,
      expectedTitle: "结束页：证据链的终点",
    });
    expect(repaired).toContain(">结束页：证据链的终点</h1>");
    expect(repaired).toContain("<p>保留正文</p>");
    expect(
      validateGeneratedPresentationPage({
        output: repaired ?? "",
        expectedPage: 25,
        expectedTitle: "结束页：证据链的终点",
      }).issues,
    ).toEqual([]);
  });

  it("rejects duplicate or wrong-identity page sections before checkpointing", () => {
    const result = validateGeneratedPresentationPage({
      output:
        '<section data-sg-page="page-2" data-sg-id="page-2"><h1>第二页</h1></section><section data-sg-page="page-2" data-sg-id="page-2"><h1>第二页</h1></section>',
      expectedPage: 2,
      expectedTitle: "第二页",
    });
    expect(result.page).toBeNull();
    expect(result.issues.join("；")).toContain("只能输出一个完整页面 section");
  });

  it("detects duplicate final page identities instead of trusting page count", () => {
    const html = `
      <section data-sg-page="page-1" data-sg-id="page-1"><h1>第一页</h1></section>
      <section data-sg-page="page-2" data-sg-id="page-1"><h1>第二页</h1></section>`;
    expect(validateFinalPresentationPageSet(html, ["第一页", "第二页"])).toContain(
      "最终页面存在重复 data-sg-id",
    );
  });

  it("keeps the full deck page count while streaming a repair batch", () => {
    const existingPages = Array.from({ length: 12 }, (_, index) => `页面 ${index + 1}`);
    const repairBatch = `
      <section data-sg-page="p7"><h1>第七页修复</h1></section>
      <section data-sg-page="p8"><h1>第八页修复</h1></section>
      <section data-sg-page="p9"><h1>第九页修复</h1></section>`;

    expect(pageTitlesForStreamPhase("repairing", existingPages, repairBatch)).toEqual(
      existingPages,
    );
    expect(pageTitlesForStreamPhase("rendering", existingPages, repairBatch)).toEqual([
      "第七页修复",
      "第八页修复",
      "第九页修复",
    ]);
  });

  it("removes accidental foundation preview pages before inserting planned pages", () => {
    const foundation = `<!doctype html><html><body><section data-sg-page="preview"><h1>预览</h1></section><!-- SG_GENERATED_SLIDES --></body></html>`;
    const pages = [
      `<section data-sg-page="1" data-sg-id="page-1"><h1>一</h1></section>`,
      `<section data-sg-page="2" data-sg-id="page-2"><h1>二</h1></section>`,
    ];

    const html = assemblePresentationFoundation(foundation, pages, []);

    expect(html.match(/data-sg-page=/g)).toHaveLength(2);
    expect(html).not.toContain("预览");
  });

  it("removes foundation preview overlays outside the page slot", () => {
    const foundation = `<!doctype html><html><head><style>.page{color:red}</style></head><body><!-- SG_GENERATED_SLIDES --><!-- 设计系统预览（仅用于开发阶段验证，运行时会被移除） --><div style="position:absolute;inset:0"><div>样本总量</div></div><!-- 预览结束 --></body></html>`;
    const html = assemblePresentationFoundation(
      foundation,
      [`<section data-sg-page="1" data-sg-id="page-1"><h1>一</h1></section>`],
      [],
    );

    expect(html).toContain(".page{color:red}");
    expect(html).toContain("page-1");
    expect(html).not.toContain("样本总量");
    expect(html.match(/<body\b[^>]*>[\s\S]*?<\/body>/i)?.[0]).toBe(
      '<body><section data-sg-page="1" data-sg-id="page-1"><h1>一</h1></section></body>',
    );
  });

  it("fills missing page headings from the matching plan title", () => {
    const html = `<section data-sg-page="1"><h1>已有标题</h1></section><section data-sg-page="2"><div>正文</div></section>`;

    const repaired = repairPresentationHtmlContract(html, "全局标题", ["第一页", "第二页"]);

    expect(repaired).toContain(">第一页</h1>");
    expect(repaired).toContain(">第二页</h1>");
    expect(repaired).not.toContain(">全局标题</h1>");
  });

  it("normalizes a rewritten heading back to its planned page title", () => {
    const html = `<section data-sg-page="1"><h1>被模型改写的短标题</h1><p>正文</p></section>`;

    const repaired = repairPresentationHtmlContract(html, "全局标题", ["计划中的完整标题"]);

    expect(repaired).toContain(">计划中的完整标题</h1>");
    expect(repaired).toContain("<p>正文</p>");
  });

  it("replaces a hidden heading with a visible planned title", () => {
    const html = `<section data-sg-page="1"><h1 style="display:none">计划标题</h1><p>正文</p></section>`;

    const repaired = repairPresentationHtmlContract(html, "全局标题", ["计划标题"]);

    expect(repaired).toContain(
      '<h1 data-sg-kind="text" data-sg-id="generated-page-title-1">计划标题</h1>',
    );
  });

  it("finds every page implicated by deterministic, render and review issues", () => {
    expect(
      issuePageNumbers({
        deterministicIssues: [{ code: "TITLE", message: "页面 page-07 缺少可见标题" }],
        renderAudit: {
          available: true,
          pageCount: 8,
          issues: [
            {
              code: "CLIP",
              severity: "error",
              page: 2,
              pageId: "page-02",
              message: "文本被裁切",
            },
          ],
          slides: [],
          consoleErrors: [],
          summary: "",
        },
        review: {
          summary: "",
          needsRepair: true,
          issues: [
            {
              severity: "error",
              page: 4,
              problem: "重心偏移",
              recommendation: "重新平衡",
            },
            {
              severity: "warning",
              page: 6,
              problem: "字号略小",
              recommendation: "后续可优化",
            },
          ],
        },
        pageCount: 8,
      }),
    ).toEqual([2, 4, 7]);
  });

  it("does not reuse stale visual-review pages after the first repair pass", () => {
    expect(
      issuePageNumbers({
        deterministicIssues: [],
        renderAudit: {
          available: true,
          pageCount: 8,
          issues: [
            {
              code: "CLIP",
              severity: "error",
              page: 7,
              pageId: "page-7",
              message: "文本被裁切",
            },
          ],
          slides: [],
          consoleErrors: [],
          summary: "",
        },
        review: {
          summary: "",
          needsRepair: true,
          issues: [
            {
              severity: "error",
              page: 2,
              problem: "旧审查问题",
              recommendation: "重新平衡",
            },
          ],
        },
        pageCount: 8,
        includeReviewIssues: false,
      }),
    ).toEqual([7]);
  });

  it("replaces only the requested page and preserves every other page", () => {
    const html = `<!doctype html><html><head></head><body>
<section data-sg-page="p1" data-sg-id="page-1"><h1>一</h1></section>
<section data-sg-page="p2" data-sg-id="page-2"><h1>二</h1></section>
<section data-sg-page="p3" data-sg-id="page-3"><h1>三</h1></section>
</body></html>`;
    const replacement = preservePageIdentity(
      `<section data-sg-page="p2" data-sg-id="page-2"><h1>二</h1></section>`,
      `<section data-sg-page="changed" data-sg-id="changed"><h1>二（已修复）</h1></section>`,
    );
    const repaired = replacePresentationPages(html, new Map([[2, replacement]]), ["#page-2{}"]);

    expect(repaired.match(/data-sg-page=/g)).toHaveLength(3);
    expect(repaired).toContain(`<section data-sg-page="p1" data-sg-id="page-1"><h1>一</h1>`);
    expect(repaired).toContain(
      `<section data-sg-page="p2" data-sg-id="page-2"><h1>二（已修复）</h1>`,
    );
    expect(repaired).toContain(`<section data-sg-page="p3" data-sg-id="page-3"><h1>三</h1>`);
    expect(repaired).toContain("data-sg-repair-page-styles");
  });

  it("drops a malformed repair page instead of swallowing an adjacent page", () => {
    const html = `<!doctype html><html><body>
<section data-sg-page="p1" data-sg-id="page-1"><h1>一</h1></section>
<section data-sg-page="p2" data-sg-id="page-2"><h1>二</h1></section>
<section data-sg-page="p3" data-sg-id="page-3"><h1>三</h1></section>
</body></html>`;
    const result = applyPresentationRepairsPreservingPageCount(
      html,
      new Map([[2, `<section data-sg-page="p2" data-sg-id="page-2"><h1>二（缺闭合标签）</h1>`]]),
      [],
      3,
      "测试演示",
    );
    expect(result.skippedPages).toEqual([2]);
    expect(result.html.match(/data-sg-page=/g)).toHaveLength(3);
    expect(result.html).toContain(">二</h1>");
    expect(result.html).toContain(">三</h1>");
  });

  it("selects the matching page when a repair response contains extra sections", () => {
    const original = `<section data-sg-page="p5" data-sg-id="page-5"><h2>原页</h2></section>`;
    const candidates = [
      `<section data-sg-page="p4" data-sg-id="page-4"><h2>错误页</h2></section>`,
      `<section data-sg-page="p5" data-sg-id="page-5"><h2>修复页</h2></section>`,
    ];

    expect(selectRepairSection(original, candidates)).toBe(candidates[1]);
    expect(selectRepairSection(original, [])).toBeNull();
  });

  it("accepts one repaired section and lets identity preservation correct its attributes", () => {
    const original = `<section data-sg-page="p6" data-sg-id="page-6"><h2>原页</h2></section>`;
    const candidate = `<section data-sg-page="wrong" data-sg-id="wrong"><h2>修复页</h2></section>`;
    const selected = selectRepairSection(original, [candidate]);

    expect(selected).toBe(candidate);
    expect(preservePageIdentity(original, selected ?? "")).toContain(
      `data-sg-page="p6" data-sg-id="page-6"`,
    );
  });

  it("salvages matching pages from an incomplete repair batch without duplicating one page", () => {
    const originals = [
      `<section data-sg-page="p4" data-sg-id="page-4"><h2>四</h2></section>`,
      `<section data-sg-page="p5" data-sg-id="page-5"><h2>五</h2></section>`,
      `<section data-sg-page="p6" data-sg-id="page-6"><h2>六</h2></section>`,
    ];
    const candidates = [
      `<section data-sg-page="p4" data-sg-id="page-4"><h2>四（已修复）</h2></section>`,
      `<section data-sg-page="p6" data-sg-id="page-6"><h2>六（已修复）</h2></section>`,
    ];

    const matched = matchRepairSections(originals, candidates);
    expect([...matched.keys()]).toEqual([0, 2]);
    expect(matched.get(0)).toContain("四（已修复）");
    expect(matched.get(2)).toContain("六（已修复）");
    expect(matched.has(1)).toBe(false);
  });

  it("normalizes authored viewport units to the 16:9 reference stage", () => {
    const html = `<style>.hero { width: 50vw; min-height: 25vh; } @media (max-width: 900px) { .grid { display: block; } }</style>`;
    const sanitized = sanitizePresentationStyles(html);

    expect(sanitized).toContain("width: 960px");
    expect(sanitized).toContain("min-height: 270px");
    expect(sanitized).toContain("@media (max-width: 900px)");
    expect(sanitized).not.toMatch(/\b(?:vw|vh|vmin|vmax)\b/);
  });

  it("rewrites dead .page-N selectors onto the guaranteed #page-N identity", () => {
    const html = `<style>
      .page-5 .bar-label { font-size: 28px; }
      .page-12 .grid { display: grid; }
      @keyframes page-5-growIn { to { transform: scaleX(1); } }
      .page-5-growIn { animation: page-5-growIn 1s; }
    </style>`;
    const sanitized = sanitizePresentationStyles(html);

    expect(sanitized).toContain("#page-5 .bar-label");
    expect(sanitized).toContain("#page-12 .grid");
    expect(sanitized).toContain("@keyframes page-5-growIn");
    expect(sanitized).toContain(".page-5-growIn {");
  });

  it("clamps flexible grid rows so content cannot push later blocks off stage", () => {
    const sanitized = sanitizePresentationStyles(
      `<style>#page-9 { grid-template-rows: 80px 1fr 140px 40px; }</style>`,
    );
    expect(sanitized).toContain("80px minmax(0, 1fr) 140px 40px");
  });
});

describe("renderAuditErrorSignature", () => {
  const audit = (issues: Array<Record<string, unknown>>) =>
    ({
      available: true,
      pageCount: 1,
      issues: issues as never,
      slides: [],
      consoleErrors: [],
      summary: "",
    }) as never;

  it("fingerprints element identity and measured design size", () => {
    const fontIssue = {
      code: "RENDER_FONT_TOO_SMALL",
      severity: "error",
      page: 5,
      pageId: "page-5",
      elementId: "el-ai-5-49",
      message: "el-ai-5-49 舞台有效字号 16px（设计 16px），低于 22px 下限：x",
    };
    expect(renderAuditErrorSignature(audit([fontIssue]), 5)).toBe(
      "RENDER_FONT_TOO_SMALL:el-ai-5-49:16",
    );
  });

  it("changes when a repair actually moved a measurement", () => {
    const before = {
      code: "RENDER_FONT_TOO_SMALL",
      severity: "error",
      page: 5,
      pageId: "page-5",
      elementId: "el-ai-5-49",
      message: "el-ai-5-49 舞台有效字号 16px（设计 16px），低于 22px 下限：x",
    };
    const after = { ...before, message: "…（设计 20px），低于 22px 下限：x" };
    expect(renderAuditErrorSignature(audit([before]), 5)).not.toBe(
      renderAuditErrorSignature(audit([after]), 5),
    );
  });

  it("ignores other pages and warning-severity issues", () => {
    const issue = {
      code: "RENDER_TEXT_CLIPPED",
      severity: "warning",
      page: 5,
      pageId: "page-5",
      elementId: "el-ai-5-1",
      message: "x",
    };
    const otherPage = { ...issue, severity: "error", page: 6 };
    expect(renderAuditErrorSignature(audit([issue, otherPage]), 5)).toBe("");
  });
});
