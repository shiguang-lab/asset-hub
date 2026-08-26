import {
  ensurePresentationRuntimeHtml,
  renderPresentationHtml,
  stripPresentationPlatformShell,
  validatePresentationHtml,
} from "@shiguang/content";
import { nextId, nowIso } from "@shiguang/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAssetAccess } from "../platform/authorization.js";
import { badRequest, notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";

export const presentationThemes = [
  { id: "light", name: "明亮", colors: ["#ffffff", "#172033", "#6d5dfc"] },
  { id: "dark", name: "深色", colors: ["#0f1420", "#f5f7ff", "#8b7bff"] },
  { id: "brand", name: "品牌", colors: ["#ffffff", "#1a2a4f", "#f04e2c"] },
  { id: "minimal", name: "极简", colors: ["#fafafa", "#111111", "#888888"] },
  { id: "gradient", name: "渐变", colors: ["#0d0b1e", "#ffffff", "#7c5cff"] },
] as const;

/* Structured outline/page-plan compiler removed: generation is HTML-first.
function blocksForSection(section: PlanSection, index: number): PlanBlock[] {
  const data = section.data;
  switch (section.visual) {
    case "dashboard": {
      const blocks: PlanBlock[] = [];
      if (data.chart && data.chart.data.length > 0) {
        blocks.push({
          id: `b${index}-dashboard-chart`,
          type: "chart",
          content: data.chart.title || section.title,
          meta: {
            chart: { type: data.chart.type, labels: data.chart.labels, data: data.chart.data },
            sourceRef: data.chart.sourceRef,
          },
        });
      }
      if (data.table && data.table.headers.length > 0) {
        blocks.push({
          id: `b${index}-dashboard-table`,
          type: "table",
          content: [data.table.headers, ...data.table.rows].map((row) => row.join("\t")).join("\n"),
          meta: { sourceRef: data.table.sourceRef },
        });
      }
      if (data.metrics.length > 0) {
        blocks.push(
          ...data.metrics
            .slice(0, 3)
            .map((metric, metricIndex) => ({
              id: metric.id || `b${index}-dashboard-metric-${metricIndex}`,
              type: "metric" as const,
              content: String(metric.value),
              meta: {
                label: metric.label,
                value: metric.value,
                unit: metric.unit,
                note: metric.note,
                sourceRef: metric.sourceRef,
              },
            })),
        );
      }
      return blocks.length > 0 ? blocks : fallbackTextBlocks(section, index);
    }
    case "process":
    case "rising": {
      const items =
        data.timeline.length > 0
          ? data.timeline.map((item) => `${item.period}：${item.event}`)
          : section.points;
      return items.length
        ? [
            {
              id: `b${index}-${section.visual}`,
              type: "card",
              content: items.join("\n"),
              meta: { visual: section.visual === "process" ? "process" : "rising" },
            },
          ]
        : fallbackTextBlocks(section, index);
    }
    case "quadrant": {
      const items = data.compare
        ? [data.compare.left, data.compare.right].flatMap((side) => [side.title, side.body])
        : section.points;
      return items.length
        ? [
            {
              id: `b${index}-quadrant`,
              type: "card",
              content: items.slice(0, 4).join("\n"),
              meta: { visual: "quadrant" },
            },
          ]
        : fallbackTextBlocks(section, index);
    }
    case "metrics": {
      const metrics = data.metrics.slice(0, 4);
      if (metrics.length > 0) {
        return metrics.map((metric, metricIndex) => ({
          id: metric.id || `b${index}-metric-${metricIndex + 1}`,
          type: "metric",
          content: String(metric.value),
          meta: {
            label: metric.label,
            value: metric.value,
            unit: metric.unit,
            note: metric.note,
            sourceRef: metric.sourceRef,
          },
        }));
      }
      return fallbackTextBlocks(section, index);
    }
    case "chart": {
      if (data.chart && data.chart.data.length > 0) {
        const blocks: PlanBlock[] = [];
        if (section.summary.trim()) {
          blocks.push({
            id: `b${index}-chart-summary`,
            type: "text",
            content: section.summary,
            meta: {},
          });
        }
        blocks.push({
          id: `b${index}-chart`,
          type: "chart",
          content: data.chart.title || section.title,
          meta: {
            chart: {
              type: data.chart.type,
              labels: data.chart.labels,
              data: data.chart.data,
            },
            unit: data.chart.unit,
            sourceRef: data.chart.sourceRef,
          },
        });
        return blocks;
      }
      return fallbackTextBlocks(section, index);
    }
    case "two-column": {
      if (data.compare) {
        const sides = [data.compare.left, data.compare.right];
        return sides.map((side, sideIndex) => ({
          id: `b${index}-compare-${sideIndex + 1}`,
          type: "card",
          content: [side.body, ...side.points].filter(Boolean).join("\n"),
          meta: { title: side.title, sourceRef: side.sourceRef },
        }));
      }
      const midpoint = Math.ceil(section.points.length / 2);
      const left = section.points.slice(0, midpoint);
      const right = section.points.slice(midpoint);
      if (left.length > 0 || right.length > 0) {
        return [
          {
            id: `b${index}-compare-1`,
            type: "card",
            content: left.join("\n"),
            meta: { title: "关键发现" },
          },
          {
            id: `b${index}-compare-2`,
            type: "card",
            content: right.join("\n"),
            meta: { title: "对应影响" },
          },
        ];
      }
      return fallbackTextBlocks(section, index);
    }
    case "quote": {
      if (data.quote?.text) {
        return [
          {
            id: `b${index}-quote`,
            type: "quote",
            content: data.quote.text,
            meta: { author: data.quote.author, sourceRef: data.quote.sourceRef },
          },
        ];
      }
      const quote = section.points[0] || section.summary || section.title;
      return [{ id: `b${index}-quote`, type: "quote", content: quote, meta: {} }];
    }
    case "timeline": {
      const items =
        data.timeline.length > 0
          ? data.timeline.map((item) => `${item.period}：${item.event}`)
          : section.points;
      if (items.length > 0) {
        return [
          { id: `b${index}-timeline`, type: "timeline", content: items.join("\n"), meta: {} },
        ];
      }
      return fallbackTextBlocks(section, index);
    }
    case "image": {
      const asset = data.assets.find((candidate) => candidate.src.trim());
      if (asset) {
        return [
          {
            id: asset.id || `b${index}-image`,
            type: "image",
            content: asset.src,
            meta: {
              alt: asset.alt,
              caption: asset.caption,
              sourceRef: asset.sourceRef,
              focalPoint: asset.focalPoint,
            },
          },
          ...(section.summary
            ? [
                {
                  id: `b${index}-image-copy`,
                  type: "text" as const,
                  content: section.summary,
                  meta: {},
                },
              ]
            : []),
        ];
      }
      return fallbackTextBlocks(section, index);
    }
    default:
      return fallbackTextBlocks(section, index);
  }
}

function layoutForVisual(visual: string): Slide["layout"] {
  switch (visual) {
    case "quote":
      return "quote";
    case "two-column":
      return "two-column";
    case "chart":
      return "data";
    default:
      return "content";
  }
}

function hasVisualForSection(slide: Slide, section: PlanSection): boolean {
  switch (section.visual) {
    case "metrics":
      return slide.blocks.some((block) => block.type === "metric");
    case "chart":
      return slide.blocks.some((block) => {
        if (block.type !== "chart") return false;
        const chart = block.meta.chart;
        return (
          typeof chart === "object" &&
          chart !== null &&
          Array.isArray((chart as Record<string, unknown>).data) &&
          ((chart as Record<string, unknown>).data as unknown[]).length > 0
        );
      });
    case "two-column":
      return slide.blocks.filter((block) => block.type === "card").length >= 2;
    case "quote":
      return slide.blocks.some((block) => block.type === "quote");
    case "timeline":
      return slide.blocks.some((block) => block.type === "timeline");
    case "image":
      return slide.blocks.some(
        (block) => block.type === "image" && block.content.trim().length > 0,
      );
    default:
      return true;
  }
}

//
 * AI 页面计划仍可能把视觉类型退化成 bullet。这里按 section.data 做一次
 * 结构化修复，保留 AI 的标题和拆页结果，但不允许 chart/metric 等语义丢失。
//
function repairGeneratedSlides(slides: Slide[], sections: PlanSection[]): Slide[] {
  let cursor = 0;
  return slides.map((slide, slideIndex) => {
    if (slide.layout === "title" || slide.layout === "closing") return slide;
    const section =
      (slide.sectionId && sections.find((candidate) => candidate.id === slide.sectionId)) ||
      sections[Math.min(cursor++, sections.length - 1)];
    if (!section) return slide;
    if (hasVisualForSection(slide, section)) {
      return {
        ...slide,
        sectionId: section.id,
        layoutVariant: slide.layoutVariant || layoutVariantForVisual(section.visual, slideIndex),
      };
    }
    return {
      ...slide,
      sectionId: section.id,
      layoutVariant: layoutVariantForVisual(section.visual, slideIndex),
      layout: layoutForVisual(section.visual),
      blocks: blocksForSection(section, slideIndex),
    };
  });
}

function ensureCoverAndClosing(title: string, slides: Slide[], sections: PlanSection[]): Slide[] {
  const result = [...slides];
  if (result[0]?.layout !== "title") {
    result.unshift({
      id: "s-cover",
      layout: "title",
      layoutVariant: "hero-center",
      title,
      blocks: [{ id: "b-cover", type: "text", content: sections[0]?.summary || "", meta: {} }],
      notes: "",
    });
  }
  if (result[result.length - 1]?.layout !== "closing") {
    result.push({
      id: "s-closing",
      layout: "closing",
      layoutVariant: "closing-action",
      title: "下一步",
      blocks: [
        { id: "b-closing", type: "text", content: "回到核心结论，明确下一步行动。", meta: {} },
      ],
      notes: "",
    });
  }
  return result;
}

// 章节大纲 → 页面计划（1:N 展开）。AI 失败时回退为结构化确定性展开。
async function expandOutlineToSlides(
  ctx: AppContext,
  title: string,
  theme: string,
  profile: string,
  sections: PlanSection[],
  source: string,
): Promise<Slide[]> {
  const outlineJson = JSON.stringify({ title, theme, sections });
  try {
    const res = await ctx.ai.completeJson(
      {
        messages: [
          { role: "system", content: buildPagePlanSystemPrompt(profile) },
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
    if (res.data.slides.length > 0) {
      return repairGeneratedSlides(
        ensureCoverAndClosing(title, res.data.slides, sections),
        sections,
      );
    }
  } catch {
    // fall through to deterministic expansion
  }
  return deterministicSlides(title, sections);
}

export function deterministicSlides(title: string, sections: PlanSection[]): Slide[] {
  const slides: Slide[] = [
    {
      id: "s1",
      layout: "title",
      layoutVariant: "hero-center",
      title,
      blocks: [
        {
          id: "b1",
          type: "text",
          content: sections[0]?.summary || sections[0]?.title || "",
          meta: {},
        },
      ],
      notes: "",
    },
  ];
  sections.forEach((section, i) => {
    slides.push({
      id: `s${i + 2}`,
      sectionId: section.id,
      layoutVariant: layoutVariantForVisual(section.visual, i),
      layout: layoutForVisual(section.visual),
      title: section.title,
      blocks: blocksForSection(section, i),
      notes: "",
    });
  });
  slides.push({
    id: `s${slides.length + 1}`,
    layout: "closing",
    layoutVariant: "closing-action",
    title: "下一步",
    blocks: [{ id: "b-end", type: "text", content: "回到核心结论，明确下一步行动。", meta: {} }],
    notes: "",
  });
  return slides;
}

*/

export function registerPresentations(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/presentations/themes", async () => presentationThemes);

  app.post("/api/v1/presentations/generate", async (req) => {
    const body = z
      .object({
        assetId: z.string().nullish(),
        title: z.string().max(200).optional(),
        sourceText: z.string().max(200_000).optional(),
        prompt: z.string().max(20_000).optional(),
        theme: z.enum(["light", "dark", "brand", "minimal", "gradient"]).optional(),
        profile: z.enum(["research", "pitch", "product-launch", "data-story"]).optional(),
        templateId: z.string().optional(),
      })
      .parse(req.body);
    if (!body.assetId && !body.sourceText && !body.prompt && !body.title) {
      throw badRequest("SOURCE_REQUIRED", "需要提供标题、参考资料或创作要求");
    }
    const spec: Record<string, unknown> = {
      assetId: body.assetId ?? null,
      sourceText: body.sourceText ?? null,
      title: body.title ?? "",
      theme: body.theme ?? "light",
      profile: body.profile ?? "research",
      prompt: body.prompt ?? "",
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
    return { task };
  });

  app.get("/api/v1/presentations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (asset?.type !== "presentation") {
      return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    }
    const content = await ctx.store.readContent(id);
    const html = ensurePresentationRuntimeHtml(
      content?.text ?? renderPresentationHtml({ theme: "light", slides: [] }, asset.title),
    );
    return { asset, html };
  });

  app.put("/api/v1/presentations/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ html: z.string().max(2_000_000) }).parse(req.body);
    const asset = await ctx.store.getAsset(req.actor.workspaceId, id);
    if (asset?.type !== "presentation") throw notFound("演示");
    const normalizedHtml = stripPresentationPlatformShell(body.html);
    const issues = validatePresentationHtml(normalizedHtml);
    if (issues.length > 0) {
      throw badRequest(
        "PRESENTATION_HTML_INVALID",
        `HTML 校验失败：${issues.map((i) => i.message).join("；")}`,
      );
    }
    const saved = await ctx.store.saveContent(
      req.actor,
      id,
      { kind: "html", text: normalizedHtml, manifest: null, refs: [] },
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
        scope: z.enum(["element", "page", "presentation", "insert"]),
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

  // ---------------- 兼容旧接口：幻灯片级重生成 = page 作用域 AI 修改 ----------------

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
  scope: "element" | "page" | "presentation" | "insert",
  targetId: string | null,
  instruction: string,
): Promise<{
  revisionId: string;
  scope: "element" | "page" | "presentation" | "insert";
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
        : scope === "insert"
          ? `只输出完整 HTML 文档。在 data-sg-id="${targetId ?? ""}" 这一页的末尾新增一个独立元素来响应指令，不要改动页面已有的任何其它元素与结构。新增元素需带唯一 data-sg-id 与合适的 data-sg-* 属性。`
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
    proposal: ensurePresentationRuntimeHtml(stripCodeFence(res.text)),
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
