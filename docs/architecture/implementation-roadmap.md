# 分阶段实施路线图

## 1. 原则

PRD 的 P0 范围很宽，不能并行铺开所有页面后再补可靠性。按可独立闭环的纵向切片交付，每阶段都包含权限、事件、可观测、错误恢复和测试。

## 2. Phase 0：平台与骨架（1–2 周）

- 接入 access-gateway/auth-service/model-gateway；
- PostgreSQL migration、Kysely、tenant context；
- NATS、Hatchet、SeaweedFS 本地 Compose；
- OpenAPI/Protobuf/Event contract 生成；
- OTel、统一错误、Idempotency/Outbox/Inbox；
- 固化 5 应用骨架与 `worker`、`compute-worker` profile/queue 配置。

退出标准：受保护 API、S3 上传、Hatchet hello workflow、NATS outbox、Node/Go trace 跨服务可跑通。

## 3. Phase 1：Asset + Markdown/HTML + Publish（3–5 周）

- Asset/Version/Relation/Trash；
- Markdown CodeMirror、preview、IndexedDB draft、乐观锁；
- HTML source/preview、隔离 origin/CSP；
- upload quarantine/content worker；
- public gateway、stable slug、unlisted/password/expiry；
- 基础访问事件。

退出标准：完全不使用 AI 也能创建、编辑、版本、删除恢复和发布 Markdown/HTML；安全测试通过。

## 4. Phase 2：Knowledge（3–4 周）

- KB/Source 状态机；
- PDF/Markdown/URL parse/chunk；
- pgvector + FTS hybrid search；
- Ask/Citation；
- 单 Source 重试/移除；
- MCP Read：search/read/search knowledge。

退出标准：Citation 可定位精确 source version；跨 tenant 检索测试和固定 recall eval 通过。

## 5. Phase 3：Research + Durable Task（4–6 周）

- Research spec/scope/quality/output；
- Hatchet Workflow、task projector、SSE progress；
- Agent planner/tool loop/evidence；
- checkpoint、cancel、partial success、failed item retry；
- 外部积分系统余额只读适配；
- 完成/失败通知。

退出标准：关闭浏览器 10 分钟仍继续，Worker 重启可恢复，重试不重复 Asset/扣费，至少输出 Report + Sources。

## 6. Phase 4：Dataset（3–4 周）

- CSV/JSON/XLSX import、Parquet；
- schema/profile/quality issue；
- compute-worker data 模块 filter/sort/page/aggregate；
- ECharts chart spec；
- AI 仅生成结构化 analysis/query plan；
- Dataset → Chart/Report relations。

退出标准：10 万行数据 P95 目标、资源 quota、恶意 query fuzz 和结果确定性通过。

## 7. Phase 5：Presentation + Templates（4–5 周）

- structured slide document；
- outline confirmation、theme/layout version；
- editor、single-slide regenerate、speaker notes P1；
- Reveal.js/custom renderer playback；
- static bundle publish；
- Research/Presentation templates。

退出标准：Document/Report → Outline → Presentation → mobile/desktop playback → stable URL 全链路。

## 8. Phase 6：商业化与上线加固（2–4 周）

- Storage 明细和任务失败降级；
- API token、MCP connection guide/revoke；
- rate limit、abuse、backup restore、load test；
- accessibility、SEO、analytics 口径；
- privacy/retention/terms；
- runbook 和告警演练。

## 9. P1/P2 后置项

团队实时协作、Git/Notion/Drive 同步、Living Asset、Scheduled Task、Custom Domain、OpenSearch、ClickHouse、Knowledge Graph、Skill marketplace、Connector tunnel 均以后置指标触发，不进入 MVP 主链路。

## 10. 关键决策门

| 时间点 | 必须回答的问题 |
| --- | --- |
| Phase 0 结束 | Hatchet 是否共享平台实例；生产 S3 是共享 SeaweedFS 还是云 S3 |
| Phase 1 结束 | 用户 HTML 是否允许脚本/外网；公共 user-content 根域 |
| Phase 2 结束 | 中文检索质量是否足以推迟 OpenSearch |
| Phase 3 结束 | Agent 成功率、单任务成本、人工介入率是否达到上线线 |
| Phase 4 结束 | DuckDB pool 是否满足并发；是否需要专用 OLAP |
| 上线前 | SLO、RPO/RTO、数据保留、外部积分系统对接与合规政策最终值 |
