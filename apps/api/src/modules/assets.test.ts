import type { ActorContext, Asset } from "@shiguang/contracts";
import type { Store } from "@shiguang/database";
import { describe, expect, it } from "vitest";
import { DomainError } from "../platform/errors.js";
import type { AppContext } from "../types.js";
import {
  authorizeBatchAssetIds,
  collectImportFolders,
  downloadableAssetContent,
  extractAndUploadResources,
  importPathToAssetPath,
  parseImportedDocumentFile,
  parseImportPathPrefix,
  resolveImportReference,
  uniqueImportAssetPath,
  withImportPrefix,
} from "./assets.js";

describe("parseImportedDocumentFile", () => {
  it("imports Markdown as normalized editable content", () => {
    expect(parseImportedDocumentFile("产品方案.md", Buffer.from("\uFEFF# 标题\r\n正文"))).toEqual({
      title: "产品方案",
      markdown: "# 标题\n正文",
    });
  });

  it("imports plain text as a Markdown document", () => {
    expect(parseImportedDocumentFile("会议记录.txt", Buffer.from("第一项\n第二项"))).toEqual({
      title: "会议记录",
      markdown: "第一项\n第二项",
    });
  });

  it("imports HTML files as normalized editable content", () => {
    expect(parseImportedDocumentFile("交互看板.html", Buffer.from("<h1>Hi</h1>\r\n"))).toEqual({
      title: "交互看板",
      markdown: "<h1>Hi</h1>\n",
    });
  });

  it("rejects unsupported binary formats and parses valid formats", () => {
    expect(() => parseImportedDocumentFile("程序.exe", Buffer.from("MZ..."))).toThrowError(
      DomainError,
    );
    try {
      parseImportedDocumentFile("数据.bin", Buffer.from("content"));
    } catch (error) {
      expect(error).toMatchObject({ code: "DOCUMENT_FORMAT_UNSUPPORTED", status: 400 });
    }
  });

  it("extracts text from valid PDF document", () => {
    const fakePdf = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Length 40 >>\nstream\nBT\n/F1 12 Tf\n(Hello PDF World) Tj\nET\nendstream\nendobj\n%%EOF",
      "utf8",
    );
    const parsed = parseImportedDocumentFile("test-doc.pdf", fakePdf);
    expect(parsed.title).toBe("test-doc");
    expect(parsed.markdown).toContain("Hello PDF World");
  });
});

describe("downloadableAssetContent", () => {
  it("exports documents as named Markdown files", () => {
    const result = downloadableAssetContent(
      { type: "document", title: "产品方案" },
      { kind: "markdown", text: "# 标题", manifest: null, refs: [] },
    );
    expect(result).toMatchObject({
      fileName: "产品方案.md",
      mediaType: "text/markdown; charset=utf-8",
    });
    expect(result?.data.toString("utf8")).toBe("# 标题");
  });

  it("exports presentation manifests as JSON", () => {
    const result = downloadableAssetContent(
      { type: "presentation", title: "季度演示" },
      { kind: "manifest", text: null, manifest: { slides: [] }, refs: [] },
    );
    expect(result).toMatchObject({
      fileName: "季度演示.json",
      mediaType: "application/json; charset=utf-8",
    });
    expect(JSON.parse(result?.data.toString("utf8") ?? "{}")).toEqual({ slides: [] });
  });
});

describe("extractAndUploadResources", () => {
  it("uploads local images and rewrites them to asset: references", async () => {
    const markdown = `# 方案\n\n![封面](./assets/img.png)\n\n![外部](https://cdn.example/x.png)\n`;
    const resources = new Map([["assets/img.png", Buffer.from("png-bytes")]]);
    const uploaded: Array<{ name: string; data: string }> = [];
    const { markdown: out, uploaded: count } = await extractAndUploadResources(
      markdown,
      resources,
      async (name, data) => {
        uploaded.push({ name, data: data.toString("utf8") });
        return { id: "ast_000000000000000000000001" };
      },
    );
    expect(count).toBe(1);
    expect(uploaded).toEqual([{ name: "./assets/img.png", data: "png-bytes" }]);
    expect(out).toBe(
      `# 方案\n\n![封面](asset:ast_000000000000000000000001)\n\n![外部](https://cdn.example/x.png)\n`,
    );
  });

  it("skips references to text documents and missing files", async () => {
    const markdown = `[子文档](docs/child.md) ![图](missing.png) ![ok](a.pdf)`;
    const resources = new Map([
      ["docs/child.md", Buffer.from("# child")],
      ["a.pdf", Buffer.from("pdf")],
    ]);
    const uploaded: string[] = [];
    const { markdown: out, uploaded: count } = await extractAndUploadResources(
      markdown,
      resources,
      async (name) => {
        uploaded.push(name);
        return { id: "ast_000000000000000000000002" };
      },
    );
    expect(count).toBe(1);
    expect(uploaded).toEqual(["a.pdf"]);
    expect(out).toBe(
      `[子文档](docs/child.md) ![图](missing.png) ![ok](asset:ast_000000000000000000000002)`,
    );
  });

  it("returns the markdown unchanged when no resources are provided", async () => {
    const markdown = "![图](./x.png)";
    const { markdown: out, uploaded } = await extractAndUploadResources(
      markdown,
      undefined,
      async () => ({ id: "ast_000000000000000000000003" }),
    );
    expect(uploaded).toBe(0);
    expect(out).toBe(markdown);
  });
});

describe("folder import paths", () => {
  it("resolves links relative to the importing document", () => {
    expect(resolveImportReference("guides/setup/intro.md", "../images/logo.png")).toBe(
      "guides/images/logo.png",
    );
    expect(resolveImportReference("guides/setup/intro.md", "../api.md#auth")).toBe("guides/api.md");
  });

  it("collects parent directories without duplicating paths", () => {
    expect(collectImportFolders(["README.md", "guides/setup.md", "guides/api/auth.md"])).toEqual([
      "guides",
      "guides/api",
    ]);
  });
});

describe("importPathToAssetPath", () => {
  it("strips the extension because it is derived from the asset type", () => {
    expect(importPathToAssetPath("guides/api/auth.md")).toBe("guides/api/auth");
    expect(importPathToAssetPath("README.md")).toBe("README");
  });

  it("keeps dots that are part of the file name", () => {
    expect(importPathToAssetPath("specs/v1.2.3-draft.md")).toBe("specs/v1.2.3-draft");
  });

  it("leaves extensionless paths untouched", () => {
    expect(importPathToAssetPath("guides/LICENSE")).toBe("guides/LICENSE");
  });

  it("normalises decomposed unicode so macOS imports do not fork folders", () => {
    expect(importPathToAssetPath("café/naïve.md".normalize("NFD"))).toBe(
      "café/naïve".normalize("NFC"),
    );
  });
});

describe("parseImportPathPrefix", () => {
  it("accepts a folder path and normalises it", () => {
    expect(parseImportPathPrefix({ pathPrefix: "产品/需求文档" })).toBe("产品/需求文档");
  });

  it("rejects shapes the asset path contract forbids", () => {
    expect(parseImportPathPrefix({ pathPrefix: "/产品/" })).toBe("");
    expect(parseImportPathPrefix({ pathPrefix: "产品/../研究" })).toBe("");
    expect(parseImportPathPrefix({ pathPrefix: "产品//需求" })).toBe("");
  });

  it("falls back to the root for missing or non-string values", () => {
    expect(parseImportPathPrefix({})).toBe("");
    expect(parseImportPathPrefix({ pathPrefix: "" })).toBe("");
    expect(parseImportPathPrefix({ pathPrefix: ["产品"] })).toBe("");
    expect(parseImportPathPrefix(undefined)).toBe("");
  });
});

describe("withImportPrefix", () => {
  it("nests the imported tree under the target folder", () => {
    expect(withImportPrefix("产品", "guides/setup.md")).toBe("产品/guides/setup.md");
  });

  it("leaves the path alone at the root", () => {
    expect(withImportPrefix("", "guides/setup.md")).toBe("guides/setup.md");
  });
});

describe("uniqueImportAssetPath", () => {
  it("appends suffix to root paths using the renamed title", () => {
    expect(uniqueImportAssetPath("USAGE", "USAGE (1)", new Set(["USAGE"]))).toBe("USAGE (1)");
  });

  it("keeps parent folder prefix when deduplicating nested paths", () => {
    expect(uniqueImportAssetPath("guides/USAGE", "USAGE (1)", new Set(["guides/USAGE"]))).toBe(
      "guides/USAGE (1)",
    );
  });

  it("skips candidate paths already occupied even if titles differed", () => {
    expect(
      uniqueImportAssetPath(
        "guides/USAGE",
        "USAGE (1)",
        new Set(["guides/USAGE", "guides/USAGE (1)"]),
      ),
    ).toBe("guides/USAGE (2)");
  });
});

describe("authorizeBatchAssetIds", () => {
  const actor: ActorContext = {
    subject: "user-1",
    workspaceId: "ws_1",
    workspaceType: "team",
    workspaceRole: "editor",
    requestId: "req_test",
    isService: false,
    tokenScopes: ["read", "write"],
  };

  function makeAsset(id: string, ownerSubject = "user-1"): Asset {
    return {
      id,
      workspaceId: "ws_1",
      ownerSubject,
      type: "document",
      title: id,
      path: "",
      description: "",
      visibility: "private",
      status: "deleted",
      sourceType: "manual",
      currentVersionId: null,
      lockVersion: 1,
      deletedAt: "2026-11-20T00:00:00.000Z",
      publishedUrl: null,
      createdAt: "2026-11-20T00:00:00.000Z",
      updatedAt: "2026-11-20T00:00:00.000Z",
    };
  }

  function makeCtx(records: Record<string, Asset>): AppContext {
    return {
      store: {
        getAsset: async (_ws: string, id: string) => records[id] ?? null,
        listAcl: async () => [],
      } as unknown as Store,
    } as AppContext;
  }

  it("skips already-deleted missing ids for batch permanent delete", async () => {
    const ctx = makeCtx({ ast_alive: makeAsset("ast_alive") });
    await expect(
      authorizeBatchAssetIds(ctx, actor, ["ast_stale", "ast_alive"], "permanent"),
    ).resolves.toEqual(["ast_alive"]);
  });

  it("still throws notFound for missing ids on non-permanent batch actions", async () => {
    const ctx = makeCtx({ ast_alive: makeAsset("ast_alive") });
    await expect(
      authorizeBatchAssetIds(ctx, actor, ["ast_stale", "ast_alive"], "restore"),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", status: 404 });
  });

  it("rejects unauthorized existing assets during batch permanent delete", async () => {
    const ctx = makeCtx({ ast_other: makeAsset("ast_other", "other-user") });
    await expect(
      authorizeBatchAssetIds(ctx, actor, ["ast_stale", "ast_other"], "permanent"),
    ).rejects.toMatchObject({ status: 403 });
  });
});
