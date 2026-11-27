import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "../types.js";
import { registerDatasets } from "./datasets.js";
import { registerKnowledge } from "./knowledge.js";

function buildTestApp(storeOverrides: Record<string, unknown>) {
  const busEmit = vi.fn(async () => undefined);
  const app = Fastify();
  const mockCtx = {
    store: {
      audit: vi.fn(async () => undefined),
      ...storeOverrides,
    },
    bus: { emit: busEmit },
    config: { api: { port: 3000 } },
  } as unknown as AppContext;

  app.decorate("ctx", mockCtx);
  app.addHook("onRequest", async (req) => {
    req.actor = {
      workspaceId: "ws_1",
      workspaceType: "personal",
      workspaceRole: "owner",
      subject: "user_1",
      displayName: "测试用户",
      requestId: "req_test",
      tokenScopes: ["read", "write"],
      isService: false,
    };
  });
  app.setErrorHandler((err: Error & { status?: number; code?: string }, _req, reply) => {
    void reply.code(err.status ?? 500).send({ code: err.code ?? "ERROR", message: err.message });
  });

  registerKnowledge(app);
  registerDatasets(app);
  return { app, mockCtx, busEmit };
}

describe("knowledge & datasets routes", () => {
  it("拒绝跨工作区访问知识库 chunks / delete / retry", async () => {
    const listKnowledgeChunks = vi.fn(async () => []);
    const removeKnowledgeSource = vi.fn(async () => undefined);
    const { app } = buildTestApp({
      getKnowledgeBase: vi.fn(async () => null),
      listKnowledgeChunks,
      removeKnowledgeSource,
    });

    const resChunks = await app.inject({
      method: "GET",
      url: "/api/v1/knowledge-bases/kb_foreign/sources/src_1/chunks",
    });
    expect(resChunks.statusCode).toBe(404);
    expect(listKnowledgeChunks).not.toHaveBeenCalled();

    const resDel = await app.inject({
      method: "DELETE",
      url: "/api/v1/knowledge-bases/kb_foreign/sources/src_1",
    });
    expect(resDel.statusCode).toBe(404);
    expect(removeKnowledgeSource).not.toHaveBeenCalled();

    const resRetry = await app.inject({
      method: "POST",
      url: "/api/v1/knowledge-bases/kb_foreign/sources/src_1/retry",
    });
    expect(resRetry.statusCode).toBe(404);
  });

  it("重试知识库来源时附带 objectKey 与元数据触发后台重索引", async () => {
    const { app, busEmit } = buildTestApp({
      getKnowledgeBase: vi.fn(async () => ({ id: "kb_1", workspaceId: "ws_1", name: "KB" })),
      retryKnowledgeSource: vi.fn(async () => ({
        id: "src_1",
        kbId: "kb_1",
        sourceType: "upload",
        assetId: null,
        url: null,
        objectKey: "kb/ws_1/kb_1/doc.pdf",
        title: "doc.pdf",
        contentHash: "hash123",
        retryCount: 1,
      })),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/knowledge-bases/kb_1/sources/src_1/retry",
    });
    expect(res.statusCode).toBe(200);
    expect(busEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "knowledge.source.added",
        tenantId: "ws_1",
        data: expect.objectContaining({
          kbId: "kb_1",
          sourceId: "src_1",
          objectKey: "kb/ws_1/kb_1/doc.pdf",
          fileName: "doc.pdf",
          contentHash: "hash123",
        }),
      }),
    );
  });

  it("支持数据集视图与图表的删除及工作区归属校验", async () => {
    const deleteSavedView = vi.fn(async () => undefined);
    const deleteChartSpec = vi.fn(async () => undefined);
    const { app } = buildTestApp({
      getDataset: vi.fn(async (_ws: string, id: string) =>
        id === "ds_1" ? { id: "ds_1", workspaceId: "ws_1", name: "Test DS" } : null,
      ),
      deleteSavedView,
      deleteChartSpec,
    });

    const foreignView = await app.inject({
      method: "DELETE",
      url: "/api/v1/datasets/ds_foreign/views/vw_1",
    });
    expect(foreignView.statusCode).toBe(404);
    expect(deleteSavedView).not.toHaveBeenCalled();

    const okView = await app.inject({
      method: "DELETE",
      url: "/api/v1/datasets/ds_1/views/vw_1",
    });
    expect(okView.statusCode).toBe(204);
    expect(deleteSavedView).toHaveBeenCalledWith("ws_1", "ds_1", "vw_1");

    const okChart = await app.inject({
      method: "DELETE",
      url: "/api/v1/datasets/ds_1/charts/cht_1",
    });
    expect(okChart.statusCode).toBe(204);
    expect(deleteChartSpec).toHaveBeenCalledWith("ws_1", "ds_1", "cht_1");
  });
});
