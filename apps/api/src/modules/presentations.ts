import {
  type PresentationRenderDocument,
  renderPresentationHtml,
  validatePresentationHtml,
} from "@shiguang/content";
import {
  nextId,
  nowIso,
  presentationOutlineSchema,
  presentationSectionSchema,
  presentationThemeSchema,
  slideSchema,
} from "@shiguang/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAssetAccess } from "../platform/authorization.js";
import { badRequest, notFound } from "../platform/errors.js";
import { loadEchartsJs } from "../platform/render.js";
import type { AppContext } from "../types.js";

export const presentationThemes = [
  { id: "light", name: "明亮", colors: ["#ffffff", "#172033", "#6d5dfc"] },
  { id: "dark", name: "深色", colors: ["#0f1420", "#f5f7ff", "#8b7bff"] },
  { id: "brand", name: "品牌", colors: ["#ffffff", "#1a2a4f", "#f04e2c"] },
  { id: "minimal", name: "极简", colors: ["#fafafa", "#111111", "#888888"] },
  { id: "gradient", name: "渐变", colors: ["#0d0b1e", "#ffffff", "#7c5cff"] },
] as const;

export const presentationLayouts = [
  { id: "title", name: "封面" },
  { id: "section", name: "章节页" },
  { id: "content", name: "内容页" },
  { id: "two-column", name: "双栏" },
  { id: "quote", name: "引用" },
  { id: "data", name: "数据页" },
  { id: "image", name: "图片" },
  { id: "closing", name: "结束页" },
] as const;

const outlineSchema = presentationOutlineSchema;

const OUTLINE_VISUALS = "default / metrics / chart / two-column / quote / timeline";

function buildOutlineSystemPrompt(): string {
  return `你是资深演示文稿策划。请阅读源内容后，提炼出**叙事结构（章节大纲）**，而不是简单地罗列标题。

核心原则（参考金字塔原理与断言-证据法）：
1. 每章提炼一个「结论先行」的断言式标题（完整句子，表达观点，而非"背景/现状/趋势"这类标签）。
2. 每章必须含 2~4 个具体要点（来自正文的数据、事实、判断），并尽量抽取可量化的数据点。
3. 章节之间要有清晰的叙事递进（现状→问题→分析→结论→行动）。

输出 JSON 结构：
{
  "title": "演示标题",
  "theme": "light | dark | brand | minimal | gradient",
  "aspectRatio": "16:9",
  "sections": [
    {
      "id": "sec-1",
      "title": "断言式章节标题（完整结论句）",
      "summary": "该章一句话概述",
      "points": ["要点1", "要点2"],
      "data": [
        { "id": "d1", "label": "指标名", "value": "数值", "note": "口径/来源/时间" }
      ],
      "visual": "${OUTLINE_VISUALS} 之一"
    }
  ]
}

要求：
- 章节数按内容体量：短文 3~5 章，长文 6~10 章。每章是一个相对独立的主题单元（生成时一个章节可再展开为多页）。
- 有量化数据时 visual 优先选 metrics（指标卡）或 chart（图表）；有对比选 two-column；有金句选 quote；有阶段演进选 timeline。
- 所有内容必须来自源内容，禁止编造数字；数据不足时 data 留空数组。
- 只输出 JSON，不要 Markdown 代码围栏、不要解释。`;
}

function fallbackOutline(
  sourceTitle: string,
  source: string,
  theme: string,
): Record<string, unknown> {
  const paragraphs = source
    .split(/\r?\n{2,}/)
    .map((p) => p.replace(/^#{1,6}\s*/, "").trim())
    .filter(Boolean);
  const sections = (paragraphs.length >= 2 ? paragraphs : [source]).slice(0, 8).map((text, i) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const title = lines[0] ?? `要点 ${i + 1}`;
    const points = lines.slice(1, 4);
    return {
      id: `sec-${i + 1}`,
      title,
      summary: title,
      points,
      data: [],
      visual: "default",
    };
  });
  return { title: sourceTitle || "演示文稿", theme, aspectRatio: "16:9", sections };
}

const pagePlanSchema = z.object({
  slides: z.array(slideSchema).min(1),
});

const _PAGE_LAYOUTS = "title / section / content / two-column / quote / data / closing";
const _PAGE_BLOCKS =
  "heading / text / bullet / image / chart / quote / metric / card / timeline / divider / table";

function buildPagePlanSystemPrompt(): string {
  return `你是演示页面规划师。把「章节大纲」展开为具体页面（一个章节可以拆成 1~3 页，按内容量与视觉类型决定，不要求 1:1）。

页面规划规则：
1. 第一页固定 layout=title（封面：标题 + 副标题文字块）；最后一页固定 layout=closing（总结页）。
2. 每个章节至少一页；内容丰富的章节拆成「章节引言页（layout=section）+ 内容页」。
3. 视觉类型映射到页面：
   - metrics → layout=content，用多个 metric 块（大数字指标卡，meta 带 label/value/note）；
   - chart → layout=data，用 chart 块（meta.chart 给 {type, data, labels}）；
   - two-column → layout=two-column，左右各放 card/heading+bullet；
   - quote → layout=quote，title 放金句，blocks 放出处；
   - timeline → layout=content，用 timeline 块（每行"时期：事件"）；
   - default → layout=content，heading + bullet。
4. 每页标题用断言式完整句；bullet 用短句，每条 ≤ 24 字；指标/图表数值必须来自大纲 data，不得编造。

输出 JSON（严格按下面结构）：
{
  "slides": [
    {
      "id": "s1",
      "layout": "title",
      "title": "封面标题",
      "blocks": [
        { "id": "b1", "type": "heading", "content": "副标题/一句定位" }
      ]
    },
    {
      "id": "s2",
      "layout": "content",
      "title": "断言式标题",
      "blocks": [
        { "id": "b2", "type": "metric", "content": "", "meta": { "label": "指标名", "value": "数值", "note": "口径" } },
        { "id": "b3", "type": "bullet", "content": "要点一\\n要点二" }
      ]
    }
  ]
}

只输出 JSON，不要 Markdown 代码围栏、不要解释。`;
}

/** 章节大纲 → 页面计划（1:N 展开）。AI 失败时回退为确定性 1:1 展开，保证可用。 */
async function expandOutlineToSlides(
  ctx: AppContext,
  title: string,
  theme: string,
  sections: Array<{
    id: string;
    title: string;
    summary: string;
    points: string[];
    data: Array<{ id: string; label: string; value: string; note?: string }>;
    visual: string;
  }>,
  source: string,
): Promise<z.infer<typeof slideSchema>[]> {
  const outlineJson = JSON.stringify({ title, theme, sections });
  try {
    const res = await ctx.ai.completeJson(
      {
        messages: [
          { role: "system", content: buildPagePlanSystemPrompt() },
          {
            role: "user",
            content: `章节大纲：\n${outlineJson}\n\n${
              source ? `源内容摘录（用于补全要点细节）：\n${source.slice(0, 24_000)}` : ""
            }`,
          },
        ],
        quality: "balanced",
        maxTokens: 16384,
      },
      pagePlanSchema,
    );
    if (res.data.slides.length > 0) return res.data.slides;
  } catch {
    // fall through to deterministic expansion
  }
  return deterministicSlides(title, sections);
}

function deterministicSlides(
  title: string,
  sections: Array<{
    id: string;
    title: string;
    summary: string;
    points: string[];
    data: Array<{ id: string; label: string; value: string; note?: string }>;
    visual: string;
  }>,
): z.infer<typeof slideSchema>[] {
  const slides: Array<{
    id: string;
    layout: string;
    title: string;
    blocks: Array<{
      id: string;
      type: string;
      content: string;
      meta?: Record<string, unknown>;
    }>;
    notes?: string;
  }> = [
    {
      id: "s1",
      layout: "title",
      title,
      blocks: [{ id: "b1", type: "text", content: sections.map((s) => s.title).join(" · ") }],
    },
  ];
  sections.forEach((section, i) => {
    const blocks: Array<{
      id: string;
      type: string;
      content: string;
      meta?: Record<string, unknown>;
    }> = [];
    if (section.visual === "metrics" && section.data.length > 0) {
      section.data.forEach((d) => {
        blocks.push({
          id: `b${i}-m-${d.id}`,
          type: "metric",
          content: "",
          meta: { label: d.label, value: d.value, note: d.note ?? "" },
        });
      });
    }
    if (section.visual === "timeline" && section.points.length > 0) {
      blocks.push({
        id: `b${i}-tl`,
        type: "timeline",
        content: section.points.join("\n"),
      });
    }
    if (blocks.length === 0 && section.points.length > 0) {
      blocks.push({
        id: `b${i}-pts`,
        type: "bullet",
        content: section.points.join("\n"),
      });
    }
    if (blocks.length === 0) {
      blocks.push({ id: `b${i}-summary`, type: "text", content: section.summary || section.title });
    }
    slides.push({
      id: `s${i + 2}`,
      layout:
        section.visual === "quote"
          ? "quote"
          : section.visual === "two-column"
            ? "two-column"
            : section.visual === "chart"
              ? "data"
              : "content",
      title: section.title,
      blocks,
    });
  });
  slides.push({
    id: `s${slides.length + 1}`,
    layout: "closing",
    title: "谢谢观看",
    blocks: [{ id: "b-end", type: "text", content: "核心结论回顾 · 行动建议" }],
  });
  return slides as z.infer<typeof slideSchema>[];
}

export function registerPresentations(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/presentations/themes", async () => presentationThemes);
  app.get("/api/v1/presentations/layouts", async () => presentationLayouts);

  app.post("/api/v1/presentations/generate", async (req) => {
    const body = z
      .object({
        assetId: z.string().optional(),
        title: z.string().max(200).optional(),
        sourceText: z.string().max(200_000).optional(),
        theme: z.enum(["light", "dark", "brand", "minimal", "gradient"]).optional(),
        templateId: z.string().optional(),
      })
      .parse(req.body);
    if (!body.assetId && !body.sourceText) {
      throw badRequest("SOURCE_REQUIRED", "需要提供 assetId 或 sourceText");
    }
    const spec: Record<string, unknown> = {
      assetId: body.assetId ?? null,
      sourceText: body.sourceText ?? null,
      title: body.title ?? "",
      theme: body.theme ?? "light",
      templateId: body.templateId ?? null,
    };
    if (body.assetId) {
      await requireAssetAccess(ctx, req.actor, body.assetId, "read");
      const sourceContent = await ctx.store.readContent(body.assetId);
      if (sourceContent?.text && !spec.sourceText) {
        spec.sourceText = sourceContent.text.slice(0, 20_000);
      }
    }
    const goal = body.title ?? (body.assetId ? `从资产生成在线演示` : "从文本生成在线演示");
    const task = await ctx.store.createTask(req.actor, {
      type: "presentation_generate",
      goal,
      spec,
      inputAssetIds: body.assetId ? [body.assetId] : [],
    });
    const estimate = { min: 150, max: 400 };
    const reserved = await ctx.store.reserveCredits(
      req.actor.workspaceId,
      task.id,
      estimate.max,
      `op_reserve_${task.id}`,
    );
    if (!reserved.ok) throw badRequest("CREDIT_INSUFFICIENT", "Credits 不足，无法生成演示", {});
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "task.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "task", id: task.id, version: 1 },
      trace: {},
      data: { taskId: task.id, taskType: "presentation_generate", spec },
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "presentation.generate",
      task.id,
      "success",
      {},
    );
    return { task, estimate };
  });

  /* ---------------- 大纲确认流程（生成 → 确认 → 创建） ---------------- */

  app.post("/api/v1/presentations/outline", async (req) => {
    const body = z
      .object({
        assetId: z.string().optional(),
        sourceText: z.string().max(100_000).optional(),
        title: z.string().max(200).optional(),
        theme: presentationThemeSchema.optional(),
      })
      .parse(req.body);
    if (!body.assetId && !body.sourceText) {
      throw badRequest("SOURCE_REQUIRED", "需要提供 assetId 或 sourceText");
    }
    let source = body.sourceText ?? "";
    let sourceTitle = body.title ?? "";
    if (body.assetId) {
      const asset = await requireAssetAccess(ctx, req.actor, body.assetId, "read");
      const content = await ctx.store.readContent(body.assetId);
      source = content?.text ?? "";
      sourceTitle = sourceTitle || asset.title;
    }
    const theme = body.theme ?? "light";
    let outline: Record<string, unknown>;
    let provider = "model-gateway";
    try {
      const res = await ctx.ai.completeJson(
        {
          messages: [
            {
              role: "system",
              content: buildOutlineSystemPrompt(),
            },
            {
              role: "user",
              content: `title: ${sourceTitle}\ntheme: ${theme}\nsource:\n${source.slice(0, 40_000)}`,
            },
          ],
          quality: "balanced",
          maxTokens: 8192,
        },
        outlineSchema,
      );
      provider = res.provider;
      outline = res.data as Record<string, unknown>;
      if (!Array.isArray(outline.sections) || outline.sections.length === 0) {
        outline = fallbackOutline(sourceTitle, source, theme);
      }
    } catch {
      outline = fallbackOutline(sourceTitle, source, theme);
    }
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "presentation.outline",
      "presentation",
      "success",
      {},
    );
    return {
      outline: outline as {
        title: string;
        theme: string;
        aspectRatio: string;
        sections: unknown[];
      },
      provider,
    };
  });

  app.post("/api/v1/presentations/outline/confirm", async (req) => {
    const body = z
      .object({
        title: z.string().min(1).max(200),
        theme: presentationThemeSchema,
        aspectRatio: z.enum(["16:9", "4:3", "9:16"]),
        sections: z.array(presentationSectionSchema).min(1),
        sourceText: z.string().max(200_000).optional(),
        sourceAssetId: z.string().optional(),
      })
      .parse(req.body);

    // 读取源内容（用于让生成结果忠实于文档，而非仅靠大纲标题）
    let source = body.sourceText ?? "";
    if (body.sourceAssetId && !source) {
      const content = await ctx.store.readContent(body.sourceAssetId).catch(() => null);
      source = content?.text ?? "";
    }

    // 章节大纲 → 页面计划（1:N 展开，允许一个章节拆多页）
    const slides = await expandOutlineToSlides(ctx, body.title, body.theme, body.sections, source);

    const document = { theme: body.theme, aspectRatio: body.aspectRatio, slides };
    const html = renderPresentationHtml(document as PresentationRenderDocument, body.title, {
      echartsJs: loadEchartsJs(),
    });
    const asset = await ctx.store.createAssetWithVersion(req.actor, {
      type: "presentation",
      title: body.title,
      sourceType: "template",
      content: {
        kind: "html",
        text: html,
        manifest: null,
        refs: [],
      },
    });
    if (body.sourceAssetId) {
      await requireAssetAccess(ctx, req.actor, body.sourceAssetId, "read");
      await ctx.store.addRelation(
        req.actor.workspaceId,
        body.sourceAssetId,
        asset.asset.id,
        "generated_from",
        {
          via: "outline-confirm",
        },
      );
    }
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "asset.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "asset", id: asset.asset.id, version: 1 },
      trace: {},
      data: { assetId: asset.asset.id, assetType: "presentation" },
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "presentation.create",
      asset.asset.id,
      "success",
      {
        sections: body.sections.length,
        slides: slides.length,
      },
    );
    return asset.asset;
  });

  app.get("/api/v1/presentations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (asset?.type !== "presentation") {
      return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    }
    const content = await ctx.store.readContent(id);
    const html =
      content?.text ?? renderPresentationHtml({ theme: "light", slides: [] }, asset.title);
    return { asset, html };
  });

  app.put("/api/v1/presentations/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ html: z.string().max(2_000_000) }).parse(req.body);
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (asset?.type !== "presentation") throw notFound("演示");
    const issues = validatePresentationHtml(body.html);
    if (issues.length > 0) {
      throw badRequest(
        "PRESENTATION_HTML_INVALID",
        `HTML 校验失败：${issues.map((i) => i.message).join("；")}`,
      );
    }
    const saved = await ctx.store.saveContent(
      req.actor,
      id,
      { kind: "html", text: body.html, manifest: null, refs: [] },
      { changeKind: "edit" },
    );
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "asset.version.created",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "asset", id, version: saved.asset.lockVersion },
      trace: {},
      data: { assetId: id, versionId: saved.version.id, contentHash: saved.version.contentHash },
    });
    return saved.asset;
  });

  app.post("/api/v1/presentations/:id/ai-edit", async (req) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({
        scope: z.enum(["element", "page", "presentation"]),
        targetId: z.string().optional(),
        instruction: z.string().max(2000).default("让内容更精炼、更有冲击力"),
      })
      .parse(req.body);
    const result = await runAiEdit(
      ctx,
      req.actor.workspaceId,
      req.actor.subject,
      id,
      body.scope,
      body.targetId ?? null,
      body.instruction,
    );
    return result;
  });

  /* ---------------- 兼容旧接口：幻灯片级重生成 = page 作用域 AI 修改 ---------------- */

  app.post("/api/v1/presentations/:id/slides/:slideId/regenerate", async (req) => {
    const { id, slideId } = req.params as { id: string; slideId: string };
    const instruction = String(
      (req.body as { instruction?: string } | undefined)?.instruction ?? "让内容更精炼、更有冲击力",
    );
    const result = await runAiEdit(
      ctx,
      req.actor.workspaceId,
      req.actor.subject,
      id,
      "page",
      slideId,
      instruction,
    );
    return { proposal: result.proposal, provider: result.provider };
  });
}

async function runAiEdit(
  ctx: AppContext,
  workspaceId: string,
  subject: string,
  id: string,
  scope: "element" | "page" | "presentation",
  targetId: string | null,
  instruction: string,
): Promise<{
  revisionId: string;
  scope: "element" | "page" | "presentation";
  targetId: string | null;
  proposal: string;
  provider: string;
}> {
  const asset = await ctx.store.getAsset(workspaceId, id);
  if (asset?.type !== "presentation") throw notFound("演示");
  const content = await ctx.store.readContent(id);
  const html = content?.text ?? "";

  const scopeHint =
    scope === "presentation"
      ? "只输出完整 HTML 文档"
      : scope === "page"
        ? `只输出完整 HTML 文档，但仅修改 data-sg-id="${targetId ?? ""}" 这一页`
        : `只输出完整 HTML 文档，但仅修改 data-sg-id="${targetId ?? ""}" 这个元素`;

  const res = await ctx.ai.complete({
    messages: [
      {
        role: "system",
        content:
          "你是 Web Presentation 助手，直接修改 HTML Artifact。必须保持 data-sg-* 协议、SG Runtime 调用与整体结构不变，只输出修改后的完整 HTML（不要代码围栏、不要解释）。",
      },
      {
        role: "user",
        content: `presentation-ai-edit\nscope: ${scope}\ntargetId: ${targetId ?? ""}\ninstruction: ${instruction}\n${scopeHint}\n当前 HTML:\n${html.slice(0, 120_000)}`,
      },
    ],
    quality: "balanced",
  });

  await ctx.store.audit(workspaceId, subject, "presentation.ai_edit", id, "success", {
    scope,
  });
  return {
    revisionId: nextId("rev"),
    scope,
    targetId,
    proposal: stripCodeFence(res.text),
    provider: res.provider,
  };
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}
