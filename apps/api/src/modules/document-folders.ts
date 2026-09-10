import { assetPathSchema } from "@shiguang/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest } from "../platform/errors.js";
import type { AppContext } from "../types.js";

const folderPathSchema = assetPathSchema.refine((path) => path.length > 0, "目录路径不能为空");

export function registerDocumentFolders(app: FastifyInstance): void {
  const ctx: AppContext = app.ctx;

  app.get("/api/v1/document-folders", async (req) => ({
    items: await ctx.store.listDocumentFolders(req.actor.workspaceId),
  }));

  app.post("/api/v1/document-folders", async (req, reply) => {
    const { path } = z.object({ path: folderPathSchema }).parse(req.body);
    const folder = await ctx.store.createDocumentFolder(req.actor, path);
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "document_folder.create",
      path,
      "success",
      {},
    );
    return reply.code(201).send(folder);
  });

  app.patch("/api/v1/document-folders", async (req) => {
    const { from, to } = z
      .object({ from: folderPathSchema, to: folderPathSchema })
      .refine((value) => value.from !== value.to, "新目录名不能与原目录相同")
      .refine((value) => !value.to.startsWith(`${value.from}/`), "目录不能移动到自身内部")
      .parse(req.body);
    await ctx.store.renameDocumentFolder(req.actor.workspaceId, from, to);
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "document_folder.rename",
      from,
      "success",
      { to },
    );
    return { path: to };
  });

  app.delete("/api/v1/document-folders", async (req, reply) => {
    const parsed = z.object({ path: z.string() }).parse(req.query);
    const path = folderPathSchema.safeParse(parsed.path);
    if (!path.success) throw badRequest("DOCUMENT_FOLDER_PATH_INVALID", "目录路径不合法");
    await ctx.store.deleteDocumentFolder(req.actor.workspaceId, path.data);
    await ctx.store.audit(
      req.actor.workspaceId,
      req.actor.subject,
      "document_folder.delete",
      path.data,
      "success",
      {},
    );
    return reply.code(204).send();
  });
}
