# Superagents 与平台基础服务复用评估

## 1. 结论摘要

`asset-hub` 不应复制 `superagents` 的应用数量和研发 Agent 领域模型。可复用的是平台服务、工程模式和可靠性机制；不可复用的是与代码 Workspace、A2A 注册、Skill 分发、私网 Connector 强绑定的服务。

## 2. 可直接复用的平台服务

| 服务 | 结论 | 接入方式 | 说明 |
| --- | --- | --- | --- |
| `access-gateway` | 直接复用 | 新增 host/path policy | 已负责 TLS、forward-auth、header 清理；增加 Asset Hub 和 user-content 域名 |
| `auth-service` | 直接复用 | 校验 `X-SG-Identity` | 产品只做资源级授权，不接触共享 Cookie/ZITADEL token |
| `model-gateway` | 直接复用 | 独立 `asset-hub` scope/client | Provider secret 和协议路由不进入本仓库；绑定 quality/task policy |
| PostgreSQL 集群 | 可共享集群 | 独立 database/user | 备份与监控可复用，不允许跨产品表 join |
| NATS 集群 | 可共享 | 独立 account/credentials/subject prefix | 避免 subject 和 consumer 冲突 |
| Hatchet 集群 | 谨慎共享 | 独立 tenant/namespace/worker labels | 如果隔离能力或容量不足，部署独立 engine |
| SeaweedFS 集群 | 可共享 | 独立 bucket/prefix/credential | 必须验证配额、生命周期和备份 |
| Umami | 直接复用 | 新 siteId | 仅做访问/产品分析，不做 Credits 或审计事实 |

## 3. 可复用的设计模式

### 3.1 Result Projection Boundary

复用 `superagents` 的“计算完成与业务可见是两件事”：Agent/Worker 只产出带 schema version 的 result reference；`api` projector 在一个事务中完成 Inbox、业务表、Outbox。这样可防止 Worker 重试造成重复 Asset 或 Credits 结算。

### 3.2 Outbox / Inbox

- 用户命令：业务表与 Outbox 同事务。
- 事件消费：Inbox 去重与业务更新同事务。
- `eventId`、`aggregateId`、`aggregateVersion` 是强制字段。
- NATS Ack 必须晚于数据库提交。

### 3.3 Background Worker 边界

复用“HTTP 应用不跑 cron/poll loop”的约束。定时发布、垃圾清理、连接同步、通知重试全部由 `worker` 执行。

### 3.4 大对象引用

复用内容寻址思想：事件与任务结果携带 `contentHash`、`objectKey`、`mediaType`、`size`，不携带大文本或二进制。

### 3.5 统一事件信封

沿用版本化 envelope，但字段调整为 Asset Hub 语义，详见 [contracts-and-events.md](./contracts-and-events.md)。

## 4. 不复用的部分

| Superagents 能力 | 结论 | 原因 |
| --- | --- | --- |
| Gateway Agent Registration/A2A | 不复用 MVP | 本项目 Agent 是内部能力，不需要运行时注册与路由市场 |
| Orchestrator 服务 | 不复制 | Research 计划器属于 `worker/agents`，固定业务流程归 Hatchet |
| Workflow 自研状态机 | 不复制 | 新项目直接使用 Hatchet，避免两套持久状态 |
| Context 服务 | 不复制 | Session/turn/checkpoint 纳入 Agent/Task 领域表与对象存储 |
| Workspace + SeaweedFS FUSE | 不复制 | Asset Hub 不执行代码仓库任务，不需要 Git workspace 挂载 |
| Skill Gateway/Materializer | P2 再评估 | Expert Skill marketplace 不属于 MVP |
| Connector Gateway/Edge Connector | P1 按需 | Git/企业私网数据源出现后再复用，不提前引入 |
| Blobs 服务 | 不直接复用代码 | Asset Hub 需要 multipart、版本、发布物和生命周期，使用独立 S3 adapter |
| TypeORM entity 集合 | 不复制 | 领域不同；采用 SQL migration + Kysely，显式控制 pgvector/partition |
| NestJS 全家桶 | 不复制 | 当前 API 采用 Fastify plugin 模块化，减少框架层和启动成本 |

## 5. 同级基础服务评估

### 5.1 auth-service

适配度高。其 opaque parent-domain session、Redis server-side session、短时 RS256 assertion 和 audience 限制符合本项目。Asset Hub 需新增产品 audience/entitlement，内部再映射 `subject + org_id` 到个人/团队 workspace。

### 5.2 access-gateway

适配度高。需要新增：

- `app.shiguanglab.com` → `web`/`api`，受 forward-auth 保护；
- `mcp.shiguanglab.com` → `api` 的独立 MCP 路由组，Bearer token，不转浏览器 Cookie；
- `*.assets.shiguangusercontent.com` → `public-gateway`，永不转主域 Cookie；
- 上传大小、SSE timeout、静态缓存、bot/rate limit 策略。

### 5.3 model-gateway

适配度高。新增 `asset-hub` scope，并定义：

- `ai-function.economy/balanced/best`；
- `research.planner`、`research.extractor`、`research.writer`、`research.verifier`；
- `knowledge.answer`、`knowledge.rerank`；
- `presentation.outline`、`presentation.slide`。

Agent 每次运行 resolve 短时 route token，不持久化 Provider key。

### 5.4 free-llm

仅允许个人开发环境显式启用，生产禁用。其网页自动化依赖 Cookie/Cloudflare，v1 不支持 tools、结构化输出、多模态和完整多轮上下文，无法满足 Agent 的可恢复性、Evidence 和成本审计要求。

## 6. 复用实施清单

1. 为 Asset Hub 建立独立的服务凭据、数据库用户、NATS account/subject prefix、S3 credential。
2. 不复制任何平台 secret 到 monorepo `.env.example`；只保留变量名。
3. 复用协议需复制为独立 versioned package 或 OpenAPI，不以相对路径 import 另一个仓库源码。
4. 平台服务不可用时定义 fail-closed/fail-degraded 行为：Auth fail closed；Model Gateway 只影响 AI；NATS 延迟不阻塞基础文档编辑。
5. 平台共享实例必须按 product 记录容量、配额、SLO 和升级窗口。
