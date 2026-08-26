import { describe, expect, it } from "vitest";
import {
  buildPresentationSystemPrompt,
  buildPresentationUserPrompt,
  SG_CAPABILITY_REGISTRY,
  SG_PROFILES,
} from "./presentation-skill.js";

describe("presentation skill", () => {
  it("system prompt embeds capability registry and authoring protocol", () => {
    const prompt = buildPresentationSystemPrompt();
    expect(prompt).toContain("data-sg-page");
    expect(prompt).toContain("SG.chart");
    expect(prompt).toContain("data-sg-id");
    expect(prompt).toContain("16:9");
    expect(prompt).toContain("1920×1080");
    expect(prompt).toContain("不要使用 vw");
  });

  it("user prompt carries goal and source", () => {
    const prompt = buildPresentationUserPrompt({
      goal: "越南市场",
      profile: "pitch",
      source: "行业数据",
    });
    expect(prompt).toContain("越南市场");
    expect(prompt).toContain("行业数据");
    expect(prompt).toContain("pitch");
  });

  it("exposes profiles", () => {
    expect(SG_PROFILES.research).toContain("reading-first");
    expect(SG_CAPABILITY_REGISTRY).toContain("data-sg-hover");
  });
});
