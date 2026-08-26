import { describe, expect, it } from "vitest";
import {
  buildReleaseBundle,
  injectPublishAccessPolicy,
  injectPublishDownloadActions,
} from "./render.js";

describe("buildReleaseBundle", () => {
  it("stores Markdown for SSR without generating a static HTML entry", () => {
    const bundle = buildReleaseBundle({
      assetType: "document",
      title: "示例文档",
      markdown: "# 标题\n\n正文",
    });

    expect(bundle.manifest.entrypoint).toBe("index.md");
    expect(bundle.files).toEqual([
      { path: "index.md", content: "# 标题\n\n正文", mediaType: "text/markdown" },
    ]);
  });

  it("keeps presentation source out of the release bundle for request-time SSR", () => {
    const bundle = buildReleaseBundle({
      assetType: "presentation",
      title: "产品演示",
      html: '<section data-sg-page="content" data-sg-id="p1"><h2>场景</h2><img data-sg-kind="image" src="asset:img_12345678" alt="产品" /></section>',
      resolveAssetLink: ({ assetId }) => `/published/${assetId}.png`,
    });
    expect(bundle.manifest.entrypoint).toBe("presentation-source");
    expect(bundle.files).toEqual([]);
  });
});

describe("injectPublishDownloadActions", () => {
  it("adds escaped download links before the closing body", () => {
    const html = injectPublishDownloadActions("<html><body>正文</body></html>", [
      { label: "下载附件：A&B", href: "/p/demo/attachments/a?x=1&y=2" },
    ]);
    expect(html).toContain("下载附件：A&amp;B");
    expect(html).toContain("/p/demo/attachments/a?x=1&amp;y=2");
    expect(html.indexOf("sg-publish-downloads")).toBeLessThan(html.indexOf("</body>"));
  });

  it("does not modify releases without download actions", () => {
    expect(injectPublishDownloadActions("<body>正文</body>", [])).toBe("<body>正文</body>");
  });

  it("keeps presentation download links hidden for the embedded player", () => {
    const html = injectPublishDownloadActions("<html><body>演示</body></html>", [
      { label: "下载演示", href: "/s/demo/download" },
    ], { presentation: true });
    expect(html).toContain('data-sg-player-downloads hidden');
    expect(html).toContain('class="sg-publish-download"');
    expect(html).not.toContain("position:fixed; right:20px; top:20px");
  });
});

describe("injectPublishAccessPolicy", () => {
  it("marks non-public releases as noindex and blocks ordinary copy operations", () => {
    const html = injectPublishAccessPolicy("<html><head></head><body>正文</body></html>", {
      visibility: "password",
      allowCopy: false,
    });
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).toContain('document.addEventListener("copy"');
    expect(html.indexOf("user-select:none")).toBeLessThan(html.indexOf("</body>"));
  });

  it("allows indexing and leaves copy behavior unchanged for public releases", () => {
    const html = injectPublishAccessPolicy("<html><head></head><body>正文</body></html>", {
      visibility: "public",
      allowCopy: true,
    });
    expect(html).toContain('name="robots" content="index,follow"');
    expect(html).not.toContain("document.addEventListener");
  });
});
