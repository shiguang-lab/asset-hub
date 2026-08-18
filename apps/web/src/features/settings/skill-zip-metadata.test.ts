import { describe, expect, it } from "vitest";
import {
  buildSkillMarkdown,
  parseSkillFrontmatter,
  splitSkillMarkdown,
} from "./skill-zip-metadata.js";

describe("parseSkillFrontmatter", () => {
  it("reads name, description and inline tags from SKILL.md frontmatter", () => {
    const content = [
      "---",
      'name: "数据分析"',
      "description: 生成数据洞察与图表",
      "tags: [data, report]",
      "---",
      "# 正文",
    ].join("\n");
    expect(parseSkillFrontmatter(content)).toEqual({
      name: "数据分析",
      description: "生成数据洞察与图表",
      tags: ["data", "report"],
    });
  });

  it("reads block scalar description and list-form tags", () => {
    const content = [
      "---",
      "name: report",
      "description: |",
      "  第一行",
      "  第二行",
      "tags:",
      "  - data",
      "  - report",
      "---",
    ].join("\n");
    expect(parseSkillFrontmatter(content)).toEqual({
      name: "report",
      description: "第一行\n第二行",
      tags: ["data", "report"],
    });
  });

  it("returns null when there is no frontmatter", () => {
    expect(parseSkillFrontmatter("# 没有 frontmatter\n\n正文")).toBeNull();
  });
});

describe("buildSkillMarkdown / splitSkillMarkdown", () => {
  it("round-trips name/description/tags/body", () => {
    const markdown = buildSkillMarkdown(
      "数据分析",
      "生成洞察",
      ["data", "report"],
      "## 目标\n\n产出图表",
    );
    const { metadata, body } = splitSkillMarkdown(markdown);
    expect(metadata).toEqual({
      name: "数据分析",
      description: "生成洞察",
      tags: ["data", "report"],
    });
    expect(body.trim()).toBe("## 目标\n\n产出图表");
  });

  it("splits content without frontmatter to an empty metadata", () => {
    const { metadata, body } = splitSkillMarkdown("# 标题\n\n正文");
    expect(metadata).toBeNull();
    expect(body).toBe("# 标题\n\n正文");
  });
});
