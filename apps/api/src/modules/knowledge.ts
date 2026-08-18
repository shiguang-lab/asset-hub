import { nextId, nowIso } from "@shiguang/contracts";
import { hashBuffer } from "@shiguang/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAssetAccess } from "../platform/authorization.js";
import { badRequest, notFound } from "../platform/errors.js";
import type { AppContext } from "../types.js";

export function registerKnowledge(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.post("/api/v1/knowledge-bases", async (req) => {
    const body = z
      .object({ name: z.string().min(1).max(100), description: z.string().max(500).optional() })
      .parse(req.body);
    const kb = await ctx.store.createKnowledgeBase(req.actor, body);
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "knowledge.create",
      kb.id,
      "success",
      {},
    );
    return kb;
  });

  app.get(
    "/api/v1/knowledge-bases",
    async (req) => await ctx.store.listKnowledgeBases(req.actor.workspaceId),
  );

  app.get("/api/v1/knowledge-bases/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const kb = await ctx.store.getKnowledgeBase(req.actor.workspaceId, id);
    if (!kb) return reply.code(404).send({ code: "RESOURCE_NOT_FOUND" });
    return { ...kb, sources: await ctx.store.listKnowledgeSources(id) };
  });

  app.post("/api/v1/knowledge-bases/:id/sources", async (req, _reply) => {
    const { id: kbId } = req.params as { id: string };
    const kb = await ctx.store.getKnowledgeBase(req.actor.workspaceId, kbId);
    if (!kb) throw notFound("知识库");
    const contentType = req.headers["content-type"];
    if (typeof contentType === "string" && contentType.includes("multipart/form-data")) {
      const part = await req.file();
      if (!part) throw badRequest("FILE_REQUIRED", "请上传文件");
      const buffer = Buffer.from(await part.toBuffer());
      const hash = hashBuffer(buffer);
      const objectKey = `knowledge-sources/${req.actor.workspaceId}/${kbId}/${Date.now()}-${part.filename}`;
      await ctx.storage.put(objectKey, buffer, part.mimetype);
      const source = await ctx.store.addKnowledgeSource(req.actor.workspaceId, kbId, {
        sourceType: "upload",
        title: part.filename,
        contentHash: hash,
      });
      await ctx.store.audit(
        req.actor.workspaceId,
        req.actor.subject,
        "knowledge.source.add",
        source.id,
        "success",
        { kind: "upload" },
      );
      await ctx.bus.emit({
        eventId: nextId("evt"),
        eventType: "knowledge.source.added",
        schemaVersion: 1,
        occurredAt: nowIso(),
        producer: "api",
        tenantId: req.actor.workspaceId,
        aggregate: { type: "knowledge_source", id: source.id, version: 1 },
        trace: {},
        data: { sourceId: source.id, kbId, objectKey, fileName: part.filename, contentHash: hash },
      });
      return source;
    }
    const body = z
      .object({
        sourceType: z.enum(["asset", "url"]),
        assetId: z.string().optional(),
        url: z.string().url().optional(),
        title: z.string().optional(),
      })
      .parse(req.body);
    if (body.sourceType === "asset") {
      if (!body.assetId) throw badRequest("ASSET_REQUIRED", "需要 assetId");
      const asset = await requireAssetAccess(ctx, req.actor, body.assetId, "read");
      const content = await ctx.store.readContent(body.assetId);
      const text = content?.text ?? "";
      const objectKey = `knowledge-sources/${req.actor.workspaceId}/${kbId}/${asset.id}-${asset.currentVersionId}`;
      await ctx.storage.put(objectKey, Buffer.from(text, "utf8"), "text/plain");
      const source = await ctx.store.addKnowledgeSource(req.actor.workspaceId, kbId, {
        sourceType: "asset",
        assetVersionId: asset.currentVersionId,
        title: body.title ?? asset.title,
        contentHash: hashBuffer(Buffer.from(text, "utf8")),
      });
      await ctx.store.audit(
        req.actor.workspaceId,
        req.actor.subject,
        "knowledge.source.add",
        source.id,
        "success",
        { kind: "asset" },
      );
      await ctx.bus.emit({
        eventId: nextId("evt"),
        eventType: "knowledge.source.added",
        schemaVersion: 1,
        occurredAt: nowIso(),
        producer: "api",
        tenantId: req.actor.workspaceId,
        aggregate: { type: "knowledge_source", id: source.id, version: 1 },
        trace: {},
        data: {
          sourceId: source.id,
          kbId,
          objectKey,
          fileName: asset.title,
          contentHash: source.contentHash,
        },
      });
      return source;
    }
    if (!body.url) throw badRequest("URL_REQUIRED", "需要 URL");
    const source = await ctx.store.addKnowledgeSource(req.actor.workspaceId, kbId, {
      sourceType: "url",
      url: body.url,
      title: body.title ?? body.url,
    });
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "knowledge.source.add",
      source.id,
      "success",
      { kind: "url" },
    );
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "knowledge.source.added",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "knowledge_source", id: source.id, version: 1 },
      trace: {},
      data: { sourceId: source.id, kbId, url: body.url },
    });
    return source;
  });

  app.post("/api/v1/knowledge-bases/:id/sources/:sid/retry", async (req) => {
    const { id: kbId, sid } = req.params as { id: string; sid: string };
    const source = await ctx.store.retryKnowledgeSource(kbId, sid);
    if (!source) throw notFound("知识库来源");
    await ctx.bus.emit({
      eventId: nextId("evt"),
      eventType: "knowledge.source.added",
      schemaVersion: 1,
      occurredAt: nowIso(),
      producer: "api",
      tenantId: req.actor.workspaceId,
      aggregate: { type: "knowledge_source", id: sid, version: source.retryCount + 1 },
      trace: {},
      data: { sourceId: sid, kbId },
    });
    return source;
  });

  app.delete("/api/v1/knowledge-bases/:id/sources/:sid", async (req, reply) => {
    const { id: kbId, sid } = req.params as { id: string; sid: string };
    await ctx.store.removeKnowledgeSource(kbId, sid);
    return reply.code(204).send();
  });

  app.post("/api/v1/knowledge-bases/:id/search", async (req) => {
    const { id: kbId } = req.params as { id: string };
    const body = z
      .object({ query: z.string().min(1).max(500), limit: z.number().min(1).max(50).default(10) })
      .parse(req.body);
    const kb = await ctx.store.getKnowledgeBase(req.actor.workspaceId, kbId);
    if (!kb) throw notFound("知识库");
    return await ctx.store.searchChunks(kbId, body.query, body.limit);
  });

  app.post("/api/v1/knowledge-bases/:id/ask", async (req) => {
    const { id: kbId } = req.params as { id: string };
    const body = z
      .object({ query: z.string().min(1).max(500), topK: z.number().min(1).max(20).default(6) })
      .parse(req.body);
    const kb = await ctx.store.getKnowledgeBase(req.actor.workspaceId, kbId);
    if (!kb) throw notFound("知识库");
    const results = await ctx.store.searchChunks(kbId, body.query, body.topK);
    const context = results
      .map((r, i) => `CHUNK ${i + 1}:\n来源：${r.source.title}\n${r.chunk.text}`)
      .join("\n\n");
    const res = await ctx.ai.complete({
      messages: [
        {
          role: "system",
          content:
            "你是知识库问答助手。只依据提供的 CHUNK 内容回答，并输出 citation。没有依据时明确说明资料不足，禁止编造。",
        },
        { role: "user", content: `knowledge-answer\nquery: ${body.query}\n\n${context}` },
      ],
      quality: "economy",
    });
    let parsed: { answer: string; citations: number[]; insufficient?: boolean } = {
      answer: res.text,
      citations: [],
      insufficient: results.length === 0,
    };
    try {
      const raw = res.text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      parsed.answer = res.text;
    }
    const citations = results.map((r, i) => ({
      index: i + 1,
      sourceId: r.chunk.sourceId,
      sourceTitle: r.source.title,
      chunkId: r.chunk.id,
      ordinal: r.chunk.ordinal,
      headingPath: r.chunk.headingPath,
      excerpt: r.chunk.text.slice(0, 200),
      kbId,
    }));
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "knowledge.ask",
      kbId,
      "success",
      {
        query: body.query,
      },
    );
    return {
      answer: parsed.answer,
      insufficient: parsed.insufficient ?? results.length === 0,
      citations: citations
        .filter((c) => parsed.citations.includes(c.index) || parsed.citations.length === 0)
        .slice(0, body.topK),
      usage: res.usage,
      provider: res.provider,
    };
  });

  app.get("/api/v1/knowledge-bases/:id/sources/:sid/chunks", async (req) => {
    const { id: kbId, sid } = req.params as { id: string; sid: string };
    return await ctx.store.listChunksBySource(kbId, sid);
  });
}
