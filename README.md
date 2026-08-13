# Shiguang Asset Hub

AI 原生知识与数字资产工作空间（Asset First · AI Everywhere · Agent When Needed）。
仓库采用 pnpm/Turborepo 与 Go Workspace 组成的 monorepo，按 PRD V1.0 / 72 张 UI 交互图 /
技术架构文档实现，覆盖 P0 全流程，可直接本地交付运行。

- [总体技术架构](./docs/architecture/technical-architecture.md)
- [基础设施选型](./docs/architecture/infrastructure-selection.md)
- [数据架构](./docs/architecture/data-architecture.md)
- [安全与权限](./docs/architecture/security-and-permissions.md)
- [部署与可靠性](./docs/architecture/deployment-and-reliability.md)
- [API、任务与事件契约](./docs/architecture/contracts-and-events.md)
- [PRD 与架构追踪矩阵](./docs/architecture/requirements-traceability.md)
- [Superagents 复用评估](./docs/architecture/superagents-reuse-assessment.md)
- [实施路线图](./docs/architecture/implementation-roadmap.md)
- [交付说明与验证记录](./docs/architecture/delivery-notes.md)

## Applications

- [`web`](./docs/apps/web.md)
- [`api`](./docs/apps/api.md)
- [`worker`](./docs/apps/worker.md)
- [`compute-worker`](./docs/apps/compute-worker.md)
- [`public-gateway`](./docs/apps/public-gateway.md)

首期固定为 5 个可部署应用。MCP 作为 `api` 模块，任务编排与 Agent Runtime 位于
`worker`，内容处理与 Dataset Engine 位于 `compute-worker`；后续只按可测量的容量、SLO
或安全边界拆分。

## Requirements

- Node.js 22+
- pnpm 10+
- Go 1.24+

## Quick start

```bash
pnpm install
./scripts/dev-all.sh        # 或 pnpm dev：同时启动 web/api/worker/compute-worker/public-gateway
```

完整校验：

```bash
pnpm check
```

端到端冒烟（需先启动全部服务）：

```bash
./scripts/e2e-smoke.sh
```

## 应用与端口

| 应用 | 端口 | 职责 |
| --- | --- | --- |
| `apps/web` | 3000 | React 19 + Vite SPA：全部 P0 页面、CodeMirror 编辑器、IndexedDB 草稿、SSE 实时更新 |
| `apps/api` | 3001 | Fastify 模块化单体：资产/文档/知识库/调研/任务/数据集/演示/模板/发布/通知/Credits/集成/MCP |
| `apps/worker` | 轮询 3001 | Node 持久执行：Research、知识索引、演示生成、数据集导入，Outbox 消费 + 结果投影 |
| `apps/compute-worker` | 3002 | Go：内容解析/分块 + Dataset 导入/画像/查询引擎（结构化 AST，确定性执行） |
| `apps/public-gateway` | 3004 | Go：公开 URL/短链/密码/缓存头/访问事件，独立可信边界 |

## 已实现能力（对照 PRD P0）

- 资产中心：类型筛选、搜索、标签、批量操作、回收站 30 天、版本历史与恢复、关系视图；
- Markdown/HTML 文档：Edit/Split/Preview、自动保存（断网 IndexedDB 草稿）、AI 选区处理（先预览后应用）、版本化发布；
- 知识库：来源（资产/上传/URL）→ 解析 → 分块 → FTS 索引 → 搜索 → Ask + Citation 定位；
- Research/Agent：AI 推荐范围 → 后台任务（关闭页面不中断）→ 步骤进度 → Report + Sources + Dataset → Evidence；
- Dataset：CSV/JSON 上传导入、Schema 推断、质量报告、列画像、筛选/排序/分组/聚合查询、保存视图、ECharts、AI 洞察；
- 在线演示：文档/报告 → AI 大纲 → 结构化编辑（主题/布局/单页重写）→ 播放 → 发布；
- 模板中心：Research/Presentation 模板、使用计数；
- 发布：Public/Unlisted/Password、有效期、短链、二维码、访问统计、撤销；
- Credits：账户/账本（grant/reserve/settle/release）、任务预估、额度不足拦截、套餐；
- 通知：任务完成/失败/部分完成、知识库索引、已读管理、Header 未读数；
- 设置：个人偏好、MCP（默认关闭、Scope、Read Only 默认、写权限二次确认、Claude/Cursor/ChatGPT 连接向导）、API Token（Secret 仅显示一次、可撤销）、审计日志；
- MCP：Streamable HTTP（`/mcp`），7 个工具（search/read/knowledge + create/update/task/publish），复用应用服务与授权；
- 平台机制：Outbox/Inbox 幂等、Idempotency-Key、If-Match 乐观锁、SSE 失效提示、Problem Details 错误、审计、本地模型回退（未配置 model-gateway 时全流程仍可运行）。

## 本地运行说明

- 默认使用 `node:sqlite`（Node 22.21+）与本地内容寻址对象存储，零外部依赖即可跑通全流程；
- 认证：开发模式 `DEV_AUTH=true` 时 Web 端自动携带 `X-SG-Identity`，生产接入 access-gateway/auth-service；
- AI：未配置 `MODEL_GATEWAY_URL` 时使用内置确定性本地模型（Scope/报告/Ask/大纲等），保证离线可用；配置后走平台 model-gateway 并支持回退；
- 环境变量见 [.env.example](./.env.example)。

`design/` 保存立项、需求与 UI 原始资料，应用代码位于 `apps/`，共享代码位于 `packages/`。
