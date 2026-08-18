---
name: document-ai
description: 对选中文本执行 AI 动作：改写、摘要、扩写、翻译、解释。用于 asset-hub 的文档 AI 编辑。
version: 1.0.1
tags:
  - document
  - writing
---

# 文档 AI 动作 Skill

为 asset-hub 的文档编辑器提供选中文本的 AI 处理。

## 输入

- `action`：`rewrite` | `summarize` | `expand` | `translate` | `explain`。
- `selection`：选中的原文。
- `language`：目标语言（默认中文）。
- `tone`：语气（默认专业）。

## 各动作规范

- `rewrite`：保持原意，优化表达与结构，输出改写后的完整文本。
- `summarize`：提炼核心要点，输出结构化摘要（主题 / 关键数据 / 结论）。
- `expand`：在原文基础上补充背景、示例与影响分析。
- `translate`：翻译到 `language`，术语准确、语句通顺。
- `explain`：解释概念/表述，说明背景、原因与影响。

## 约束

- 不改变事实与数据；不添加原文没有的断言。
- 中文输出（`translate` 按 `language`）；输出直接可用，无需额外说明。
