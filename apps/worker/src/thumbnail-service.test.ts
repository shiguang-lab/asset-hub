import { describe, expect, it } from "vitest";
import { extractHtmlForCover } from "./thumbnail-service.js";

describe("extractHtmlForCover", () => {
  it("prefers inline HTML text content", () => {
    expect(extractHtmlForCover({ kind: "html", text: "<h1>Hello</h1>", manifest: null })).toBe(
      "<h1>Hello</h1>",
    );
  });

  it("falls back to manifest.html for legacy presentation manifests", () => {
    expect(
      extractHtmlForCover({
        kind: "manifest",
        text: null,
        manifest: { html: "<section>Slide 1</section>" },
      }),
    ).toBe("<section>Slide 1</section>");
  });

  it("returns null when content is empty", () => {
    expect(extractHtmlForCover(null)).toBeNull();
    expect(extractHtmlForCover({ kind: "html", text: "   ", manifest: null })).toBeNull();
  });
});
