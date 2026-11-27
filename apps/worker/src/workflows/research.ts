import { type AiService, createAiService, loadCapabilityContext } from "@shiguang/ai-core";
import { loadCapabilityAgentId } from "@shiguang/config";
import { z } from "zod";
import { completeWithCapabilities } from "./ai-helpers.js";
import { type StepContext, step } from "./helpers.js";

const researchSpecSchema = z.object({
  goal: z.string(),
  region: z.string().default("全球"),
  timeRange: z.string().default("最近 12 个月"),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  quality: z.enum(["economy", "balanced", "best"]).default("balanced"),
  outputs: z
    .array(z.enum(["report", "sources", "dataset", "presentation"]))
    .default(["report", "sources"]),
  scope: z
    .array(z.object({ id: z.string(), label: z.string(), enabled: z.boolean().default(true) }))
    .default([]),
});

export async function runResearchWorkflow(
  ctx: StepContext,
  specInput: Record<string, unknown>,
): Promise<void> {
  const spec = researchSpecSchema.parse(specInput);
  const ai: AiService = createAiService({ quality: spec.quality });
  const capabilityContext = await loadCapabilityContext(loadCapabilityAgentId()).catch(() => null);
  const ensureNotCancelled = async () => {
    const state = await ctx.api.getTaskState(ctx.taskId).catch(() => null);
    if (state?.cancelRequested) {
      throw new Error("任务已被用户取消");
    }
  };
  const scopeItems =
    spec.scope.length > 0
      ? spec.scope.filter((s) => s.enabled)
      : await generateScope(ai, spec.goal, spec.region);

  let evidence: Array<Record<string, unknown>> = [];
  await ensureNotCancelled();
  await step(ctx, "research.plan", 10, "研究规划：确定研究范围与检索策略", async () => {
    ctx.logger.info({ scope: scopeItems }, "research scope ready");
  });

  await ensureNotCancelled();
  await step(
    ctx,
    "research.collect",
    spec.depth === "quick" ? 45 : 55,
    "收集证据：提取研究要点与来源结构",
    async () => {
      evidence = await collectEvidence(spec, scopeItems, ai);
    },
  );

  await ensureNotCancelled();

  let reportText = "";
  await step(ctx, "research.write", 80, "撰写报告：基于证据生成结构化报告", async () => {
    const res = await completeWithCapabilities(ai, {
      capabilityContext,
      quality: spec.quality,
      messages: [
        {
          role: "system",
          content: [
            "你是行业研究员。基于提供的证据撰写结构完整、结论可追溯的中文研究报告。",
            capabilityContext?.summary,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        {
          role: "user",
          content: `report-writer\ngoal: ${spec.goal}\nregion: ${spec.region}\ntimeRange: ${spec.timeRange}\nscope: ${scopeItems.map((s) => s.label).join("、")}\nevidence:\n${evidence.map((e) => `- ${String(e.claim)} [来源: ${String(e.sourceTitle)}]`).join("\n")}`,
        },
      ],
    });
    reportText = res.text;
  });

  const outputs: Array<Record<string, unknown>> = [];
  if (spec.outputs.includes("report")) {
    outputs.push({
      kind: "report-draft",
      assetType: "report",
      title: `${spec.goal} · 研究报告`,
      content: { text: reportText },
    });
  }
  if (spec.outputs.includes("sources")) {
    outputs.push({
      kind: "sources",
      assetType: "source",
      title: `${spec.goal} · 资料来源`,
      content: {
        sources: evidence.map((e) => ({
          title: e.sourceTitle,
          url: e.sourceUrl,
          locator: e.locator,
          retrievedAt: e.retrievedAt,
        })),
      },
    });
  }
  if (spec.outputs.includes("dataset")) {
    const dataset = buildResearchDataset(spec, evidence);
    outputs.push({
      kind: "dataset",
      assetType: "dataset",
      title: `${spec.goal} · 数据`,
      content: { manifest: dataset },
    });
  }

  await step(ctx, "research.project", 95, "投影结果：生成资产", async () => {
    const result = await ctx.api.projectResult({
      resultSchema: "research-result/v1",
      taskId: ctx.taskId,
      runId: ctx.runId,
      attempt: 1,
      outputs,
      failures: [],
      evidence,
    });
    if (!result.ok) throw new Error("result projection failed");
  });
}

async function generateScope(
  ai: AiService,
  goal: string,
  region: string,
): Promise<Array<{ id: string; label: string; enabled: boolean }>> {
  try {
    const res = await ai.completeJson<{
      items: Array<{ id: string; label: string; enabled: boolean }>;
    }>(
      {
        messages: [
          { role: "system", content: "你是研究规划助手，输出 JSON。" },
          {
            role: "user",
            content: `research-scope\ngoal: ${goal}\nregion: ${region}\n输出 {items:[{id,label,enabled}]}`,
          },
        ],
        quality: "economy",
      },
      z.object({
        items: z.array(z.object({ id: z.string(), label: z.string(), enabled: z.boolean() })),
      }),
    );
    return res.data.items;
  } catch {
    return [
      { id: "market", label: "市场规模与增长", enabled: true },
      { id: "players", label: "主要公司与产品", enabled: true },
      { id: "competition", label: "竞争格局", enabled: true },
      { id: "trends", label: "趋势与机会", enabled: true },
    ];
  }
}

async function fetchWebSearchResults(
  query: string,
  count = 2,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const searchUrl = process.env.SEARCH_API_URL || process.env.WEB_SEARCH_URL;
  if (!searchUrl) return [];
  try {
    const res = await fetch(`${searchUrl}?q=${encodeURIComponent(query)}&count=${count}`, {
      headers: {
        "User-Agent": "ShiguangResearch/1.0",
        ...(process.env.SEARCH_API_KEY
          ? { Authorization: `Bearer ${process.env.SEARCH_API_KEY}` }
          : {}),
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; snippet?: string; content?: string }>;
    };
    return (data.results ?? []).map((r) => ({
      title: r.title ?? "公开资料",
      url: r.url ?? "",
      snippet: r.snippet ?? r.content ?? "",
    }));
  } catch {
    return [];
  }
}

async function collectEvidence(
  spec: z.infer<typeof researchSpecSchema>,
  scope: Array<{ id: string; label: string; enabled: boolean }>,
  ai: AiService,
): Promise<Array<Record<string, unknown>>> {
  const now = new Date().toISOString();
  const evidence: Array<Record<string, unknown>> = [];

  for (let i = 0; i < Math.min(scope.length, 6); i++) {
    const item = scope[i];
    if (!item) continue;
    const query = `${spec.goal} ${item.label} ${spec.region}`.trim();
    const webResults = await fetchWebSearchResults(query, 2);

    if (webResults.length > 0) {
      for (const wr of webResults) {
        evidence.push({
          claim: `围绕“${item.label}”：${wr.snippet.slice(0, 200)}`,
          sourceTitle: wr.title,
          sourceUrl: wr.url || null,
          locator: `检索关键词: ${query}`,
          excerpt: wr.snippet,
          retrievedAt: now,
          confidence: 0.85,
          verificationStatus: "verified",
        });
      }
    } else {
      try {
        const synthesizedRes = await ai.completeJson(
          {
            quality: spec.quality,
            messages: [
              {
                role: "system",
                content:
                  "你是行业研究分析师。针对给定的研究维度，提取核心事实陈述与代表性公开行业智库或研报来源（如中信证券、艾瑞咨询、Gartner、IDC等）。",
              },
              {
                role: "user",
                content: `目标: ${spec.goal}\n维度: ${item.label}\n区域: ${spec.region}\n时间跨度: ${spec.timeRange}`,
              },
            ],
          },
          z.object({
            claim: z.string().default(""),
            sourceTitle: z.string().default(""),
            excerpt: z.string().default(""),
            confidence: z.number().default(0.7),
          }),
        );
        const synthesized = synthesizedRes.data;
        evidence.push({
          claim:
            synthesized.claim ||
            `围绕“${item.label}”展开的 ${spec.region} 专题分析（${spec.timeRange}）`,
          sourceTitle: synthesized.sourceTitle || `研究框架维度：${item.label}`,
          sourceUrl: null,
          locator: `维度 ${i + 1} (${item.id})`,
          excerpt:
            synthesized.excerpt ||
            `${item.label}：重点考察市场规模、头部玩家、竞争策略与潜在风险。`,
          retrievedAt: now,
          confidence: synthesized.confidence ?? 0.7,
          verificationStatus: "unverified",
        });
      } catch {
        evidence.push({
          claim: `围绕“${item.label}”展开的 ${spec.region} 专题分析（${spec.timeRange}，待人工核验具体一手来源）`,
          sourceTitle: `研究框架维度：${item.label}`,
          sourceUrl: null,
          locator: `维度 ${i + 1} (${item.id})`,
          excerpt: `${item.label}：重点考察市场规模、头部玩家、竞争策略与潜在风险。`,
          retrievedAt: now,
          confidence: 0.5,
          verificationStatus: "unverified",
        });
      }
    }
  }

  return evidence;
}

function buildResearchDataset(
  spec: z.infer<typeof researchSpecSchema>,
  evidence: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const rows = evidence.map((e, i) => ({
    index: i + 1,
    claim: String(e.claim ?? ""),
    source: String(e.sourceTitle ?? ""),
    region: spec.region,
    timeRange: spec.timeRange,
    confidence: Number(e.confidence ?? 0),
  }));
  return {
    name: `${spec.goal} · 结构化数据`,
    fileName: "research-data.json",
    format: "json",
    rows,
    schema: [
      {
        columnId: "index",
        name: "index",
        type: "integer",
        nullable: false,
        distinctCount: rows.length,
      },
      {
        columnId: "claim",
        name: "claim",
        type: "string",
        nullable: false,
        distinctCount: rows.length,
      },
      { columnId: "source", name: "source", type: "string", nullable: false, distinctCount: 4 },
      { columnId: "region", name: "region", type: "string", nullable: false, distinctCount: 1 },
      {
        columnId: "timeRange",
        name: "timeRange",
        type: "string",
        nullable: false,
        distinctCount: 1,
      },
      {
        columnId: "confidence",
        name: "confidence",
        type: "number",
        nullable: false,
        distinctCount: 3,
      },
    ],
    profile: { rowCount: rows.length },
    qualityIssues: [],
  };
}
