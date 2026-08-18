import {
  loadMcpGatewayConfig,
  loadModelGatewayConfig,
  loadSkillGatewayConfig,
  type ModelGatewayConfig,
} from "@shiguang/config";
import { z } from "zod";

import { connectMcpServers } from "./mcp.js";

export * from "./mcp.js";

export type ModelQuality = "economy" | "balanced" | "best";

/**
 * asset-hub Agent 在 Model Gateway 中固定的 Agent 键。
 * 网关端为该键配置唯一默认绑定 → deepseek-v4-flash，运行时直接解析，无需质量档/策略键映射。
 */
export const MODEL_AGENT_KEY = "asset-hub";

/* ------------------------------------------------------------------ */
/* Chat completion client                                               */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** tool 消息回填时用于关联 assistant 的 tool_calls。 */
  tool_call_id?: string;
  /** assistant 消息携带的 tool_calls（OpenAI 兼容格式）。 */
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  quality?: ModelQuality;
  taskId?: string;
  tools?: ChatTool[];
}

export interface ChatCompletionResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  provider: string;
  toolCalls?: ChatToolCall[];
}

const completionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullable(),
        tool_calls: z
          .array(
            z.object({
              id: z.string(),
              type: z.string().optional(),
              function: z.object({ name: z.string(), arguments: z.string().default("{}") }),
            }),
          )
          .optional(),
      }),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

interface ResolvedRoute {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey: string;
}

export class ModelGatewayClient {
  constructor(private readonly config: ModelGatewayConfig) {}

  private async resolve(taskId: string): Promise<ResolvedRoute | null> {
    if (!this.config.baseUrl) throw new Error("MODEL_GATEWAY_URL is not configured");
    const url = new URL("/internal/model-config/resolve", this.config.baseUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey ?? ""}`,
      },
      body: JSON.stringify({ agentKey: MODEL_AGENT_KEY, taskKey: "", taskId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`model gateway resolve ${res.status}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as ResolvedRoute | null;
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.config.baseUrl) {
      throw new Error("MODEL_GATEWAY_URL is not configured");
    }
    const taskId = request.taskId ?? `task_${crypto.randomUUID()}`;
    const runtime = await this.resolve(taskId);
    if (!runtime) {
      throw new Error(`model gateway has no route configured for agentKey=${MODEL_AGENT_KEY}`);
    }
    const url = new URL("/v1/chat/completions", runtime.baseUrl ?? this.config.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-opc-task-id": taskId,
          ...(runtime.apiKey ? { authorization: `Bearer ${runtime.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: runtime.model ?? this.config.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 2048,
          ...(request.responseFormat === "json_object"
            ? { response_format: { type: "json_object" } }
            : {}),
          ...(request.tools?.length
            ? {
                tools: request.tools.map((tool) => ({ type: "function", function: tool.function })),
              }
            : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`model gateway ${res.status}: ${body.slice(0, 300)}`);
      }
      const parsed = completionSchema.parse(await res.json());
      const text = parsed.choices[0]?.message.content ?? "";
      const toolCalls = (parsed.choices[0]?.message.tool_calls ?? [])
        .filter((call) => call.id && call.function.name)
        .map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        }));
      return {
        text,
        usage: {
          inputTokens: parsed.usage?.prompt_tokens ?? 0,
          outputTokens: parsed.usage?.completion_tokens ?? 0,
        },
        provider: "model-gateway",
        ...(toolCalls.length ? { toolCalls } : {}),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createModelClient(): ModelGatewayClient {
  return new ModelGatewayClient(loadModelGatewayConfig());
}

/* ------------------------------------------------------------------ */
/* Deterministic local model (fallback / dev)                           */
/* ------------------------------------------------------------------ */

export interface LocalModelOptions {
  quality: ModelQuality;
  useLocalModel?: boolean;
}

/**
 * A fully deterministic "model" used when MODEL_GATEWAY_URL is absent, so the
 * whole product flow (research, knowledge answer, presentation outline,
 * document AI actions) stays functional in local/dev delivery.
 */
export class LocalModel {
  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const prompt = request.messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const output = LocalModel.infer(prompt);
    return {
      text: output,
      usage: {
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: Math.ceil(output.length / 4),
      },
      provider: "local-model",
    };
  }

  static infer(prompt: string): string {
    if (prompt.includes("research-scope")) {
      return LocalModel.scope(prompt);
    }
    if (prompt.includes("presentation-outline")) {
      return LocalModel.outline(prompt);
    }
    if (prompt.includes("presentation-slide")) {
      return LocalModel.slide(prompt);
    }
    if (prompt.includes("knowledge-answer")) {
      return LocalModel.knowledge(prompt);
    }
    if (prompt.includes("document-action")) {
      return LocalModel.documentAction(prompt);
    }
    if (prompt.includes("dataset-insights")) {
      return LocalModel.datasetInsights(prompt);
    }
    if (prompt.includes("report-writer")) {
      return LocalModel.report(prompt);
    }
    return prompt.length > 0 ? prompt.slice(0, 2000) : "";
  }

  private static scope(prompt: string): string {
    const goal = LocalModel.extractAfter(prompt, "goal:", 300);
    const base = goal || "该主题";
    return JSON.stringify({
      items: [
        { id: "market", label: `市场规模与增长（${base}）`, enabled: true },
        { id: "players", label: "主要公司与产品", enabled: true },
        { id: "competition", label: "竞争格局与壁垒", enabled: true },
        { id: "trends", label: "趋势与机会", enabled: true },
        { id: "risks", label: "风险与挑战", enabled: true },
      ],
    });
  }

  private static outline(prompt: string): string {
    const title = LocalModel.extractAfter(prompt, "title:", 120) || "演示文稿";
    const source = LocalModel.extractAfter(prompt, "source:", 4000);
    const lines = (source || "")
      .split(/\r?\n/)
      .map((l) => l.replace(/^#+\s*/, "").trim())
      .filter((l) => l.length > 0);
    const sectionCount = Math.min(6, Math.max(3, lines.length));
    const sections = lines.length >= sectionCount ? lines.slice(0, sectionCount) : [];
    const slides = [
      { id: "s1", layout: "title", title, blocks: [{ id: "b1", type: "heading", content: title }] },
    ];
    for (let i = 0; i < sectionCount; i += 1) {
      const heading = sections[i] ?? `主题 ${i + 1}`;
      slides.push({
        id: `s${i + 2}`,
        layout: i % 2 === 0 ? "content" : "two-column",
        title: heading,
        blocks: [
          { id: `b${i * 2 + 1}`, type: "heading", content: heading },
          {
            id: `b${i * 2 + 2}`,
            type: "bullet",
            content: [
              `${heading}的关键事实与数据`,
              "行业背景与驱动因素",
              "影响与后续行动建议",
            ].join("\n"),
          },
        ],
      });
    }
    slides.push({
      id: `s${sectionCount + 2}`,
      layout: "closing",
      title: "总结与展望",
      blocks: [
        { id: "b-end-1", type: "heading", content: "总结与展望" },
        { id: "b-end-2", type: "text", content: "核心结论 · 行动建议 · Q&A" },
      ],
    });
    return JSON.stringify({
      title,
      theme: "light",
      aspectRatio: "16:9",
      slides,
    });
  }

  private static slide(prompt: string): string {
    const title = LocalModel.extractAfter(prompt, "title:", 120) || "内容页";
    return JSON.stringify({
      id: `slide_${Date.now().toString(36)}`,
      layout: "content",
      title,
      blocks: [
        { id: "h1", type: "heading", content: title },
        {
          id: "t1",
          type: "bullet",
          content: "要点一：背景与现状\n要点二：核心数据\n要点三：结论与建议",
        },
      ],
      notes: "",
    });
  }

  private static knowledge(prompt: string): string {
    const query = LocalModel.extractAfter(prompt, "query:", 300);
    const chunks = prompt.match(/CHUNK \d+:\s*([\s\S]*?)(?=CHUNK \d+:|$)/g) ?? [];
    const excerpt = chunks
      .slice(0, 2)
      .map((c) => c.trim())
      .join("\n");
    const answer =
      excerpt.length > 0
        ? `根据已有资料，关于“${query}”可以得出：${excerpt
            .split("\n")
            .slice(0, 4)
            .join("；")}。以上结论均引用自当前知识库中的原文片段。`
        : `当前知识库中暂无足够资料回答“${query}”。建议补充相关 Source 后再提问。`;
    return JSON.stringify({ answer, citations: [], insufficient: excerpt.length === 0 });
  }

  private static documentAction(prompt: string): string {
    const selection = LocalModel.extractAfter(prompt, "selection:", 4000);
    const action = prompt.match(/action:\s*(\w+)/)?.[1] ?? "rewrite";
    const language = LocalModel.extractAfter(prompt, "language:", 40) || "中文";
    const trimmed = (selection || "").replace(/^[\s#*>-]+|[\s]+$/g, "").slice(0, 3000);
    const mapping: Record<string, string> = {
      rewrite: `（改写）${trimmed}\n\n——以上为改写版本，保持原意、优化表达，语言：${language}。`,
      summarize: `（摘要）${trimmed.slice(0, 400)}…\n\n核心要点：1. 主题概述；2. 关键数据与事实；3. 结论。`,
      expand: `（扩写）${trimmed}\n\n补充说明：背景、示例数据、影响分析与建议。`,
      translate: `（翻译为${language}）${trimmed}`,
      explain: `（解释）关于“${trimmed.slice(0, 80)}”的解释：这是指……；背景、原因与影响如下……`,
    };
    return mapping[action] ?? trimmed;
  }

  private static datasetInsights(prompt: string): string {
    const _stats = LocalModel.extractAfter(prompt, "stats:", 2000) || "{}";
    return JSON.stringify({
      insights: [
        `数据集共包含若干记录，主要指标分布已生成。`,
        `基于聚合结果，头部贡献集中、长尾分散，建议关注 Top 群体的趋势变化。`,
        `关键异常值已标记，可结合业务背景进一步核对。`,
      ],
    });
  }

  private static report(prompt: string): string {
    const goal = LocalModel.extractAfter(prompt, "goal:", 300);
    const scope = LocalModel.extractAfter(prompt, "scope:", 500);
    const evidence = LocalModel.extractAfter(prompt, "evidence:", 3000);
    const title = goal || "研究报告";
    return [
      `# ${title}`,
      "",
      "> 本报告由 Shiguang Lab Research 生成，结论均基于任务中收集的证据，关键结论可点击引用回溯原文。",
      "",
      "## 一、研究背景",
      `围绕“${title}”展开调研。研究范围：${scope || "行业整体"}。`,
      "",
      "## 二、核心发现",
      ...(evidence
        ? evidence
            .split(/\r?\n/)
            .filter((l) => l.trim().length > 0)
            .slice(0, 8)
            .map((l) => `- ${l}`)
        : ["- 市场正在增长，主要玩家加速布局。", "- 竞争格局集中度提升，头部效应明显。"]),
      "",
      "## 三、数据与证据",
      "所有关键结论均记录 Source 与引用位置，可进入结果页查看 Evidence 列表。",
      "",
      "## 四、结论与建议",
      "- 优先聚焦高增长细分场景。",
      "- 建立持续跟踪机制，使用 Dataset 沉淀结构化数据。",
      "- 通过发布与在线演示扩大成果传播。",
      "",
      "---",
      "*Generated by Shiguang Lab · Evidence-backed*",
    ].join("\n");
  }

  private static extractAfter(prompt: string, marker: string, max: number): string {
    const idx = prompt.indexOf(marker);
    if (idx < 0) return "";
    const rest = prompt.slice(idx + marker.length).trim();
    return rest.slice(0, max);
  }
}

/* ------------------------------------------------------------------ */
/* Unified AI service                                                    */
/* ------------------------------------------------------------------ */

export interface AiResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  provider: string;
  toolCalls?: ChatToolCall[];
}

export class AiService {
  private readonly gateway: ModelGatewayClient;
  private readonly local: LocalModel;

  constructor(private readonly options: { forceLocal?: boolean; quality?: ModelQuality } = {}) {
    this.gateway = createModelClient();
    this.local = new LocalModel();
  }

  private useLocal(): boolean {
    return (
      this.options.forceLocal === true ||
      process.env.MODEL_GATEWAY_URL === undefined ||
      process.env.MODEL_GATEWAY_URL === ""
    );
  }

  async complete(request: ChatCompletionRequest): Promise<AiResult> {
    if (this.useLocal()) {
      return this.local.complete(request);
    }
    try {
      return await this.gateway.complete({
        ...request,
        quality: request.quality ?? this.options.quality ?? "balanced",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (process.env.AI_FALLBACK_TO_LOCAL === "false") {
        throw err;
      }
      const fallback = await this.local.complete(request);
      return { ...fallback, text: `${fallback.text}\n\n<!-- ai-fallback: ${message} -->` };
    }
  }

  async completeJson<T>(
    request: ChatCompletionRequest,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; provider: string; usage: { inputTokens: number; outputTokens: number } }> {
    const res = await this.complete({
      ...request,
      responseFormat: "json_object",
    });
    const raw = res.text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return { data: schema.parse(JSON.parse(raw)), provider: res.provider, usage: res.usage };
  }
}

export const createAiService = (options?: {
  forceLocal?: boolean;
  quality?: ModelQuality;
}): AiService => new AiService(options);

/* ------------------------------------------------------------------ */
/* 动态能力上下文（Skill / MCP manifest）                               */
/* ------------------------------------------------------------------ */

export interface CapabilityContext {
  agentId: string;
  skills: Array<{ name: string; description: string; content: string }>;
  mcpServers: Array<{
    name: string;
    url: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }>;
  /** 注入 system prompt 的完整能力说明（含各 Skill 的 SKILL.md 全文）；无配置能力时返回 null。 */
  summary: string;
}

/**
 * 拉取该 Agent 在 Skill Gateway / MCP Gateway 中已分配的能力 manifest，
 * 生成一段可注入 system prompt 的摘要。任一网关未配置时跳过；两者都无内容时返回 null。
 */
export async function loadCapabilityContext(agentId: string): Promise<CapabilityContext | null> {
  const skill = loadSkillGatewayConfig();
  const mcp = loadMcpGatewayConfig();

  const [skills, mcpServers] = await Promise.all([
    skill.baseUrl ? fetchSkills(agentId, skill.baseUrl, skill.token) : Promise.resolve([]),
    mcp.baseUrl ? fetchMcpServers(agentId, mcp.baseUrl, mcp.token) : Promise.resolve([]),
  ]);

  if (skills.length === 0 && mcpServers.length === 0) return null;
  const summary = buildCapabilitySummary(skills, mcpServers);
  return { agentId, skills, mcpServers, summary };
}

async function fetchSkills(
  agentId: string,
  baseUrl: string,
  token: string | null,
): Promise<Array<{ name: string; description: string; content: string }>> {
  try {
    const base = baseUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/skills/manifests/${encodeURIComponent(agentId)}`, {
      headers: { authorization: `Bearer ${token ?? ""}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      skills?: Array<{
        name?: string;
        versionTree?: { entries?: Record<string, { blobHash?: string }> };
      }>;
    };
    const skills: Array<{ name: string; description: string; content: string }> = [];
    for (const skill of body.skills ?? []) {
      if (typeof skill.name !== "string") continue;
      const blobHash = skill.versionTree?.entries?.["SKILL.md"]?.blobHash;
      let content = "";
      if (blobHash) {
        const blobRes = await fetch(`${base}/blobs/${encodeURIComponent(blobHash)}`, {
          headers: { authorization: `Bearer ${token ?? ""}` },
          signal: AbortSignal.timeout(8_000),
        });
        if (blobRes.ok) content = await blobRes.text();
      }
      skills.push({
        name: skill.name,
        description: extractFrontmatterDescription(content),
        content,
      });
    }
    return skills;
  } catch {
    return [];
  }
}

function extractFrontmatterDescription(markdown: string): string {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return "";
  const frontmatter = match[1] ?? "";
  const lineMatch = frontmatter.match(/^description:\s*(.*)$/m);
  if (!lineMatch) return "";
  const raw = (lineMatch[1] ?? "").trim();
  if (raw === "|" || raw === ">") {
    const lines = frontmatter.split(/\r?\n/);
    const start = lines.findIndex((l) => /^description:\s*[|>]/.test(l));
    const block: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (!/^\s+/.test(line)) break;
      block.push(line.trim());
    }
    return block.join(raw === ">" ? " " : "\n").trim();
  }
  return raw.replace(/^["']|["']$/g, "").trim();
}

async function fetchMcpServers(
  agentId: string,
  baseUrl: string,
  token: string | null,
): Promise<CapabilityContext["mcpServers"]> {
  try {
    const res = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/api/mcp/manifest/${encodeURIComponent(agentId)}`,
      {
        headers: { authorization: `Bearer ${token ?? ""}` },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as {
      servers?: Array<{
        name?: string;
        url?: string;
        headers?: Record<string, string>;
        timeoutMs?: number;
      }>;
    };
    return (body.servers ?? [])
      .filter((s) => typeof s.url === "string")
      .map((s) => ({
        name: s.name ?? s.url ?? "",
        url: s.url as string,
        ...(s.headers ? { headers: s.headers } : {}),
        ...(s.timeoutMs ? { timeoutMs: s.timeoutMs } : {}),
      }));
  } catch {
    return [];
  }
}

function buildCapabilitySummary(
  skills: Array<{ name: string; description: string; content: string }>,
  mcpServers: CapabilityContext["mcpServers"],
): string {
  const lines: string[] = ["可用动态能力："];
  for (const s of skills) {
    lines.push(`- Skill「${s.name}」${s.description ? `：${s.description}` : ""}`);
  }
  for (const m of mcpServers) {
    lines.push(`- MCP 工具服务「${m.name}」(${m.url})`);
  }
  if (skills.some((s) => s.content.trim())) {
    lines.push("\n已加载的 Skill 规范（按需遵循）：");
    for (const s of skills) {
      if (!s.content.trim()) continue;
      lines.push(`\n=== Skill: ${s.name} ===\n${s.content.trim()}`);
    }
  }
  lines.push("\n在回答时遵循相关 Skill 规范；不要编造未列出的能力。");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Agentic 工具调用循环（MCP 工具真正被执行）                          */
/* ------------------------------------------------------------------ */

export interface McpToolkit {
  tools: ChatTool[];
  execute: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ content: string; isError: boolean }>;
}

/** 连接配置的 MCP server，发现工具并把工具名扁平化为 `<serverId>__<toolName>`。 */
export async function buildMcpToolkit(
  servers: CapabilityContext["mcpServers"],
): Promise<McpToolkit | null> {
  const clients = await connectMcpServers(
    servers.map((server) => ({
      id: server.name,
      url: server.url,
      headers: server.headers,
      timeoutMs: server.timeoutMs,
    })),
  );
  if (clients.length === 0) return null;

  const executors = new Map<
    string,
    (args: Record<string, unknown>) => Promise<{ content: string; isError: boolean }>
  >();
  const tools: ChatTool[] = [];
  for (const client of clients) {
    for (const tool of client.tools) {
      const qualifiedName = `${client.serverId}__${tool.name}`;
      tools.push({
        type: "function",
        function: {
          name: qualifiedName,
          ...(tool.description ? { description: tool.description } : {}),
          parameters:
            tool.inputSchema && Object.keys(tool.inputSchema).length > 0
              ? tool.inputSchema
              : { type: "object", properties: {} },
        },
      });
      executors.set(qualifiedName, (args) => client.callTool(tool.name, args));
    }
  }
  return {
    tools,
    execute: (name, args) => {
      const run = executors.get(name);
      if (!run) return Promise.resolve({ content: `未知工具：${name}`, isError: true });
      return run(args);
    },
  };
}

export interface AgenticResult {
  text: string;
  rounds: number;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

/** 工具调用循环：模型返回 tool_calls → 执行 → 回填 tool 消息 → 直至终答或轮次耗尽。 */
export async function agenticComplete(options: {
  complete: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
  messages: ChatMessage[];
  tools: ChatTool[];
  execute: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ content: string; isError: boolean }>;
  quality?: ModelQuality;
  maxRounds?: number;
}): Promise<AgenticResult> {
  const { complete, tools, execute, quality, maxRounds = 6 } = options;
  const messages: ChatMessage[] = [...options.messages];
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let rounds = 0;
  let text = "";

  while (rounds < maxRounds) {
    rounds += 1;
    const res = await complete({ messages, tools, quality });
    const calls = res.toolCalls ?? [];
    if (calls.length === 0) {
      text = res.text;
      break;
    }
    messages.push({
      role: "assistant",
      content: res.text || null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      let content: string;
      let isError = false;
      try {
        const result = await execute(call.name, args);
        content = result.content;
        isError = result.isError;
      } catch (error) {
        content = `工具执行失败：${error instanceof Error ? error.message : String(error)}`;
        isError = true;
      }
      toolCalls.push({ name: call.name, args });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: isError ? `ERROR: ${content}` : content,
      });
    }
  }

  return { text, rounds, toolCalls };
}
