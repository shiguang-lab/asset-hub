import { describe, expect, it } from "vitest";
import type { TaskStreamEvent } from "../../entities/api.js";
import { latestPlanningStream } from "./presentation-planning-stream.js";

function event(input: Partial<TaskStreamEvent> & Pick<TaskStreamEvent, "activity" | "delta">) {
  return {
    id: crypto.randomUUID(),
    taskId: "task-1",
    runId: "run-current",
    sequence: 1,
    phase: "planning",
    receivedChars: null,
    finishReason: null,
    usage: null,
    createdAt: "2026-08-27T03:00:00.000Z",
    ...input,
  } satisfies TaskStreamEvent;
}

describe("latestPlanningStream", () => {
  it("keeps reasoning and content as separate ordered streams", () => {
    const stream = latestPlanningStream([
      event({ sequence: 3, activity: "content", delta: "正文" }),
      event({ sequence: 1, activity: "reasoning", delta: "先分析" }),
      event({ sequence: 2, activity: "reasoning", delta: "，再取舍" }),
    ]);

    expect(stream).toEqual({ reasoning: "先分析，再取舍", content: "正文" });
  });

  it("uses only the newest planning run and strips streamed JSON fences", () => {
    const stream = latestPlanningStream([
      event({ runId: "run-old", activity: "reasoning", delta: "旧推理" }),
      event({
        runId: "run-new",
        sequence: 1,
        activity: "reasoning",
        delta: "新推理",
        createdAt: "2026-08-27T03:01:00.000Z",
      }),
      event({
        runId: "run-new",
        sequence: 2,
        activity: "content",
        delta: '```json\n{"plan":true}\n```',
        createdAt: "2026-08-27T03:01:01.000Z",
      }),
    ]);

    expect(stream).toEqual({ reasoning: "新推理", content: '{"plan":true}' });
  });
});
