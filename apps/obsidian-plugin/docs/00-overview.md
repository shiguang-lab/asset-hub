# Obsidian 插件：总览与架构决策

将「知序资产中心」的文档中心接入 Obsidian，使用户在 Obsidian 内完成文档的浏览、编辑、创建、组织与同步。

**范围限定**：仅文档中心（`type = document | html`）。不含调研（Research）、演示（Presentation）、数据集（Dataset）、图表（Chart）、知识库问答。

## 1. 现状勘察结论

设计前对三个仓库做了代码级核查，结论直接决定了架构选择。

### 1.1 OAuth 完全不存在

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| `apps/api` 内 OAuth 端点 | 不存在 | 全仓无 `authorization_code` / `code_challenge` / `/oauth/authorize` |
| `auth-service` 是否为 OAuth AS | 否 | `internal/httpapi/server.go` 路由全集无 OAuth 端点；OAuth 字样仅出现在飞书 IDP（该服务是 RP 而非 AS） |
| OAuth client 注册模型 | 不存在 | 无 `client_id` / `redirect_uri` 表或配置 |

`auth-service` 当前是「网关鉴权 + 本地 broker」服务，站在 ZITADEL 之上：
- 签发 sg-identity JWT（RS256，`internal/identity/signer.go:61,118`），私钥来自 `IDENTITY_SIGNING_KEY_FILE`
- JWKS 暴露于 `GET /.well-known/jwks.json`（`server.go:124`）
- 用户库在 ZITADEL，会话在 Redis（`internal/session/redis.go`，前缀 `auth:session:`）

### 1.2 关键约束：`/api/auth/*` 全在网关 token 之后

`authenticateGateway`（`server.go:501-510`）用常量时间比对 `X-SG-Gateway-Token`。所有 `/api/auth/*` 都在此中间件后，**Obsidian 作为公开客户端无法直连**。

但存在免网关的先例——`/.well-known/jwks.json`（L124）与 `/v1/identity/users/*`（L155-156）直接挂在 router 上。这为 OAuth 端点提供了合法的挂载方式：新增端点走独立路由组，不挂 `authenticateGateway`，改用 OAuth 自身的 client 认证与 PKCE 校验。

### 1.3 文档即 assets，正文在对象存储

- 文档是 `assets` 表中 `type IN ('document','html')` 的行（`packages/database/migrations/0001_init.sql:47-63`）
- 正文**不存数据库**，写入对象存储 `assets/${assetId}/versions/${versionId}/content`（`apps/api/src/store.ts:779-810`）
- 版本链在 `asset_versions`，`content_hash` 由 `hashBuffer` 计算（`store.ts:126-145`）——这个哈希是同步比对的基石
- 并发控制为 `lock_version` 整数 + 请求头 `If-Match`（`assets.ts:1091-1099`），冲突抛 409 `ASSET_VERSION_CONFLICT`（`platform/errors.ts:59-73`）

### 1.4 目录是前端假数据（重要）

Web 端「产品 / 产品规划 / 需求文档」这类目录树**并非服务端能力**：

- 目录定义硬编码在 `apps/web/src/features/documents/documents.tsx:96-99` 的 `DEFAULT_DOCUMENT_FOLDERS`
- 目录与归属分别存于 `localStorage` 的 `shiguang.document-folders` 和 `shiguang.document-folder-assignments`（同文件 L92-93）
- `packages/database` 内 grep `folder` **零命中**——无表、无字段、无迁移
- 服务端唯一路径痕迹是批量导入时写入的 `metadata.importPath` 字符串（`assets.ts:835`），无索引无约束

后果：换设备或清缓存，目录树消失。**双向同步 Obsidian 文件夹必须先给服务端补真实的路径字段**，否则移动/重命名无法可靠表达。

### 1.5 没有增量同步接口

- `listAssets` 按 `updated_at DESC, id DESC` 游标分页（`store.ts:444-468`），但 `listAssetsQuerySchema`（`contracts/src/index.ts:926-935`）**无 `since` 之类的时间过滤参数**
- 无 changes / delta 端点
- SSE 在 `GET /api/v1/events`（`app.ts:150`），事件枚举含 `asset.updated`（`contracts/src/index.ts:702-716`）
- 响应**不返回 ETag 头**，只消费 `If-Match`

首轮全量拉取可用游标，但每次同步都翻全表不可接受，需补 `since` 过滤。

## 2. 架构决策

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | **`auth-service` 改造为标准 OAuth 2.0 AS** | 授权服务器职责应归属认证服务。一次实现可复用于未来的 CLI、移动端、第三方集成，而非在 `apps/api` 里长一个只服务 Obsidian 的私有实现 |
| D2 | **授权码 + PKCE（S256），公开客户端，无 client_secret** | 插件代码用户可读，任何密钥都等于公开。PKCE 是 OAuth 2.1 对公开客户端的强制要求 |
| D3 | **回环地址重定向** `http://127.0.0.1:<随机端口>/callback` | RFC 8252 对原生应用的推荐做法。优于自定义协议：无需注册 scheme、不受 Obsidian 版本差异影响 |
| D4 | **双向同步 + 乐观锁，冲突保留双份** | 基于 `lock_version`/`If-Match`。冲突时不覆盖任何一方，落地 `xxx (conflict 2026-09-10).md` 让用户裁决。静默丢数据不可接受 |
| D5 | **服务端补齐真实目录**，同时修复 Web 端 | 给 `assets` 加 `path` 字段（含索引与唯一约束）+ 迁移脚本，Web 端目录从 localStorage 迁到服务端。让 Obsidian 文件夹与 Web 目录真正一致 |
| D6 | **`asset_versions.content_hash` 作为同步比对依据** | 服务端已有此字段，插件本地索引记录 `lastSyncedHash`，构成标准三方比对（本地 / 远端 / 基线） |

## 3. 系统边界

```
┌──────────────────┐   OAuth 授权码 + PKCE    ┌─────────────────────┐
│  Obsidian 插件    │ ─────────────────────────>│   auth-service      │
│  (Electron)      │<─── access + refresh ─────│   (OAuth 2.0 AS)    │
│                  │                            │   ZITADEL + Redis   │
│  ┌────────────┐  │                            └─────────────────────┘
│  │ 同步引擎    │  │                                      │ JWKS
│  │ 本地索引    │  │                                      ▼
│  └────────────┘  │   Bearer access_token      ┌─────────────────────┐
│                  │ ─────────────────────────>│   asset-hub api     │
│  vault 文件      │<──── 文档 / 目录 / SSE ────│   (资源服务器)       │
└──────────────────┘                            └─────────────────────┘
```

职责划分：
- **auth-service**：身份认证、用户同意、令牌签发与轮转、令牌吊销
- **asset-hub api**：校验 access token（JWKS 验签）、文档与目录的读写、增量变更、SSE
- **插件**：本地索引、变更检测、冲突处理、vault 文件读写

## 4. 文档索引

| 文档 | 内容 |
| --- | --- |
| [01-oauth-design.md](./01-oauth-design.md) | OAuth 授权码 + PKCE 端到端设计、令牌生命周期、安全边界 |
| [02-sync-design.md](./02-sync-design.md) | 同步引擎状态机、三方比对、冲突矩阵、重命名与删除语义 |
| [03-server-changes.md](./03-server-changes.md) | 服务端改动清单：`path` 字段、增量同步、ETag、Web 目录迁移 |
| [04-plugin-architecture.md](./04-plugin-architecture.md) | 插件工程结构、模块划分、设置面板、构建与发布 |

## 5. 实施顺序

依赖关系决定顺序，不可并行的部分已标注。

1. **服务端 `path` 字段 + 迁移**（03 章）——同步与目录的前置条件
2. **服务端增量同步 `since` + ETag**（03 章）——可与 1 并行
3. **auth-service OAuth AS**（01 章）——独立于 1、2，可并行
4. **asset-hub api 校验 access token**（01 章）——依赖 3
5. **插件骨架 + OAuth 登录**（04 章）——依赖 3、4
6. **同步引擎**（02 章）——依赖 1、2、5
7. **Web 端目录迁移**（03 章）——依赖 1，可最后做
