import { describe, expect, it } from "vitest";
import { injectPublishAccessPolicy, injectPublishDownloadActions } from "./render.js";

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
