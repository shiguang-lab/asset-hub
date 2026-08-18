import { describe, expect, it } from "vitest";
import { normalizeOutline } from "./presentation-new.js";

describe("normalizeOutline", () => {
  it("fills missing section arrays instead of exposing undefined to the editor", () => {
    const outline = normalizeOutline({
      title: "测试演示",
      sections: [{ id: "s1", title: "第一章" }],
    });

    expect(outline).toMatchObject({
      title: "测试演示",
      sections: [{ id: "s1", title: "第一章", summary: "", points: [], data: [] }],
    });
  });

  it("converts the legacy slides response into editable sections", () => {
    const outline = normalizeOutline({
      title: "旧版演示",
      slides: [
        {
          id: "slide-1",
          title: "市场结论",
          blocks: [{ type: "bullet", content: "规模扩大\n增速放缓" }],
        },
      ],
    });

    expect(outline?.sections).toEqual([
      {
        id: "slide-1",
        title: "市场结论",
        summary: "规模扩大",
        points: ["规模扩大", "增速放缓"],
        data: [],
        visual: "default",
      },
    ]);
  });

  it("returns null for an empty response", () => {
    expect(normalizeOutline({ title: "空" })).toBeNull();
  });
});
