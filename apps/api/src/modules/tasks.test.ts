import { describe, expect, it } from "vitest";
import { buildPresentationSnapshotPayload, buildTaskRetryState } from "./tasks.js";

describe("task retry state", () => {
  it("keeps a presentation rendering checkpoint and resumes after completed pages", () => {
    const result = buildTaskRetryState(
      {
        type: "presentation_generate",
        checkpoint: {
          phase: "failed",
          stoppedAtPhase: "rendering",
          completedPages: 6,
          estimatedPages: 12,
          pageTitles: ["1", "2", "3", "4", "5", "6"],
          plan: { slides: [] },
          renderingResume: {
            schema: "presentation-rendering-resume-ref/v2",
            objectKey: "tasks/tsk_1/presentation/rendering-resume.json",
            completedPages: 6,
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
          errorCode: "MODEL_STREAM_IDLE_TIMEOUT",
          errorMessage: "stream stopped",
          failureDetails: { retry: { attempts: 6 } },
        },
      },
      "2026-08-26T01:00:00.000Z",
    );

    expect(result.progress).toBe(56);
    expect(result.currentStep).toBe("等待从失败页面继续");
    expect(result.checkpoint).toMatchObject({
      phase: "rendering",
      activity: "waiting",
      completedPages: 6,
      pageTitles: ["1", "2", "3", "4", "5", "6"],
      updatedAt: "2026-08-26T01:00:00.000Z",
    });
    expect(result.checkpoint).not.toHaveProperty("errorCode");
    expect(result.checkpoint).not.toHaveProperty("failureDetails");
  });

  it("starts other tasks from the beginning", () => {
    expect(
      buildTaskRetryState({
        type: "research",
        checkpoint: { phase: "failed", completedPages: 6 },
      }),
    ).toEqual({ progress: 0, currentStep: "等待重试", checkpoint: null });
  });

  it("keeps a completed rendering checkpoint but retries visual review when that phase failed", () => {
    const result = buildTaskRetryState({
      type: "presentation_generate",
      checkpoint: {
        phase: "failed",
        stoppedAtPhase: "reviewing",
        completedPages: 12,
        estimatedPages: 12,
        pageTitles: Array.from({ length: 12 }, (_, index) => String(index + 1)),
        renderingResume: {
          schema: "presentation-rendering-resume-ref/v2",
          objectKey: "tasks/tsk_2/presentation/rendering-resume.json",
          completedPages: 12,
          updatedAt: "2026-08-26T00:00:00.000Z",
        },
      },
    });

    expect(result.progress).toBe(81);
    expect(result.currentStep).toBe("等待重新进行视觉审查");
    expect(result.checkpoint).toMatchObject({
      phase: "reviewing",
      phaseLabel: "等待重新进行视觉审查",
      retryFromPhase: "reviewing",
      completedPages: 12,
    });
  });

  it("keeps a completed rendering checkpoint but retries compiling when that phase failed", () => {
    const result = buildTaskRetryState({
      type: "presentation_generate",
      checkpoint: {
        phase: "failed",
        stoppedAtPhase: "compiling",
        completedPages: 12,
        estimatedPages: 12,
        pageTitles: Array.from({ length: 12 }, (_, index) => String(index + 1)),
        renderingResume: {
          schema: "presentation-rendering-resume-ref/v2",
          objectKey: "tasks/tsk_compile/presentation/rendering-resume.json",
          completedPages: 12,
          updatedAt: "2026-08-26T00:00:00.000Z",
        },
      },
    });

    expect(result.progress).toBe(95);
    expect(result.currentStep).toBe("等待重新编译编辑能力");
    expect(result.checkpoint).toMatchObject({
      phase: "compiling",
      phaseLabel: "等待重新编译编辑能力",
      retryFromPhase: "compiling",
    });
  });

  it("keeps a completed rendering checkpoint and resumes repair from the failed page", () => {
    const result = buildTaskRetryState({
      type: "presentation_generate",
      checkpoint: {
        phase: "failed",
        stoppedAtPhase: "repairing",
        completedPages: 12,
        estimatedPages: 12,
        pageTitles: Array.from({ length: 12 }, (_, index) => String(index + 1)),
        repairedPages: [1, 2, 3],
        renderingResume: {
          schema: "presentation-rendering-resume-ref/v2",
          objectKey: "tasks/tsk_3/presentation/rendering-resume.json",
          completedPages: 12,
          updatedAt: "2026-08-26T00:00:00.000Z",
        },
      },
    });

    expect(result.progress).toBe(88);
    expect(result.currentStep).toBe("等待从失败页面继续定向修复");
    expect(result.checkpoint).toMatchObject({
      phase: "repairing",
      phaseLabel: "等待从失败页面继续定向修复",
      retryFromPhase: "repairing",
      repairedPages: [1, 2, 3],
    });
  });

  it("starts a presentation from the beginning when no completed-page checkpoint exists", () => {
    expect(
      buildTaskRetryState({
        type: "presentation_generate",
        checkpoint: { phase: "failed", stoppedAtPhase: "planning" },
      }),
    ).toEqual({ progress: 0, currentStep: "等待重试", checkpoint: null });
  });
});

describe("presentation snapshot payload", () => {
  const reviewResumeBlob = JSON.stringify({
    schema: "presentation-review-resume/v1",
    htmlHash: "a".repeat(64),
    planHash: "b".repeat(64),
    html: "<html><body><h1>reviewed deck</h1></body></html>",
    review: { summary: "needs repair", needsRepair: true, issues: [] },
    renderAudit: { available: true, pageCount: 2, issues: [], slides: [] },
    updatedAt: "2026-08-26T00:00:00.000Z",
  });
  const storage = (blob: string | null) => ({
    get: async (_key: string) =>
      blob === null ? null : Buffer.from(blob === "__missing__" ? "" : blob, "utf8"),
  });

  it("returns the reviewed snapshot html from the review-resume blob", async () => {
    const snapshot = await buildPresentationSnapshotPayload(
      {
        type: "presentation_generate",
        checkpoint: {
          reviewResume: {
            schema: "presentation-review-resume-ref/v1",
            objectKey: "tasks/tsk_1/presentation/review-resume.json",
            htmlHash: "a".repeat(64),
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
        },
      },
      storage(reviewResumeBlob),
    );
    expect(snapshot).not.toBeNull();
    expect(snapshot?.html).toContain("reviewed deck");
    expect(snapshot?.schema).toBe("presentation-review-resume/v1");
    expect(snapshot?.review).toMatchObject({ needsRepair: true });
    expect(snapshot?.renderAudit).toMatchObject({ pageCount: 2 });
  });

  it("falls back to the repair-resume blob when no review snapshot exists", async () => {
    const repairResumeBlob = JSON.stringify({
      schema: "presentation-repair-resume/v1",
      htmlHash: "c".repeat(64),
      planHash: "d".repeat(64),
      html: "<html><body><h1>repaired deck</h1></body></html>",
      repairPass: 3,
      previousRepairFailures: ["第 1 页：溢出"],
      updatedAt: "2026-08-26T01:00:00.000Z",
    });
    const snapshot = await buildPresentationSnapshotPayload(
      {
        type: "presentation_generate",
        checkpoint: {
          repairResume: {
            schema: "presentation-repair-resume-ref/v1",
            objectKey: "tasks/tsk_2/presentation/repair-resume.json",
            htmlHash: "c".repeat(64),
            repairPass: 3,
            updatedAt: "2026-08-26T01:00:00.000Z",
          },
        },
      },
      storage(repairResumeBlob),
    );
    expect(snapshot?.html).toContain("repaired deck");
    expect(snapshot?.repairPass).toBe(3);
    expect(snapshot?.previousRepairFailures).toEqual(["第 1 页：溢出"]);
  });

  it("returns null when no resume blob is available", async () => {
    const snapshot = await buildPresentationSnapshotPayload(
      { type: "presentation_generate", checkpoint: {} },
      storage(null),
    );
    expect(snapshot).toBeNull();
  });

  it("returns null when the resume blob has no html", async () => {
    const snapshot = await buildPresentationSnapshotPayload(
      {
        type: "presentation_generate",
        checkpoint: {
          reviewResume: {
            schema: "presentation-review-resume-ref/v1",
            objectKey: "tasks/tsk_3/presentation/review-resume.json",
            htmlHash: "a".repeat(64),
            updatedAt: "2026-08-26T00:00:00.000Z",
          },
        },
      },
      storage("__missing__"),
    );
    expect(snapshot).toBeNull();
  });
});
