---
name: dataset-insights
description: 基于数据集聚合统计生成洞察（要点式），用于 asset-hub 的数据集分析。
version: 1.0.1
tags:
  - dataset
  - analytics
---

# 数据集洞察 Skill

为 asset-hub 的数据集分析生成简洁、可读的洞察要点。

## 输入

- `stats`：数据集聚合统计（JSON，含行数、列、分布等）。

## 输出规范

- 输出 JSON：`{"insights": string[]}`，每条为一个洞察要点。
- 洞察需覆盖：整体规模、主要分布/趋势、头部集中度、值得关注的异常或风险。
- 每条 1-2 句话，面向业务读者。

## 约束

- 只基于 `stats` 中的事实，不臆造具体数字。
- 中文输出。
