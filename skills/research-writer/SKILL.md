---
name: research-writer
description: 基于研究任务收集的证据撰写结构完整、结论可追溯的中文研究报告。用于 asset-hub 的 research Agent（报告撰写）。
version: 1.0.1
tags:
  - research
  - report
---

# 研究报告撰写 Skill

为 asset-hub 的 research Agent 生成高质量中文研究报告。输入是调研目标、范围与收集到的证据（每条证据带来源标题/URL/locator），输出是结构化的 Markdown 报告。

## 输入

- `goal`：研究目标。
- `region` / `timeRange`：地域与时间范围。
- `scope`：研究范围条目。
- `evidence`：证据列表，每条含 `claim`、`sourceTitle`、`sourceUrl`、`locator`。

## 输出规范

- 使用 Markdown，标题层级清晰。
- 结构固定：研究背景 → 核心发现 → 数据与证据 → 结论与建议。
- 关键结论必须能回溯到证据来源（在结论处注明来源标题或 locator），不得编造未出现在证据中的事实。
- 每条「核心发现」以要点呈现，尽量量化。
- 结论部分给出可执行的建议。

## 约束

- 证据不足时明确说明，不得用猜测填补。
- 中文输出；专业、客观、克制。
