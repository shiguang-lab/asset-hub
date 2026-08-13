# 基础设施与开源服务选型

## 1. 选型原则

1. MVP 可用单机 Docker Compose 启动，生产能横向扩展。
2. 优先复用已有 Shiguang 平台能力，但产品数据库和权限不跨库耦合。
3. 只在解决明确问题时增加常驻服务。
4. 应用依赖开放协议而不是厂商 SDK：S3、PostgreSQL、OTLP、OpenAPI、MCP。
5. 所有镜像和依赖必须固定版本或 digest，禁止生产使用 `latest`。

## 2. 最终选型

| 能力 | 选型 | 阶段 | 结论 |
| --- | --- | --- | --- |
| 业务数据库 | PostgreSQL 18（上线时锁定当前受支持小版本） | MVP | 独立 `asset_hub` database/schema，迁移先行 |
| Vector | pgvector | MVP | 知识分块向量、HNSW；与 FTS 做 RRF |
| 持久任务 | Hatchet + 独立 engine database | MVP | 复用 superagents 运维经验，但不共享业务表 |
| 事件总线 | NATS JetStream | MVP | 领域事件、通知、进度；应用层仍需幂等 |
| 对象存储 | SeaweedFS S3 API | MVP | 原始/派生文件、Parquet、发布包；代码只依赖 S3 |
| Dataset 查询 | DuckDB + Parquet | MVP | 嵌入 `compute-worker` data 模块，限定只读查询计划 |
| 缓存 | 进程内 LRU + CDN；Redis 仅平台 Auth | MVP | 不为了普通缓存新增 Redis 依赖 |
| 认证 | 现有 auth-service + ZITADEL | MVP | 直接接入统一登录 |
| 北向入口 | 现有 access-gateway/Caddy | MVP | TLS、forward-auth、header 清理、限流 |
| 模型路由 | 现有 model-gateway | MVP | Provider secret、质量档位、成本和协议路由 |
| 可观测 | OpenTelemetry Collector + Prometheus/Grafana/Loki/Tempo | MVP/P1 | 应用只发 OTLP，后端可替换 |
| 产品/访问分析 | Umami + 产品内聚合事件 | MVP | 公开访问基础分析；计费与审计不用 Umami |
| 专用全文检索 | OpenSearch | P1 条件触发 | 当 chunk > 100 万或 CJK/BM25 质量不足再引入 |
| 大规模分析 | ClickHouse | P1/P2 条件触发 | 访问/行为事件达到 PG 分区表瓶颈后引入 |

## 3. Hatchet 与 Temporal

### 3.1 选择 Hatchet

Hatchet 提供 PostgreSQL-backed durable task queue、DAG Workflow、重试、并发/速率限制、定时任务和可观测 UI，并有 TypeScript/Go SDK。当前平台已经部署并积累排障经验，对本项目的 Research、索引、导入、导出、通知和 GC 均匹配。

### 3.2 不选择 Temporal 的原因

Temporal 的持久执行能力更成熟，MIT 开源并能在崩溃后恢复 Workflow；但自托管生产组件和运维面更大。本项目已经有 Hatchet，当前 Workflow 主要是显式 DAG 和后台任务，无需为了理论上限新增第二套引擎。

触发重新评估 Temporal 的条件：

- Hatchet 无法稳定表达跨月等待、大量 Signal/Update 或复杂补偿；
- 核心工作流需要严格的代码级 replay 语义；
- Hatchet 的升级兼容性或高可用能力无法满足 SLO；
- 平台层统一迁移 Durable Execution 引擎。

官方资料：

- [Hatchet GitHub：Postgres-backed durable tasks and workflows](https://github.com/hatchet-dev/hatchet)
- [Temporal 官方文档](https://docs.temporal.io/)
- [Temporal server GitHub（MIT）](https://github.com/temporalio/temporal)

## 4. NATS JetStream 的职责

JetStream 的基础保证是 at-least-once；即使启用 message deduplication 和 double ack，消费者仍必须幂等。使用 durable pull consumer，事件 envelope 带 `eventId`，消费者事务写入 `event_inbox` 后再确认。

使用：

- `domain.asset.*`：资产/版本/发布事实；
- `domain.task.*`：进度、完成、失败、需人工处理；
- `domain.knowledge.*`：source ready/failed；
- `domain.notification.*`：站内/邮件投递任务；
- `realtime.user.<id>`：短保留期 UI invalidation。

不使用：

- 不把 NATS 当业务事实库；
- 不把长任务步骤只保存在消息里；
- 不发送文件、Prompt 全文或模型响应大对象；
- 不假设全局顺序，只在 aggregate key 上保证可推导顺序。

官方资料：[NATS JetStream](https://docs.nats.io/nats-concepts/jetstream)、[JetStream Consumers](https://docs.nats.io/nats-concepts/jetstream/consumers)。

## 5. PostgreSQL、pgvector 与搜索

MVP 采用一套 PostgreSQL 业务库：

- SQL 事务管理 Asset、权限、Credits 与 Outbox；
- `tsvector`/`pg_trgm` 做标题、标签和内容关键词召回；
- pgvector HNSW 做语义召回；
- API 用 Reciprocal Rank Fusion 合并，必要时由 reranker 重排；
- `workspace_id`/`owner_id` 先过滤，再检索，防止跨租户召回。

pgvector 官方支持 HNSW、IVFFlat、PostgreSQL FTS 混合检索与多租户分区；过滤会影响 ANN recall，因此每次发布需用固定评估集监控 recall。官方资料：[pgvector](https://github.com/pgvector/pgvector)。

下列阈值任一持续出现时评估 OpenSearch：

- 可检索 chunk 超过 100 万且 P95 > 500 ms；
- 中文/多语言 BM25、同义词、Highlight 质量无法满足验收；
- PostgreSQL vector index 常驻内存成本挤压 OLTP；
- 搜索索引需要独立扩容和故障隔离。

## 6. SeaweedFS 与 S3 抽象

选择 SeaweedFS 而不是继续使用 MinIO 社区版：

- SeaweedFS 为 Apache-2.0 独立开源项目，仍持续开发，提供 S3 API、对象/文件存储和横向扩展。
- MinIO 官方 GitHub 仓库已于 2026-04-25 归档，明确标记“不再维护”，社区版改为 source-only，生产风险不适合作为新项目默认依赖。
- `superagents` 已有 SeaweedFS 部署和运维经验，可复用监控、备份和容量规划。

应用必须只依赖标准 S3 client，禁止调用 SeaweedFS 私有 API；这样可替换为 AWS S3、R2 或其他兼容服务。

Bucket/前缀建议：

```text
asset-raw/{tenantId}/{assetId}/{versionId}/...
asset-derived/{tenantId}/{assetId}/{versionId}/...
datasets/{tenantId}/{datasetId}/{versionId}/data.parquet
publishes/{publishId}/{releaseId}/...
task-artifacts/{tenantId}/{taskId}/...
```

官方资料：[SeaweedFS GitHub](https://github.com/seaweedfs/seaweedfs)、[MinIO archived repository](https://github.com/minio/minio)。

## 7. DuckDB 与 Dataset

Dataset 的 10 万行浏览、过滤、聚合和 Chart 数据属于嵌入式 OLAP，不应动态创建 PostgreSQL 表。流程为：

1. `compute-worker` content 模块校验文件和编码；
2. `compute-worker` data 模块导入 CSV/JSON/XLSX，推断 schema；
3. 标准化为 Parquet 并生成统计摘要；
4. 交互请求编译成 allowlist query plan；
5. DuckDB 只读扫描 Parquet，返回分页/Arrow-compatible JSON。

禁止把前端 SQL 透传给 DuckDB。查询必须有行数、扫描字节、CPU 时间和并发限制。

## 8. 可观测性

所有 Node/Go 应用统一发 OTLP 到 OpenTelemetry Collector。Collector 负责批处理、重试、敏感字段过滤和导出，业务代码不直接绑定 Grafana/云厂商 SDK。

最低公共属性：`service.name`、`deployment.environment`、`trace_id`、`tenant_id_hash`、`actor_type`、`task_id`、`asset_id`、`workflow_run_id`。禁止记录 Prompt、Asset 全文、Cookie、API key。

官方资料：[OpenTelemetry](https://opentelemetry.io/docs/)、[Collector](https://opentelemetry.io/docs/collector/)。

## 9. 被否决方案

| 方案 | 不采用原因 |
| --- | --- |
| 每个业务菜单一个微服务 | 跨域事务密集、团队规模未知、运维成本高 |
| BullMQ + Redis 自建状态机 | Research/Agent 的恢复、DAG、审批、补偿复杂度过高 |
| 只用 NATS 执行工作流 | 消息持久化不等同于 Durable Workflow 状态 |
| MVP 直接 OpenSearch + ClickHouse | 两套新集群未解决当前量级的必要问题 |
| Dataset 全存 PostgreSQL JSONB | 动态列聚合和版本化成本高，OLTP 被分析查询干扰 |
| MinIO 社区版作为新默认 | 官方仓库已归档且停止维护 |
| `free-llm` 生产调用 | 基于网页自动化、Cookie、Cloudflare，缺少工具/结构化输出和稳定 SLA |
