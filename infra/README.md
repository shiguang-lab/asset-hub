# Asset Hub 基础设施部署

Asset Hub 复用 NAS 上的共享基础服务，按“独立库 / 租户 / bucket / subject / client”隔离。
唯一需要单独部署的是 **PostgreSQL + pgvector**（因为共享 PostgreSQL 为 `postgres:16-alpine`，
不含 pgvector，且升级会打断 OPC/Hatchet/model-gateway 共用的生产库）。

## 已部署的 NAS 基础服务

| 能力 | 实例 | 对外地址 | asset-hub 隔离方式 |
| --- | --- | --- | --- |
| 业务数据库 + 向量 | 专用 `pgvector/pgvector:0.8.6-pg16` | `100.87.115.78:5433` | 独立实例、独立 `asset_hub` 库/角色、`vector` 扩展 |
| 持久任务 | 共享 Hatchet full | gRPC `100.87.115.78:7077`、Dashboard `:8888` | 独立 tenant `asset-hub` + token |
| 对象存储 | 共享 SeaweedFS S3 网关 | `100.87.115.78:8333` | 独立 bucket `asset-hub` + credential |
| 事件总线 | 共享 NATS JetStream | `nats://100.87.115.78:4222` | subject 前缀 `asset_hub.*` |
| 模型路由 | 共享 model-gateway | `http://100.87.115.78:3150` | 独立 `resolve` client `asset-hub-runtime`，使用全局模型目录 |
| 认证 | 共享 auth-service + ZITADEL | 平台统一 | 复用 `X-SG-Identity` |
| 北向入口 | 共享 access-gateway | 平台统一 | 新增 host/path policy |
| 访问分析 | 共享 Umami | 平台统一 | 新 siteId |

> 可观测（OpenTelemetry Collector + Prometheus/Grafana/Loki/Tempo）为 P1，待应用发出 OTLP 后再部署。

## 部署目录

```text
infra/compose/
├── postgres.yml            # asset-hub 专用 PostgreSQL + pgvector
├── postgres.env.example    # 环境变量模板（不提交真实密码）
└── postgres-init/
    └── 00-extensions.sql   # 首次初始化：CREATE EXTENSION vector
```

## 部署 PostgreSQL + pgvector

```bash
cd infra/compose
cp postgres.env.example .env
# 编辑 .env 填入真实 POSTGRES_PASSWORD
docker compose -f postgres.yml up -d
docker compose -f postgres.yml ps
```

对应线上 NAS 目录：`/home/yanxianliang/asset-hub-postgres/`。

## 应用侧环境变量

见仓库根目录 [`.env.example`](../.env.example)，关键项：

- `DATABASE_URL`：`postgres://asset_hub:<密码>@100.87.115.78:5433/asset_hub`
- `HATCHET_CLIENT_*`：指向共享 Hatchet（独立 tenant）
- `S3_*`：指向共享 SeaweedFS S3 网关（独立 bucket）
- `NATS_URL`：`nats://100.87.115.78:4222`（subject 前缀 `asset_hub.*`）
- `MODEL_GATEWAY_URL` / `MODEL_GATEWAY_API_KEY`：共享 model-gateway（独立 client）

## 生产应用部署

六个应用使用仓库根目录的多阶段 `Dockerfile` 构建，并由
`infra/compose/production.yml` 统一编排：

- `web`：静态 SPA，NAS 调试端口 `3700`；
- `api`：业务 API，NAS 调试端口 `3701`；
- `worker`：Hatchet/Outbox 后台任务执行器；
- `compute-worker`：数据处理服务，NAS 调试端口 `3702`；
- `public-gateway`：公开发布服务，NAS 调试端口 `3704`。
- `ssr`：公开 Markdown 阅读页的 Next.js 服务，仅加入内部 `app` 网络，监听容器端口 `3005`，由 `public-gateway` 反向代理。

生产统一使用 `doc.shiguanglab.com`：主应用与 API 需要登录，`/p/*`、`/s/*`
为匿名发布路径。发布网关必须对 HTML 强制附加限制性 CSP，禁止网络请求、
iframe、表单和第三方子资源，以降低用户生成 HTML 与主站同源带来的风险。

Markdown 发布页不再生成静态 HTML 作为最终入口：`public-gateway` 完成短链、状态、
密码和资源权限校验后，将 `/p/:slug` 内部代理到 `ssr` 的 `/render/:slug`，由 Next.js
服务端通过网关读取 `index.md`，使用共享 `@shiguang/markdown-viewer`（XMarkdown）渲染，
并在浏览器端提供目录折叠、代码块/Mermaid 交互、下载和复制链接能力。

NAS 部署目录约定为 `/home/yanxianliang/asset-hub`。把生产集成凭据放入仓库
根目录 `.env` 后执行：

```bash
cd infra/compose
./deploy.sh
```

首次执行会生成权限为 `0600` 的 `runtime.env`，保存服务间令牌和镜像版本。
后续部署保留该文件，避免滚动更新时令牌意外变化。共享网关路由模板见
`/Users/yanxianliang/shiguang/deploy/access-gateway/Caddyfile`，由统一部署仓库维护。
Asset Hub 应用部署不会修改 Caddy；网关配置变更应通过统一的
`shiguang/deploy/access-gateway/deploy.sh` 发布。
