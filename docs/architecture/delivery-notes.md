# 交付说明与验证记录

## 1. 本次交付范围

基于 PRD V1.0、72 张 UI 交互图与 5 份应用技术设计，实现全部 P0 能力并以可运行 monorepo 交付。
不包含占位实现：所有页面、接口、任务、索引、发布与 MCP 工具均为真实功能，且全流程可在本地无外部依赖运行。

## 2. 实现决策

| 决策 | 说明 |
| --- | --- |
| SQLite（node:sqlite）+ FTS5 | 本地零依赖即可交付；`Store` 层隔离，生产可换 PostgreSQL/Kysely + pgvector |
| 本地内容寻址对象存储 | `LocalObjectStore` 实现 S3 兼容接口，可替换 SeaweedFS |
| Outbox/Inbox + HTTP 内部接口 | worker 轮询 outbox、投影结果幂等落库；NATS/Hatchet 可替换协议而不改业务代码 |
| 本地确定性模型回退 | 未配置 model-gateway 时 Research/Ask/大纲/文档 AI 动作全部可用 |
| MCP 自研 Streamable HTTP | 兼容 MCP 2025-06-18 协议，JSON 与 SSE 双响应，官方 SDK 客户端验证通过 |
| Go 查询引擎 | 结构化 AST 校验（列白名单、操作符 allowlist、limit/offset 预算），不执行任意 SQL |

## 3. 端到端验证记录（2026-08-13）

以下链路均在本机实际运行验证：

1. 创建 Markdown 文档 → 发布 → `public-gateway` 返回渲染 HTML（含 CSP/安全头）✅
2. 短链 `/s/{slug}` → 302 到 `/p/{slug}` ✅
3. 知识库：添加资产来源 → worker 解析/分块 → FTS 搜索命中 → Ask 返回引用（Citation 含 source/ordinal/locator）✅
4. Research（报告+来源+数据）：worker 完成 → 3 个输出资产 + 5 条 Evidence + Credits 结算 ✅
5. 数据集：CSV 上传 → worker 导入 → Schema（string/integer）→ 分组聚合查询（MoMo=270、VnPay=205）✅
6. 演示：报告 → AI 大纲 → 5 页演示资产 → 发布 → 网关播放页 + manifest 白名单 + 路径穿越防护（404）✅
7. MCP：官方 SDK 客户端 initialize → tools/list（7 工具）→ search_assets 返回真实资产 ✅
8. Web：`http://localhost:3000` 可访问，页面路由与 API 代理正常 ✅
9. `pnpm check`（format/lint/typecheck/test/build）全绿 ✅

## 4. 修复的关键问题

- 内容 blob media_type 记录错误导致正文读取为 manifest（修复为按 content.kind 存 MIME）；
- chunkText 在文本末尾死循环导致 worker OOM（JS 与 Go 双实现修复并加 break）；
- 本地模型关键字误匹配（`scope:` 被当作 `research-scope`）；
- 数据集投影未创建 `datasets` 记录；
- 演示 manifest 嵌套导致 0 页；
- MCP SDK Node transport 与 Fastify 兼容问题（改为自研 JSON-RPC 层）。

## 5. 生产化路径

- 替换 `packages/database` 存储层为 PostgreSQL/Kysely + pgvector；
- `ObjectStore` 换 S3/SeaweedFS；
- outbox relay 接 NATS JetStream，worker 换 Hatchet SDK；
- `AiService` 已支持 model-gateway，配置 URL 即可切换真实模型；
- 认证：接入 access-gateway/auth-service 后关闭 `DEV_AUTH`。
