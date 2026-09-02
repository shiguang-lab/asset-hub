import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { MastraModelConfig } from "@mastra/core/llm";

export interface ResolvedModelRoute {
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey: string;
  capabilities?: {
    structuredOutput?: boolean;
  };
}

/** Convert a global Model Gateway route into the AI SDK model consumed by Mastra. */
export function createMastraModel(
  route: ResolvedModelRoute,
  options: {
    taskId: string;
    fallbackBaseUrl: string;
    thinkingMode?: "enabled" | "disabled" | "auto";
  },
): MastraModelConfig {
  const baseURL = (route.baseUrl || options.fallbackBaseUrl).replace(/\/+$/, "");
  if (!baseURL) throw new Error("global Model Gateway route is missing baseUrl");

  const model = routeModelId(route.model);
  const headers = modelGatewayRouteHeaders(route.apiKey, options.taskId);
  const injectThinking = <T extends Record<string, unknown>>(body: T): T =>
    options.thinkingMode && options.thinkingMode !== "auto"
      ? ({ ...body, thinking: { type: options.thinkingMode } } as T)
      : body;
  const middlewareFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    if (!init?.body || typeof init.body !== "string") return fetch(input, init);
    try {
      const response = await fetch(input, {
        ...init,
        body: JSON.stringify(injectThinking(JSON.parse(init.body) as Record<string, unknown>)),
      });
      return normalizeOpenAiStreamResponse(response);
    } catch {
      return fetch(input, init);
    }
  };
  if (route.provider === "anthropic") {
    return createAnthropic({ apiKey: route.apiKey, baseURL, headers })(model);
  }
  if (route.provider === "google") {
    return createGoogleGenerativeAI({ apiKey: route.apiKey, baseURL, headers })(model);
  }
  if (route.provider === "openai") {
    // Asset Hub's global route preserves the existing /v1/chat/completions
    // contract. Mastra still owns the Agent execution; the adapter only picks
    // the wire-compatible AI SDK surface.
    return createOpenAI({ apiKey: route.apiKey, baseURL, headers, fetch: middlewareFetch }).chat(
      model,
    );
  }
  return createOpenAICompatible({
    name: "global-model-gateway",
    apiKey: route.apiKey,
    baseURL,
    headers,
    supportsStructuredOutputs: route.capabilities?.structuredOutput === true,
    transformRequestBody: injectThinking,
  })(model);
}

/**
 * Some OpenAI-compatible gateways omit choices[].index in SSE deltas. The
 * AI SDK parser used by Mastra validates this field as required, so normalize
 * the gateway response at the adapter boundary instead of losing the stream.
 */
export function normalizeOpenAiStreamResponse(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.body || !/text\/event-stream/i.test(contentType)) return response;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const event of events) controller.enqueue(encoder.encode(normalizeSseEvent(event)));
    },
    flush(controller) {
      buffer += decoder.decode();
      if (buffer) controller.enqueue(encoder.encode(normalizeSseEvent(buffer)));
    },
  });
  return new Response(response.body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function normalizeSseEvent(event: string): string {
  const lines = event.split(/\r?\n/);
  return `${lines
    .map((line) => {
      if (!line.startsWith("data:") || line.slice(5).trim() === "[DONE]") return line;
      const raw = line.slice(5).trimStart();
      try {
        const payload = JSON.parse(raw) as { choices?: Array<Record<string, unknown>> };
        if (Array.isArray(payload.choices)) {
          payload.choices = payload.choices.map((choice) =>
            typeof choice.index === "number" ? choice : { index: 0, ...choice },
          );
        }
        return `data: ${JSON.stringify(payload)}`;
      } catch {
        return line;
      }
    })
    .join("\n")}\n\n`;
}

export function modelGatewayRouteHeaders(apiKey: string, taskId: string): Record<string, string> {
  const normalizedTaskId = taskId.trim();
  if (!normalizedTaskId) throw new Error("global Model Gateway route is missing taskId");
  return {
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    "x-opc-task-id": normalizedTaskId,
  };
}

export function routeModelId(model: string): string {
  const trimmed = model.trim();
  const separator = trimmed.indexOf("/");
  return separator >= 0 ? trimmed.slice(separator + 1) : trimmed;
}
