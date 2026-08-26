# PRD 与架构追踪矩阵

## 1. 目的

本矩阵用于验证 PRD V1.0 和 UI 交互中的能力都有明确的应用、事实数据和异步流程归属。它不是开发排期，优先级仍以 PRD 与 [implementation-roadmap.md](./implementation-roadmap.md) 为准。

## 2. 功能追踪

| PRD 域 | 前端 | 控制面/事实库 | 执行/数据面 | 关键事实与产物 |
| --- | --- | --- | --- | --- |
| 首页/全局搜索/新建 | web | api | NATS SSE | recent activity、search projection、running tasks |
| Asset 中心 | web | api/assets | compute-worker、S3 | Asset、Version、Relation、Trash |
| Markdown 文档 | web/CodeMirror | api/documents | compute-worker、public-gateway | draft、version blob、render artifact |
| HTML Asset | web isolated preview | api/documents/publishing | compute-worker、public-gateway | source version、scan/CSP、release bundle |
| Knowledge Base | web | api/knowledge | worker、compute-worker | SourceVersion、Chunk、Embedding、Citation |
| Research | web | api/research/tasks/billing | worker | ResearchSpec、Evidence、Report/Source/Dataset Asset |
| 无人值守 Task | web | api/tasks | Hatchet、worker、NATS | Task/Step/Attempt、checkpoint refs、outputs |
| Dataset | web/table/chart | api/datasets | compute-worker content/data profiles | Parquet、schema/profile、ChartSpec |
| H5 Presentation | web structured editor | api/presentations | worker、compute-worker、public-gateway | outline、slide document、theme/layout、release |
| Template | web | api/templates | worker 按模板启动 | TemplateVersion、usage |
| Publish/Share/Short link | web | api/publishing | compute-worker、public-gateway | Publish、Release、Slug、Policy、Stats |
| Notification | web | api/notifications | worker、NATS | Notification、DeliveryReceipt、Preference |
| Points balance | web | read-only points adapter | external points service | balance snapshot only |
| MCP/API | web settings | api/integrations + `/mcp` | api 独立路由配额 | Token hash、Scope、Audit |
| Git/外部 Source P1 | web settings | api/integrations | worker；按需 Connector | Connection、SyncCursor、SourceVersion |

## 3. 状态模型追踪

| 状态 | 权威应用 | 引擎/派生状态 | UI 获取 |
| --- | --- | --- | --- |
| Asset Normal/Processing/Error/Archived/Deleted | api | worker events 只触发投影 | REST + SSE invalidate |
| KB Source Pending/Parsing/Indexing/Ready/Failed | api | Hatchet workflow/activity | REST + SSE |
| Task Created/Planning/Queued/Running/... | api 产品读模型 | Hatchet run 是执行状态 | REST + SSE；刷新可恢复 |
| Draft Saving/Saved/Failed | web + api draft version | IndexedDB local draft | 本地即时 + server ack |
| Publish Active/Expired/Revoked | api | public cache projection | public-gateway 每次按 policy version 判断 |
| Points balance | external points service | web balance adapter | read-only REST query |

## 4. 核心验收链路

### 4.1 非 AI 文档发布

`web → api Asset/Version → compute-worker render/scan → api PublishRelease → public-gateway`。Model Gateway 不在依赖链上，满足“AI 不可用仍能创建、编辑和发布”。

### 4.2 Knowledge Citation

`upload/S3 → compute-worker parse/chunk → embedding/index → api hybrid search → model answer → citation validator → web locator`。Citation 始终绑定精确 SourceVersion。

### 4.3 无人值守 Research

`api Task → Hatchet → worker/agents/tools → checkpoints/artifacts → api projector → Asset outputs → Notification/SSE`。浏览器仅观察，不持有任务执行状态；积分由外部系统负责。

### 4.4 Dataset Code First

`compute-worker content validate → data profile Parquet/profile → web query AST → api authorize → compute-worker deterministic query → ChartSpec/Report proposal`。统计结果不由模型直接生成。

### 4.5 Presentation 发布

`source AssetVersion → agent outline → user confirm → slide JSON → trusted renderer → immutable release bundle → public-gateway`。源文档更新只标记 stale，不静默覆盖演示。

## 5. UI 图与阶段冲突

UI 图中出现而 PRD 定为 P1/P2 或未明确的能力：团队评论、多人编辑、完整版本对比、Workflow 节点编辑、复杂访问分析、行业实体大盘。处理原则：

- 信息架构可以保留入口或只读占位；
- MVP 不为占位能力提前拆服务；
- 评论和版本历史可先支持异步协作，不等同于实时共编；
- Workflow UI 只用于模板参数/固定节点配置，不开放通用编排器；
- 行业大盘基于 Dataset/Chart 组合，不另建“Dashboard 微服务”。

## 6. 非功能追踪

| 要求 | 设计落点 | 验证 |
| --- | --- | --- |
| 浏览器关闭任务继续 | Hatchet + workers | 关闭 10 分钟、Worker 重启 E2E |
| Partial Success | item attempt + task projector | 93/100 成功后仅重试 7 项 |
| 私有数据隔离 | workspace/ACL/capability | IDOR、跨租户 search/MCP test |
| HTML 隔离 | user-content domain + sandbox/CSP | Cookie/DOM/Storage/network tests |
| Citation 不伪造 | structured locator + validator | citation validity eval |
| 成本可控 | reserve/usage/settle + model gateway | retry/fallback/upper-bound tests |
| 10 万行 Dataset | Parquet + DuckDB + virtual table | benchmark and resource limits |
| 稳定 URL | Publish → immutable Release pointer | release switch/rollback/CDN tests |
| 错误可恢复 | Problem Details + recovery actions | offline/conflict/failure UX E2E |
