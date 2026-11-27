import type { ObjectStore } from "@shiguang/database";
import { type StepContext, step } from "./helpers.js";

export interface ExportSpec {
  assetId?: string;
  format?: "pdf" | "png" | "html" | "markdown" | "csv";
  title?: string;
}

export async function runExportWorkflow(
  ctx: StepContext,
  spec: Record<string, unknown>,
  _storage: ObjectStore,
): Promise<void> {
  const assetId = String(spec.assetId ?? "");
  const format = String(spec.format ?? "pdf").toLowerCase();

  await step(ctx, "export.fetch", 20, "读取待导出资产源数据", async () => {
    ctx.logger.info({ taskId: ctx.taskId, assetId, format }, "starting export");
  });

  if (!assetId) {
    throw new Error("export task requires assetId in spec");
  }

  const source = await ctx.api.getThumbnailSource(assetId);
  if (!source) {
    throw new Error(`asset not found: ${assetId}`);
  }

  let exportedText = "";
  let mediaType = "text/plain";
  const exportedFileName = `${source.title || "export"}.${format}`;

  await step(ctx, "export.render", 70, `渲染并转换文档为 ${format.toUpperCase()}`, async () => {
    if (format === "csv") {
      const manifest = source.content?.manifest as
        | { rows?: Array<Record<string, unknown>> }
        | undefined;
      const rows = manifest?.rows ?? [];
      const firstRow = rows[0];
      if (!firstRow) {
        exportedText = "id,name,value\n";
      } else {
        const headers = Object.keys(firstRow);
        const lines = [headers.join(",")];
        for (const row of rows) {
          lines.push(
            headers
              .map((h) => {
                const val = String(row[h] ?? "");
                return val.includes(",") ? `"${val.replace(/"/g, '""')}"` : val;
              })
              .join(","),
          );
        }
        exportedText = lines.join("\n");
      }
      mediaType = "text/csv; charset=utf-8";
    } else if (format === "markdown") {
      exportedText = source.content?.text ?? `# ${source.title}\n\n`;
      mediaType = "text/markdown; charset=utf-8";
    } else if (format === "html") {
      const body = source.content?.text ?? `<h1>${source.title}</h1>`;
      exportedText = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${source.title}</title><style>body{font-family:sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6;}</style></head><body>${body}</body></html>`;
      mediaType = "text/html; charset=utf-8";
    } else {
      // PDF / PNG thumbnail representation
      exportedText = source.content?.text ?? `# ${source.title}`;
      mediaType = "application/pdf";
    }
  });

  await step(ctx, "export.project", 95, "生成导出产物资产", async () => {
    const result = await ctx.api.projectResult({
      resultSchema: "export/v1",
      taskId: ctx.taskId,
      runId: ctx.runId,
      attempt: 1,
      outputs: [
        {
          kind: "file",
          assetType: format === "html" ? "html" : "document",
          title: `${source.title} · 导出 (${format.toUpperCase()})`,
          content: {
            kind: format === "html" ? "html" : "markdown",
            text: exportedText,
          },
        },
      ],
      failures: [],
    });
    if (!result.ok) throw new Error("export result projection failed");
  });
}
