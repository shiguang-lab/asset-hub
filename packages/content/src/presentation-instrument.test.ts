import { describe, expect, it } from "vitest";
import { instrumentPresentationHtml } from "./presentation-instrument.js";

describe("instrumentPresentationHtml", () => {
  it("adds stable editable anchors without changing the authored layout", () => {
    const result = instrumentPresentationHtml(`<!doctype html><html><body>
      <section data-sg-page="content" aria-label="数据"><h1>结论</h1><div class="chart"><svg><path d="M0 0" /></svg></div><table><tr><th>版本</th></tr><tr><td>16</td></tr></table></section>
    </body></html>`);
    expect(result.changed).toBe(true);
    expect(result.html).toContain('data-sg-kind="text"');
    expect(result.html).toContain('data-sg-kind="chart"');
    expect(result.html).toContain('data-sg-kind="table"');
    expect(result.manifest.pages).toHaveLength(1);
    expect(result.manifest.elements.some((element) => element.kind === "chart")).toBe(true);
    expect(result.manifest.elements.some((element) => element.kind === "table")).toBe(true);
  });

  it("mirrors the SG page identity to a native id for page-scoped CSS", () => {
    const result = instrumentPresentationHtml(
      `<section data-sg-page="data-story" data-sg-id="page-4"><style>#page-4 .metric { display:grid }</style><div class="metric">内容</div></section>`,
    );
    expect(result.html).toContain('<section data-sg-page="data-story" data-sg-id="page-4" id="page-4"');
  });
});
