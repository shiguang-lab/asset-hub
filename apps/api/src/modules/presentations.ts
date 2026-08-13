import {
  nextId,
  nowIso,
  presentationDocumentSchema,
  presentationThemeSchema,
  slideSchema,
} from "@shiguang/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, notFound } from "../platform/errors.js";
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
      const sourceAsset = ctx.store.getAsset(req.actor.workspaceId, body.assetId);
      if (!sourceAsset) throw notFound("源资产");
      const sourceContent = await ctx.store.readContent(body.assetId);
      if (sourceContent?.text && !spec.sourceText) {
        spec.sourceText = sourceContent.text.slice(0, 20_000);
      }
    }
    const goal = body.title ?? (body.assetId ? `从资产生成在线演示` : "从文本生成在线演示");
    const task = ctx.store.createTask(req.actor, {
      type: "presentation_generate",
      goal,
      spec,
      inputAssetIds: body.assetId ? [body.assetId] : [],
    });
    const estimate = { min: 150, max: 400 };
    const reserved = ctx.store.reserveCredits(
      req.actor.workspaceId,
      task.id,
      estimate.max,
      `op_reserve_${task.id}`,
    );
    if (!reserved.ok) throw badRequest("CREDIT_INSUFFICIENT", "Credits 不足，无法生成演示", {});
    ctx.bus.emit({
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
    ctx.store.audit(
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
      const asset = ctx.store.getAsset(req.actor.workspaceId, body.assetId);
      if (!asset) throw notFound("源资产");
      const content = await ctx.store.readContent(body.assetId);
      source = content?.text ?? "";
      sourceTitle = sourceTitle || asset.title;
    }
    const res = await ctx.ai.complete({
      messages: [
        {
          role: "system",
          content: "你是演示文稿助手。根据源内容生成结构化演示文稿 JSON（含 slides 数组）。",
        },
        {
          role: "user",
          content: `presentation-outline\ntitle: ${sourceTitle}\ntheme: ${body.theme ?? "light"}\nsource:\n${source.slice(0, 20_000)}`,
        },
      ],
      quality: "balanced",
    });
    let outline: Record<string, unknown>;
    try {
      const raw = res.text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      outline = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      outline = {
        title: sourceTitle,
        theme: body.theme ?? "light",
        aspectRatio: "16:9",
        slides: [
          {
            id: "s1",
            layout: "title",
            title: sourceTitle,
            blocks: [{ id: "b1", type: "heading", content: sourceTitle }],
          },
          {
            id: "s2",
            layout: "content",
            title: "核心要点",
            blocks: [
              { id: "b2", type: "heading", content: "核心要点" },
              { id: "b3", type: "bullet", content: "背景与现状\n关键数据\n结论与建议" },
            ],
          },
          {
            id: "s3",
            layout: "closing",
            title: "总结",
            blocks: [{ id: "b4", type: "heading", content: "总结与展望" }],
          },
        ],
      };
    }
    if (!Array.isArray(outline.slides) || outline.slides.length === 0) {
      throw badRequest("OUTLINE_EMPTY", "生成的演示大纲为空，请重试", {});
    }
    ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "presentation.outline",
      "presentation",
      "success",
      {},
    );
    return {
      outline: outline as { title: string; theme: string; aspectRatio: string; slides: unknown[] },
      provider: res.provider,
    };
  });

  app.post("/api/v1/presentations/outline/confirm", async (req) => {
    const body = z
      .object({
        title: z.string().min(1).max(200),
        theme: presentationThemeSchema,
        aspectRatio: z.enum(["16:9", "4:3", "9:16"]),
        slides: z.array(slideSchema),
        sourceAssetId: z.string().optional(),
      })
      .parse(req.body);
    const document = { theme: body.theme, aspectRatio: body.aspectRatio, slides: body.slides };
    const asset = ctx.store.createAssetWithVersion(req.actor, {
      type: "presentation",
      title: body.title,
      sourceType: "template",
      content: {
        kind: "manifest",
        text: null,
        manifest: document as unknown as Record<string, unknown>,
        refs: [],
      },
    });
    if (body.sourceAssetId) {
      ctx.store.addRelation(
        req.actor.workspaceId,
        body.sourceAssetId,
        asset.asset.id,
        "generated_from",
        {
          via: "outline-confirm",
        },
      );
    }
    ctx.bus.emit({
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
    ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "presentation.create",
      asset.asset.id,
      "success",
      {
        slides: body.slides.length,
      },
    );
    return asset.asset;
  });

  app.get("/api/v1/presentations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const asset = ctx.store.getAsset(req.actor.workspaceId, id);
    if (asset?.type !== "presentation") {
      return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    }
    const content = await ctx.store.readContent(id);
    const document = content?.manifest
      ? presentationDocumentSchema.parse(content.manifest)
      : { theme: "light", aspectRatio: "16:9", slides: [] };
    return { asset, document };
  });

  app.put("/api/v1/presentations/:id", async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({ document: presentationDocumentSchema }).parse(req.body);
    const asset = ctx.store.getAsset(req.actor.workspaceId, id);
    if (asset?.type !== "presentation") throw notFound("演示");
    const saved = ctx.store.saveContent(
      req.actor,
      id,
      {
        kind: "manifest",
        text: null,
        manifest: body.document as unknown as Record<string, unknown>,
        refs: [],
      },
      { changeKind: "edit" },
    );
    ctx.bus.emit({
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

  app.post("/api/v1/presentations/:id/slides/:slideId/regenerate", async (req) => {
    const { id, slideId } = req.params as { id: string; slideId: string };
    const asset = ctx.store.getAsset(req.actor.workspaceId, id);
    if (asset?.type !== "presentation") throw notFound("演示");
    const content = await ctx.store.readContent(id);
    const document = content?.manifest
      ? presentationDocumentSchema.parse(content.manifest)
      : { theme: "light", aspectRatio: "16:9", slides: [] };
    const slide = document.slides.find((s) => s.id === slideId);
    if (!slide) throw notFound("幻灯片");
    const res = await ctx.ai.complete({
      messages: [
        {
          role: "system",
          content: "你是演示文稿助手，根据当前幻灯片内容和用户指令生成改进后的结构化幻灯片 JSON。",
        },
        {
          role: "user",
          content: `presentation-slide\ncurrent: ${JSON.stringify(slide)}\ntitle: ${slide.title}\ninstruction: ${req.body ? String((req.body as { instruction?: string }).instruction ?? "让内容更精炼、更有冲击力") : "让内容更精炼、更有冲击力"}`,
        },
      ],
      quality: "balanced",
    });
    let proposal = res.text;
    try {
      const raw = res.text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      proposal = JSON.stringify({ ...JSON.parse(raw), id: slideId });
    } catch {
      proposal = JSON.stringify({
        ...slide,
        blocks: [
          ...slide.blocks,
          { id: `b-ai-${Date.now().toString(36)}`, type: "text", content: res.text },
        ],
      });
    }
    return { proposal: JSON.parse(proposal) as unknown, provider: res.provider };
  });
}
