import { createAiService } from "@shiguang/ai-core";
import type { ObjectStore } from "@shiguang/database";
import { z } from "zod";
import { type StepContext, step } from "./helpers.js";

export async function runPresentationWorkflow(
  ctx: StepContext,
  spec: Record<string, unknown>,
  storage: ObjectStore,
): Promise<void> {
  const parsed = z
    .object({
      assetId: z.string().nullable().optional(),
      sourceText: z.string().nullable().optional(),
      title: z.string().default("在线演示"),
      theme: z.string().default("light"),
      templateId: z.string().nullable().optional(),
    })
    .parse(spec);
  const ai = createAiService({ quality: "balanced" });

  const source = parsed.sourceText ?? "";
  await step(ctx, "presentation.source", 20, "读取源内容", async () => {
    if (parsed.assetId) {
      const content = await storage
        .get(`assets/${parsed.assetId}/versions/_/content`)
        .catch(() => null);
      void content;
    }
  });

  let document: Record<string, unknown> = {};
  await step(ctx, "presentation.outline", 60, "生成演示大纲与幻灯片", async () => {
    const sourceForAi =
      source || (parsed.assetId ? await readAssetText(storage, parsed.assetId) : "");
    const res = await ai.complete({
      messages: [
        { role: "system", content: "你是演示文稿助手。根据源内容生成结构化演示文稿 JSON。" },
        {
          role: "user",
          content: `presentation-outline\ntitle: ${parsed.title}\ntheme: ${parsed.theme}\nsource:\n${sourceForAi.slice(0, 20_000)}`,
        },
      ],
      quality: "balanced",
    });
    try {
      const raw = res.text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      document = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      document = {
        title: parsed.title,
        theme: parsed.theme,
        aspectRatio: "16:9",
        slides: [
          {
            id: "s1",
            layout: "title",
            title: parsed.title,
            blocks: [{ id: "b1", type: "heading", content: parsed.title }],
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
    if (!Array.isArray(document.slides) || document.slides.length === 0) {
      throw new Error("生成的演示文稿缺少幻灯片");
    }
  });

  await step(ctx, "presentation.project", 95, "创建演示资产", async () => {
    const result = await ctx.api.projectResult({
      resultSchema: "presentation-result/v1",
      taskId: ctx.taskId,
      runId: ctx.runId,
      attempt: 1,
      outputs: [
        {
          kind: "presentation",
          assetType: "presentation",
          title: parsed.title,
          content: { manifest: document },
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0, providerCostMicros: 0, creditUnits: 300 },
      failures: [],
    });
    if (!result.ok) throw new Error("presentation projection failed");
  });
}

async function readAssetText(storage: ObjectStore, assetId: string): Promise<string> {
  const keys = await listObjectKeys(storage);
  const candidate = keys.find(
    (k) => k.startsWith(`assets/${assetId}/versions/`) && k.endsWith("/content"),
  );
  if (!candidate) return "";
  const buffer = await storage.get(candidate);
  return buffer?.toString("utf8") ?? "";
}

async function listObjectKeys(_storage: ObjectStore): Promise<string[]> {
  return await _storage.list("assets");
}
