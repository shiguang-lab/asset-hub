import type { ModelGatewayConfig } from "@shiguang/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelGatewayClient } from "./index.js";

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
    const result = await new ModelGatewayClient(config).completeStream(
      {
        taskId: "tsk_stream_test",
        messages: [{ role: "user", content: "生成演示" }],
        maxTokens: 16_384,
        thinkingMode: "disabled",
      },
      (update) => {
        activities.push(update.activity);
        receivedChars.push(update.receivedChars);
      },
    );

    expect(result.text).toBe("<html>完成</html>");
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
    expect(activities).toContain("reasoning");
    expect(activities).toContain("content");
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
        messages: [{ role: "user", content: "生成演示" }],
        signal: abortController.signal,
      },
      () => undefined,
    );
    await Promise.resolve();
    abortController.abort(new Error("generation cancelled by user"));

    await expect(pending).rejects.toThrow("generation cancelled by user");
  });
});
