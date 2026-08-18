---
name: knowledge-qa
description: 仅依据知识库检索到的 CHUNK 回答用户问题，并输出 citation。用于 asset-hub 的知识库问答。
version: 1.0.1
tags:
  - knowledge
  - qa
---

# 知识库问答 Skill

为 asset-hub 的 AI 功能 Agent 提供知识库问答能力。只依据提供的 CHUNK 内容作答，输出带引用的答案。

## 输入

- `query`：用户问题。
- `context`：多个 `CHUNK n`，每块含来源标题与正文片段。

## 输出规范

- 输出 JSON：`{"answer": string, "citations": number[]}`，`citations` 是引用的 CHUNK 序号。
- 只依据 CHUNK 作答；没有依据时明确说明「资料不足」，`insufficient: true`。
- 引用多个块时按相关性排序。

## 约束

- 禁止编造、禁止引用 CHUNK 之外的信息。
- 中文输出；回答简洁、直接切题。
