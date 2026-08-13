import { chunkText, extractPlainText } from "@shiguang/content";
import type { ObjectStore } from "@shiguang/database";
import { type StepContext, step } from "./helpers.js";

export async function runKnowledgeWorkflow(
  ctx: StepContext,
  data: Record<string, unknown>,
  storage: ObjectStore,
): Promise<void> {
  const { kbId, sourceId } = data as { kbId: string; sourceId: string };
  const objectKey = data.objectKey as string | undefined;
  const url = data.url as string | undefined;

  let text = "";
  await step(ctx, "knowledge.parse", 30, "解析来源内容", async () => {
    if (objectKey) {
      const buffer = await storage.get(objectKey);
      if (!buffer) throw new Error(`object not found: ${objectKey}`);
      const raw = buffer.toString("utf8");
      const fileName = String(data.fileName ?? "");
      const format =
        fileName.endsWith(".html") ||
        raw.trimStart().startsWith("<!doctype") ||
        raw.trimStart().startsWith("<html")
          ? "html"
          : "markdown";
      text = extractPlainText(raw, format as "markdown" | "html");
    } else if (url) {
      text = await fetchUrlText(url);
    } else {
      throw new Error("knowledge source has no content reference");
    }
    if (text.trim().length === 0) throw new Error("解析后内容为空");
  });

  let chunks: Array<{
    ordinal: number;
    headingPath: string;
    text: string;
    charStart: number;
    charEnd: number;
  }> = [];
  await step(ctx, "knowledge.chunk", 65, "分块并计算定位信息", async () => {
    chunks = chunkText(text).map((c) => ({
      ordinal: c.ordinal,
      headingPath: c.headingPath,
      text: c.text,
      charStart: c.charStart,
      charEnd: c.charEnd,
    }));
  });

  await step(ctx, "knowledge.index", 90, "写入索引并更新来源状态", async () => {
    const res = await ctx.api.postComputeResults({
      kind: "knowledge.indexed",
      taskId: ctx.taskId,
      runId: ctx.runId,
      data: { kbId, sourceId, chunks },
    });
    if (!res.ok) throw new Error("knowledge index projection failed");
  });
}

async function fetchUrlText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "ShiguangLabResearch/1.0" },
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const contentType = String(res.headers.get("content-type") ?? "");
    const raw = await res.text();
    if (contentType.includes("html")) return extractPlainText(raw, "html");
    return raw;
  } finally {
    clearTimeout(timer);
  }
}
