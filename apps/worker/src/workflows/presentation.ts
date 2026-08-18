import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createAiService, loadCapabilityContext } from "@shiguang/ai-core";
import { loadCapabilityAgentId } from "@shiguang/config";
import {
  buildPresentationSystemPrompt,
  buildPresentationUserPrompt,
  validatePresentationHtml,
} from "@shiguang/content";
import type { ObjectStore } from "@shiguang/database";
import { z } from "zod";
import { completeWithCapabilities } from "./ai-helpers.js";
import { type StepContext, step } from "./helpers.js";

const require = createRequire(import.meta.url);

function loadEchartsJs(): string {
  try {
    return readFileSync(require.resolve("echarts/dist/echarts.min.js"), "utf8");
  } catch {
    return "";
  }
}

function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function injectEcharts(html: string): string {
  if (!html.includes('data-sg-kind="chart"') && !html.includes("data-sg-kind='chart'")) {
    return html;
  }
  const js = loadEchartsJs();
  if (!js) return html;
  return html.includes("</body>")
    ? html.replace("</body>", `<script>${js}</script></body>`)
    : `${html}<script>${js}</script>`;
}

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
  const capabilityContext = await loadCapabilityContext(loadCapabilityAgentId()).catch(() => null);

  const source = parsed.sourceText ?? "";
  await step(ctx, "presentation.source", 20, "读取源内容", async () => {
    if (parsed.assetId) {
      const content = await storage
        .get(`assets/${parsed.assetId}/versions/_/content`)
        .catch(() => null);
      void content;
    }
  });

  let html = "";
  await step(
    ctx,
    "presentation.generate",
    60,
    "生成演示 HTML（Skill + Validator + Repair）",
    async () => {
      const sourceForAi =
        source || (parsed.assetId ? await readAssetText(storage, parsed.assetId) : "");
      const system = [buildPresentationSystemPrompt(), capabilityContext?.summary]
        .filter(Boolean)
        .join("\n\n");
      let issues = validatePresentationHtml("");
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res =
          attempt === 0
            ? await completeWithCapabilities(ai, {
                capabilityContext,
                quality: "balanced",
                messages: [
                  { role: "system", content: system },
                  {
                    role: "user",
                    content: buildPresentationUserPrompt({
                      goal: parsed.title,
                      profile: "research",
                      source: sourceForAi,
                    }),
                  },
                ],
              })
            : await ai.complete({
                messages: [
                  { role: "system", content: system },
                  {
                    role: "user",
                    content: `上一版 HTML 校验未通过：\n${issues.map((i) => `- ${i.code}: ${i.message}`).join("\n")}\n请修复后重新输出完整 HTML（不要代码围栏、不要解释）。`,
                  },
                ],
                quality: "balanced",
              });
        html = injectEcharts(stripCodeFence(res.text));
        issues = validatePresentationHtml(html);
        if (issues.length === 0) break;
      }
      if (issues.length > 0) {
        throw new Error(`演示 HTML 校验失败：${issues.map((i) => i.message).join("；")}`);
      }
    },
  );

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
          content: { html },
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
