import { Agent } from "@mastra/core/agent";
import type { MessageListInput } from "@mastra/core/agent/message-list";
import type { Workspace } from "@mastra/core/workspace";
import {
  loadMcpGatewayConfig,
  loadModelGatewayConfig,
  loadSkillGatewayConfig,
  type ModelGatewayConfig,
} from "@shiguang/config";
import { z } from "zod";

import { createMastraModel, type ResolvedModelRoute } from "./mastra-model.js";
import { connectMcpServers } from "./mcp.js";
import { type AgentSkillManifest, createMastraRemoteSkillWorkspace } from "./remote-skills.js";

export * from "./mastra-model.js";
export * from "./mcp.js";
export * from "./remote-skills.js";

export type ModelQuality = "economy" | "balanced" | "best";

/**
 * asset-hub Agent 在全局 Model Gateway 中固定的 Agent 键。
 * 网关端为该键配置唯一默认绑定 → doubao-seed-2.0-lite，运行时直接解析，无需质量档/策略键映射。
 */
export const MODEL_AGENT_KEY = "asset-hub";
export const MAX_MODEL_OUTPUT_TOKENS = 32_768;
export const DEFAULT_MODEL_OUTPUT_TOKENS = 16_384;

/* ------------------------------------------------------------------ */
/* Chat completion client                                               */
/* ------------------------------------------------------------------ */

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[] | null;
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
  thinkingMode?: "enabled" | "disabled" | "auto";
  fallbackToLocal?: boolean;
  signal?: AbortSignal;
  /** Mastra Workspace 提供按需 Skill 发现与读取，不展开 Skill 全文。 */
  workspace?: Workspace;
}

export interface ChatCompletionResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  provider: string;
  finishReason?: string;
  toolCalls?: ChatToolCall[];
}

export interface ChatStreamUpdate {
  delta: string;
  text: string;
  activity: "content" | "reasoning" | "heartbeat" | "failed";
  receivedChars: number;
}

export type ChatStreamHandler = (update: ChatStreamUpdate) => void | Promise<void>;

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

export class ModelGatewayClient {
  constructor(private readonly config: ModelGatewayConfig) {}

  private async resolve(taskId: string): Promise<ResolvedModelRoute | null> {
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
      throw new Error(`global Model Gateway resolve ${res.status}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as ResolvedModelRoute | null;
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (request.tools?.length) return this.completeDirect(request);
    if (!this.config.baseUrl) throw new Error("MODEL_GATEWAY_URL is not configured");
    const taskId = request.taskId ?? `task_${crypto.randomUUID()}`;
    const runtime = await this.resolve(taskId);
    if (!runtime) {
      throw new Error(`global Model Gateway has no route for agentKey=${MODEL_AGENT_KEY}`);
    }
    const agent = this.createAgent(request, runtime, taskId);
    const output = await agent.generate(toMastraMessages(request.messages), {
      maxSteps: request.workspace ? 4 : 1,
      abortSignal: request.signal,
      modelSettings: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: clampMaxTokens(request.maxTokens ?? DEFAULT_MODEL_OUTPUT_TOKENS, this.config.maxOutputTokens),
      },
    });
    return {
      text: output.text,
      usage: {
        inputTokens: output.totalUsage.inputTokens ?? 0,
        outputTokens: output.totalUsage.outputTokens ?? 0,
      },
      provider: "mastra/global-model-gateway",
    };
  }

  private async completeDirect(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.config.baseUrl) {
      throw new Error("MODEL_GATEWAY_URL is not configured");
    }
    const taskId = request.taskId ?? `task_${crypto.randomUUID()}`;
    const runtime = await this.resolve(taskId);
    if (!runtime) {
      throw new Error(`global Model Gateway has no route for agentKey=${MODEL_AGENT_KEY}`);
    }
    const url = new URL("/v1/chat/completions", runtime.baseUrl ?? this.config.baseUrl);
    const controller = new AbortController();
    const abortFromRequest = () => controller.abort(request.signal?.reason);
    if (request.signal?.aborted) abortFromRequest();
    else request.signal?.addEventListener("abort", abortFromRequest, { once: true });
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
          max_tokens: clampMaxTokens(request.maxTokens ?? DEFAULT_MODEL_OUTPUT_TOKENS, this.config.maxOutputTokens),
          ...(request.thinkingMode && request.thinkingMode !== "auto"
            ? { thinking: { type: request.thinkingMode } }
            : {}),
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
        throw new Error(`global Model Gateway ${res.status}: ${body.slice(0, 300)}`);
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
        provider: "global-model-gateway",
        ...(toolCalls.length ? { toolCalls } : {}),
      };
    } finally {
      request.signal?.removeEventListener("abort", abortFromRequest);
      clearTimeout(timer);
    }
  }

  async completeStream(
    request: ChatCompletionRequest,
    onUpdate: ChatStreamHandler,
  ): Promise<ChatCompletionResponse> {
    if (request.tools?.length) {
      throw new Error("streaming tool calls are not supported by this client");
    }
    if (!this.config.baseUrl) throw new Error("MODEL_GATEWAY_URL is not configured");
    const taskId = request.taskId ?? `task_${crypto.randomUUID()}`;
    const runtime = await this.resolve(taskId);
    if (!runtime) {
      throw new Error(`global Model Gateway has no route for agentKey=${MODEL_AGENT_KEY}`);
    }
    const controller = new AbortController();
    const abortFromRequest = () => controller.abort(request.signal?.reason);
    if (request.signal?.aborted) abortFromRequest();
    else request.signal?.addEventListener("abort", abortFromRequest, { once: true });
    let firstByteTimer: ReturnType<typeof setTimeout> | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const totalTimer = setTimeout(
      () => controller.abort(new Error("模型生成超过任务总时长限制")),
      this.config.streamTotalTimeoutMs,
    );
    const armFirstByteTimeout = () => {
      firstByteTimer = setTimeout(
        () => controller.abort(new Error("等待模型首个输出超时")),
        this.config.streamFirstByteTimeoutMs,
      );
    };
    const armIdleTimeout = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => controller.abort(new Error("模型流式输出长时间没有新内容")),
        this.config.streamIdleTimeoutMs,
      );
    };
    armFirstByteTimeout();
    let text = "";
    try {
      const agent = this.createAgent(request, runtime, taskId);
      const output = await agent.stream(toMastraMessages(request.messages), {
        maxSteps: request.workspace ? 4 : 1,
        abortSignal: controller.signal,
        modelSettings: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: clampMaxTokens(request.maxTokens ?? DEFAULT_MODEL_OUTPUT_TOKENS, this.config.maxOutputTokens),
        },
      });
      let finishReason: string | undefined;
      let receivedFirstByte = false;
      for await (const chunk of output.fullStream) {
        const typedChunk = chunk as { type?: string; payload?: { text?: string; finishReason?: string }; finishReason?: string };
        const payload = typedChunk.payload;
        if (typedChunk.type === "finish" || typedChunk.type === "finish-step") {
          finishReason = typedChunk.finishReason ?? payload?.finishReason ?? finishReason;
        }
        const delta = typeof payload?.text === "string" ? payload.text : "";
        const activity =
          chunk.type === "reasoning-delta"
            ? "reasoning"
            : chunk.type === "text-delta" && delta
              ? "content"
              : "heartbeat";
        if (!receivedFirstByte) {
          receivedFirstByte = true;
          if (firstByteTimer) clearTimeout(firstByteTimer);
        }
        armIdleTimeout();
        if (activity === "content") text += delta;
        await onUpdate({
          delta: activity === "content" ? delta : "",
          text,
          activity,
          receivedChars: text.length + (activity === "reasoning" ? delta.length : 0),
        });
      }
      const usage = await output.totalUsage;
      return {
        text,
        usage: {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
        },
        provider: "mastra/global-model-gateway",
        ...(finishReason ? { finishReason } : {}),
      };
    } catch (error) {
      await Promise.resolve(onUpdate({
        delta: "",
        text,
        activity: "failed",
        receivedChars: text.length,
      })).catch(() => undefined);
      if (controller.signal.aborted && controller.signal.reason instanceof Error) {
        throw controller.signal.reason;
      }
      throw error;
    } finally {
      request.signal?.removeEventListener("abort", abortFromRequest);
      if (firstByteTimer) clearTimeout(firstByteTimer);
      if (idleTimer) clearTimeout(idleTimer);
      clearTimeout(totalTimer);
    }
  }

  private createAgent(
    request: ChatCompletionRequest,
    runtime: ResolvedModelRoute,
    taskId: string,
  ): Agent {
    if (!this.config.baseUrl) throw new Error("MODEL_GATEWAY_URL is not configured");
    return new Agent({
      id: `asset-hub-${taskId.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 96)}`,
      name: "Asset Hub Agent",
      instructions: systemInstructions(request.messages),
      model: createMastraModel(runtime, {
        taskId,
        fallbackBaseUrl: this.config.baseUrl,
        thinkingMode: request.thinkingMode,
      }),
      ...(request.workspace ? { workspace: request.workspace } : {}),
    });
  }
}

function clampMaxTokens(value: number, configuredCeiling = MAX_MODEL_OUTPUT_TOKENS): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MODEL_OUTPUT_TOKENS;
  return Math.min(Math.floor(value), MAX_MODEL_OUTPUT_TOKENS, Math.max(1, configuredCeiling));
}

function systemInstructions(messages: ChatMessage[]): string {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => chatContentAsText(message.content))
    .filter(Boolean)
    .join("\n\n");
  return `${system || "Follow the user's request accurately."}${messages.some((message) => message.role === "system" && message.content && chatContentAsText(message.content).includes("严格 JSON")) ? "\nReturn valid JSON only; do not wrap it in Markdown fences." : ""}`;
}

function toMastraMessages(messages: ChatMessage[]): MessageListInput {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: Array.isArray(message.content)
        ? message.content.map((part) =>
            part.type === "text" ? part : { type: "image", image: new URL(part.image_url.url) },
          )
        : (message.content ?? ""),
      ...(message.tool_call_id ? { toolCallId: message.tool_call_id } : {}),
    })) as MessageListInput;
}

function chatContentAsText(content: ChatMessage["content"]): string {
  if (Array.isArray(content)) {
    return content.map((part) => (part.type === "text" ? part.text : "[image]")).join("\n");
  }
  return content ?? "";
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
    const prompt = request.messages
      .map((message) => {
        const content = Array.isArray(message.content)
          ? message.content
              .map((part) => (part.type === "text" ? part.text : "[rendered slide image]"))
              .join("\n")
          : (message.content ?? "");
        return `${message.role}: ${content}`;
      })
      .join("\n\n");
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
  finishReason?: string;
  toolCalls?: ChatToolCall[];
}

export class AiService {
  private readonly gateway: ModelGatewayClient;
  private readonly local: LocalModel;

  constructor(
    private readonly options: {
      forceLocal?: boolean;
      quality?: ModelQuality;
      workspace?: Workspace;
    } = {},
  ) {
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
      if (request.fallbackToLocal === false) {
        throw new Error("MODEL_GATEWAY_URL is not configured and local fallback is disabled");
      }
      return this.local.complete(request);
    }
    try {
      return await this.gateway.complete({
        ...request,
        ...(request.workspace || !this.options.workspace
          ? {}
          : { workspace: this.options.workspace }),
        quality: request.quality ?? this.options.quality ?? "balanced",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[ai-core] global Model Gateway failed, falling back to local:", message);
      if (request.fallbackToLocal === false || process.env.AI_FALLBACK_TO_LOCAL === "false") {
        throw err;
      }
      const fallback = await this.local.complete(request);
      return { ...fallback, text: `${fallback.text}\n\n<!-- ai-fallback: ${message} -->` };
    }
  }

  async completeStream(
    request: ChatCompletionRequest,
    onUpdate: ChatStreamHandler,
  ): Promise<AiResult> {
    if (this.useLocal()) {
      if (request.fallbackToLocal === false) {
        throw new Error("MODEL_GATEWAY_URL is not configured and local fallback is disabled");
      }
      const local = await this.local.complete(request);
      await onUpdate({
        delta: local.text,
        text: local.text,
        activity: "content",
        receivedChars: local.text.length,
      });
      return local;
    }
    try {
      return await this.gateway.completeStream(
        {
          ...request,
          ...(request.workspace || !this.options.workspace
            ? {}
            : { workspace: this.options.workspace }),
          quality: request.quality ?? this.options.quality ?? "balanced",
        },
        onUpdate,
      );
    } catch (err) {
      if (request.fallbackToLocal === false || process.env.AI_FALLBACK_TO_LOCAL === "false") {
        throw err;
      }
      const local = await this.local.complete(request);
      await onUpdate({
        delta: local.text,
        text: local.text,
        activity: "content",
        receivedChars: local.text.length,
      });
      return local;
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const fallbackMatch = raw.match(/ai-fallback:\s*([^>]+)/);
      const hint = fallbackMatch?.[1] ? `（网关错误：${fallbackMatch[1].trim()}）` : "";
      throw new Error(`AI 服务返回了非 JSON 内容${hint}，可能余额不足或服务不可用`);
    }
    return { data: schema.parse(parsed), provider: res.provider, usage: res.usage };
  }

  async completeJsonStream<T>(
    request: ChatCompletionRequest,
    schema: z.ZodType<T>,
    onUpdate: ChatStreamHandler,
  ): Promise<{ data: T; provider: string; usage: { inputTokens: number; outputTokens: number } }> {
    const res = await this.completeStream({ ...request, responseFormat: "json_object" }, onUpdate);
    const raw = res.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("AI 服务返回了非 JSON 内容，可能余额不足或服务不可用");
    }
    return { data: schema.parse(parsed), provider: res.provider, usage: res.usage };
  }
}

export const createAiService = (options?: {
  forceLocal?: boolean;
  quality?: ModelQuality;
  workspace?: Workspace;
}): AiService => new AiService(options);

/* ------------------------------------------------------------------ */
/* 动态能力上下文（Skill / MCP manifest）                               */
/* ------------------------------------------------------------------ */

export interface CapabilityContext {
  agentId: string;
  skills: Array<{ name: string; version: string }>;
  skillManifest?: AgentSkillManifest;
  /** Mastra 原生 Skill Workspace；Agent 通过工具按需读取相关内容。 */
  workspace?: Workspace;
  mcpServers: Array<{
    name: string;
    url: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }>;
  /** 仅列出能力名称，不包含 SKILL.md 内容。 */
  summary: string;
  dispose: () => Promise<void>;
}

/**
 * 将 Skill Gateway manifest 挂载为 Mastra Workspace，同时加载 MCP manifest。
 * Skill 正文不会被下载并拼入 system prompt；只有 Agent 选择相关 Skill 时才会读取 blob。
 */
export async function loadCapabilityContext(
  agentId: string,
  taskId?: string,
): Promise<CapabilityContext | null> {
  const skill = loadSkillGatewayConfig();
  const mcp = loadMcpGatewayConfig();

  const [remoteSkills, mcpServers] = await Promise.all([
    skill.baseUrl && skill.token && taskId
      ? createMastraRemoteSkillWorkspace({
          agentId,
          taskId,
          skillGatewayUrl: skill.baseUrl,
          token: skill.token,
        }).catch(() => null)
      : Promise.resolve(null),
    mcp.baseUrl ? fetchMcpServers(agentId, mcp.baseUrl, mcp.token) : Promise.resolve([]),
  ]);

  const skills = (remoteSkills?.manifest.skills ?? [])
    .filter((entry) => entry.enabled)
    .map((entry) => ({ name: entry.name, version: entry.version }));
  if (skills.length === 0 && mcpServers.length === 0) return null;
  const summary = buildCapabilitySummary(skills, mcpServers);
  return {
    agentId,
    skills,
    mcpServers,
    summary,
    ...(remoteSkills
      ? { workspace: remoteSkills.workspace, skillManifest: remoteSkills.manifest }
      : {}),
    dispose: async () => {
      await remoteSkills?.workspace.destroy();
    },
  };
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
  skills: Array<{ name: string; version: string }>,
  mcpServers: CapabilityContext["mcpServers"],
): string {
  const lines: string[] = ["可用动态能力："];
  for (const s of skills) {
    lines.push(`- Skill「${s.name}」(${s.version})，通过 Mastra Workspace 按需读取`);
  }
  for (const m of mcpServers) {
    lines.push(`- MCP 工具服务「${m.name}」(${m.url})`);
  }
  lines.push("\n按需使用已列出的能力，不要编造未列出的能力。");
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
