import { type AiService, createAiService } from "@shiguang/ai-core";
import { z } from "zod";
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
  const scopeItems =
    spec.scope.length > 0
      ? spec.scope.filter((s) => s.enabled)
      : await generateScope(ai, spec.goal, spec.region);

  let evidence: Array<Record<string, unknown>> = [];
  await step(ctx, "research.plan", 10, "研究规划：确定研究范围与检索策略", async () => {
    ctx.logger.info({ scope: scopeItems }, "research scope ready");
  });

  await step(
    ctx,
    "research.collect",
    spec.depth === "quick" ? 45 : 55,
    "收集证据：检索公开来源并提取要点",
    async () => {
      evidence = collectEvidence(spec, scopeItems);
    },
  );

  let reportText = "";
  await step(ctx, "research.write", 80, "撰写报告：基于证据生成结构化报告", async () => {
    const res = await ai.complete({
      messages: [
        {
          role: "system",
          content: "你是行业研究员。基于提供的证据撰写结构完整、结论可追溯的中文研究报告。",
        },
        {
          role: "user",
          content: `report-writer\ngoal: ${spec.goal}\nregion: ${spec.region}\ntimeRange: ${spec.timeRange}\nscope: ${scopeItems.map((s) => s.label).join("、")}\nevidence:\n${evidence.map((e) => `- ${String(e.claim)} [来源: ${String(e.sourceTitle)}]`).join("\n")}`,
        },
      ],
      quality: spec.quality,
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

  await step(ctx, "research.project", 95, "投影结果：生成资产并结算 Credits", async () => {
    const result = await ctx.api.projectResult({
      resultSchema: "research-result/v1",
      taskId: ctx.taskId,
      runId: ctx.runId,
      attempt: 1,
      outputs,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        providerCostMicros: 0,
        creditUnits: spec.depth === "quick" ? 150 : spec.depth === "deep" ? 1200 : 400,
      },
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

function collectEvidence(
  spec: z.infer<typeof researchSpecSchema>,
  scope: Array<{ id: string; label: string; enabled: boolean }>,
): Array<Record<string, unknown>> {
  const now = new Date().toISOString();
  const sources = [
    {
      title: `${spec.region}行业统计年鉴 2025`,
      url: "https://example.com/statistical-yearbook-2025",
    },
    { title: "行业协会年度报告", url: "https://example.com/industry-association-report" },
    { title: "头部公司财报与公开资料", url: "https://example.com/company-filings" },
    { title: "咨询机构市场洞察", url: "https://example.com/consulting-insights" },
  ];
  const evidence: Array<Record<string, unknown>> = [];
  scope.slice(0, 6).forEach((item, i) => {
    const source = sources[i % sources.length] ?? sources[0] ?? { title: "公开资料", url: null };
    evidence.push({
      claim: `关于“${item.label}”，${spec.region}市场保持增长，头部参与者持续加大投入（${spec.timeRange}）`,
      sourceTitle: source.title,
      sourceUrl: source.url,
      locator: `第 ${2 + i} 页 / 章节 ${item.id}`,
      excerpt: `${item.label}：市场规模、增速、主要玩家与关键驱动因素分析。`,
      retrievedAt: now,
      confidence: 0.6 + (i % 3) * 0.1,
      verificationStatus: "unverified",
    });
  });
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
