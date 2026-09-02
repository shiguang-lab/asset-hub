import type { ModelGatewayConfig } from "@shiguang/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ModelGatewayClient } from "./index.js";
import { normalizeOpenAiStreamResponse } from "./mastra-model.js";

const config: ModelGatewayConfig = {
  baseUrl: "http://gateway.test",
  apiKey: "gateway-token",
  model: "fallback-model",
  timeoutMs: 1_000,
  streamFirstByteTimeoutMs: 1_000,
  streamIdleTimeoutMs: 1_000,
  streamTotalTimeoutMs: 5_000,
};

describe("ModelGatewayClient.completeStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses reasoning activity and streamed OpenAI content", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"reasoning_content":"思考"}}]}\n\n' +
              'data: {"choices":[{"delta":{"content":"<html>"}}]}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"完成</html>"}}]}\n\n' +
              'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":8}}\n\n' +
              "data: [DONE]\n\n",
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            provider: "openai",
            model: "deepseek-v4-flash",
            baseUrl: "http://provider.test",
            apiKey: "provider-token",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const activities: string[] = [];
    const receivedChars: number[] = [];
    const deltas: string[] = [];
    const result = await new ModelGatewayClient(config).completeStream(
      {
        taskId: "tsk_stream_test",
        agentMode: "direct",
        messages: [{ role: "user", content: "生成演示" }],
        maxTokens: 16_384,
        thinkingMode: "disabled",
        modelTaskKey: "presentation.visual-review",
      },
      (update) => {
        activities.push(update.activity);
        deltas.push(update.delta);
        receivedChars.push(update.receivedChars);
      },
    );

    expect(result.text).toBe("<html>完成</html>");
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
    expect(activities).toContain("reasoning");
    expect(activities).toContain("content");
    expect(deltas[0]).toBe("思考");
    expect(receivedChars[0]).toBe("思考".length);
    expect(receivedChars.at(-1)).toBe("思考<html>完成</html>".length);
    const request = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(request).toMatchObject({
      model: "deepseek-v4-flash",
      stream: true,
      max_tokens: 16_384,
      thinking: { type: "disabled" },
    });
    const resolveRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(resolveRequest).toMatchObject({
      agentKey: "asset-hub",
      taskKey: "presentation.visual-review",
      taskId: "tsk_stream_test",
    });
  });

  it("aborts while waiting for the first model byte", async () => {
    const abortController = new AbortController();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            provider: "openai",
            model: "deepseek-v4-flash",
            baseUrl: "http://provider.test",
            apiKey: "provider-token",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementationOnce((_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) {
            reject(init.signal.reason);
            return;
          }
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const pending = new ModelGatewayClient(config).completeStream(
      {
        taskId: "tsk_cancel_test",
        agentMode: "direct",
        messages: [{ role: "user", content: "生成演示" }],
        signal: abortController.signal,
      },
      () => undefined,
    );
    await Promise.resolve();
    abortController.abort(new Error("generation cancelled by user"));

    await expect(pending).rejects.toThrow("generation cancelled by user");
  });

  it("forwards strict JSON mode through the direct stream path", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"{\\"ok\\":true}"}}]}\n\n' + "data: [DONE]\n\n",
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            provider: "openai",
            model: "deepseek-v4-flash",
            baseUrl: "http://provider.test",
            apiKey: "provider-token",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ModelGatewayClient(config).completeStream(
      {
        taskId: "tsk_json_stream_test",
        agentMode: "direct",
        messages: [{ role: "user", content: "输出 JSON" }],
        responseFormat: "json_object",
        thinkingMode: "disabled",
      },
      () => undefined,
    );

    expect(result.text).toBe('{"ok":true}');
    const request = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(request).toMatchObject({
      stream: true,
      response_format: { type: "json_object" },
    });
  });

  it("normalizes gateway SSE chunks for Mastra's OpenAI parser", async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'),
          );
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

    const normalized = normalizeOpenAiStreamResponse(response);
    const body = await normalized.text();

    expect(body).toContain('"index":0');
  });

  it("keeps Mastra Agent streaming on the configured path", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"reasoning_content":"思考"}}]}\n\n' +
              'data: {"choices":[{"delta":{"content":"Mastra 输出"},"finish_reason":"stop"}]}\n\n' +
              "data: [DONE]\n\n",
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            provider: "openai",
            model: "deepseek-v4-flash",
            baseUrl: "http://provider.test",
            apiKey: "provider-token",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ModelGatewayClient(config).completeStream(
      {
        taskId: "tsk_mastra_stream_test",
        agentMode: "mastra",
        messages: [{ role: "user", content: "输出文本" }],
        thinkingMode: "disabled",
      },
      () => undefined,
    );

    expect(result.text).toBe("Mastra 输出");
    expect(result.provider).toBe("mastra/global-model-gateway");
  });

  it("uses Mastra structured output without dropping the final object", async () => {
    const responseStream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"{\\"ok\\":true}"},"finish_reason":"stop"}]}\n\n' +
                "data: [DONE]\n\n",
            ),
          );
          controller.close();
        },
      });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            provider: "openai",
            model: "deepseek-v4-flash",
            baseUrl: "http://provider.test",
            apiKey: "provider-token",
          }),
          { status: 200 },
        ),
      )
      .mockImplementation(async (input) => {
        if (String(input).includes("model-config/resolve")) {
          return new Response(
            JSON.stringify({
              provider: "openai",
              model: "deepseek-v4-flash",
              baseUrl: "http://provider.test",
              apiKey: "provider-token",
            }),
            { status: 200 },
          );
        }
        return new Response(responseStream(), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ModelGatewayClient(config).completeStream(
      {
        taskId: "tsk_mastra_structured_test",
        agentMode: "mastra",
        structuredOutput: z.object({ ok: z.boolean() }),
        messages: [{ role: "user", content: "输出 JSON" }],
        thinkingMode: "disabled",
      },
      () => undefined,
    );

    expect(result.text).toBe('{"ok":true}');
  });
});
