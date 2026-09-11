# Obsidian 插件 OAuth 与自动登录设计

日期：2026-09-11 · 状态：已实现

`auth-service` 是统一授权服务器，`website` 承载统一的设备确认页面，`asset-hub api` 是资源服务器，Obsidian 插件是公开客户端。所有用户可见的认证请求和页面统一使用 `https://shiguanglab.com`。

本设计采用 OAuth 2.0 Device Authorization Grant。浏览器全程停留在官方域名，插件不启动本地 HTTP 服务，不出现 `127.0.0.1` 回调页面，也不注册自定义 URL Scheme。

## 1. 设计决策

| 项目 | 决策 |
| --- | --- |
| 首次登录 | 系统浏览器 + Device Authorization Grant |
| 登录完成通知 | 插件使用 `device_code` 按服务端间隔轮询 token endpoint |
| 浏览器入口 | `https://shiguanglab.com/oauth/device` |
| 浏览器完成页 | `https://shiguanglab.com/oauth/device/success` |
| 本地回调 | 无 |
| 客户端密钥 | 无；插件是公开客户端，不能安全保存 `client_secret` |
| 访问令牌 | 短时 JWT，供 asset-hub api 和受限网页会话票据使用 |
| 刷新令牌 | auth-service 保存状态、每次使用时轮转，可撤销 |
| 内嵌知序 | 使用 `web:session` scope 换取一次性网页会话票据，不重复登录 |
| 凭据存储 | 使用 Electron `safeStorage` 或等价系统能力加密，插件数据只存密文 |

这不是“把 OAuth 回调地址改为 `https://shiguanglab.com`”。Device Authorization Grant 没有回调到插件的 `redirect_uri`：网页更新 auth-service 中的授权状态，插件通过后端轮询获得 token。

## 2. 客户端注册

```text
client_id:                  obsidian-asset-hub
client_name:                知序 for Obsidian
client_type:                public
token_endpoint_auth_method: none
grant_types:                urn:ietf:params:oauth:grant-type:device_code,
                            refresh_token
scopes:                     documents:read documents:write web:session offline_access
access_token_audiences:     asset-hub-api auth-service
device_code_ttl:            10m
poll_interval:              5s
access_token_ttl:           15m
refresh_token_ttl:          30d
```

客户端策略由 auth-service 的静态注册表管理，不要求新增动态客户端注册表或数据库表。注册表支持多个 App；每个客户端独立配置名称、scope、audience、所需 entitlement 和允许的网页会话目标。纯设备授权客户端不配置 `redirect_uri`。`web:session` 不映射为 asset-hub api 的文档权限，只允许 auth-service 创建一次性网页会话票据。

## 3. 登录时序

```text
Obsidian 插件       website / shiguanglab.com                  auth-service
     │                                  │                              │
     │ POST /oauth/device/authorize     │                              │
     │ client_id + scope ─────────────────────────────────────────────>│
     │<─ device_code, user_code, verification_uri_complete, interval ─│
     │                                  │                              │
     │ 打开 verification_uri_complete ─>│                              │
     │                                  │ 登录并向 auth-service 读取请求 │
     │                                  │ 用户确认 ────────────────────>│
     │                                  │<─ 确认结果 ───────────────────│
     │                                  │                              │
     │ POST /oauth/token                │                              │
     │ device_code ───────────────────────────────────────────────────>│
     │<─ authorization_pending / slow_down ───────────────────────────│
     │                                  │                              │
     │ POST /oauth/token（继续轮询）──────────────────────────────────>│
     │<─ access_token + refresh_token ────────────────────────────────│
     │ 安全保存凭据并显示已登录        │                              │
```

插件可以在打开浏览器后立刻开始轮询，不必等网页给出任何回调。auth-service 是授权状态的唯一真源。

## 4. 端点设计

### 4.1 OAuth 元数据

`GET https://shiguanglab.com/.well-known/oauth-authorization-server`

```json
{
  "issuer": "https://shiguanglab.com",
  "token_endpoint": "https://shiguanglab.com/oauth/token",
  "revocation_endpoint": "https://shiguanglab.com/oauth/revoke",
  "device_authorization_endpoint": "https://shiguanglab.com/oauth/device/authorize",
  "jwks_uri": "https://shiguanglab.com/.well-known/jwks.json",
  "scopes_supported": [
    "documents:read",
    "documents:write",
    "web:session",
    "offline_access"
  ],
  "grant_types_supported": [
    "urn:ietf:params:oauth:grant-type:device_code",
    "refresh_token"
  ],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

插件校验 `issuer` 以及全部端点均为允许的 `https://shiguanglab.com` 源。生产版不允许普通用户修改认证服务地址；开发构建使用单独配置覆盖。

### 4.2 创建设备授权会话

`POST https://shiguanglab.com/oauth/device/authorize`

```text
Content-Type: application/x-www-form-urlencoded

client_id=obsidian-asset-hub
scope=documents%3Aread%20documents%3Awrite%20web%3Asession%20offline_access
```

成功响应：

```json
{
  "device_code": "<至少 256 位熵的随机值>",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://shiguanglab.com/oauth/device",
  "verification_uri_complete": "https://shiguanglab.com/oauth/device?user_code=WDJB-MJHT",
  "expires_in": 600,
  "interval": 5
}
```

- `device_code` 是登录会话的持有证明，只返回插件，不进入浏览器 URL、不展示给用户、不写日志。
- `user_code` 是短时核对码。即使 `verification_uri_complete` 已预填，网页也展示它并让用户核对。
- 服务端保存 `device_code` 的哈希、客户端、scope、状态、过期时间、批准账号和工作空间；不明文保存完整 `device_code`。
- 创建、查询和确认均限流。`user_code` 输入需要额外防暴力枚举限制。

### 4.3 浏览器验证页

`GET https://shiguanglab.com/oauth/device` 由 `website` 提供页面；页面通过同源的 `GET /oauth/device/context?user_code=...` 读取请求，通过 `POST /oauth/device/decision` 提交决定。这两个 JSON 接口由 `auth-service` 提供。网关只把精确的 `GET /oauth/device` 转发给 website，其余 `/oauth/*` 请求仍转发给 auth-service。

浏览器未登录时进入统一登录，成功后必须回到原设备授权会话；已有会话时直接显示确认页。确认页至少展示：

- 「知序 for Obsidian」客户端名称；
- 申请的文档读取、文档写入、在 Obsidian 中打开知序和保持登录权限；
- 与插件一致的 `user_code`；
- 当前账号及工作空间；
- 「允许」和「拒绝」。

批准或拒绝只能执行一次。确认完成后页面在原地址显示结果，提示用户返回发起连接的应用，不尝试向本地地址或内嵌 WebView 发送 token。

### 4.4 Token endpoint

`POST https://shiguanglab.com/oauth/token`

设备码轮询请求：

```text
grant_type=urn:ietf:params:oauth:grant-type:device_code
device_code=<device_code>
client_id=obsidian-asset-hub
```

| 服务端结果 | 插件行为 |
| --- | --- |
| `authorization_pending` | 等待至少 `interval` 后继续 |
| `slow_down` | 当前及后续间隔至少增加 5 秒 |
| `access_denied` | 停止轮询，显示用户已拒绝 |
| `expired_token` | 停止轮询，允许用户重新发起 |
| token 响应 | 停止轮询，安全保存并更新登录状态 |
| 网络超时 | 退避后重试，但不得快于服务端间隔 |
| 其他 OAuth 错误 | 停止轮询并显示可操作错误 |

用户取消、插件卸载、关闭 Vault 或发起新登录时，立即停止旧轮询。一次已批准的 `device_code` 只能原子兑换一次。

成功响应：

```json
{
  "access_token": "<RS256 JWT>",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "<不透明随机串>",
  "scope": "documents:read documents:write web:session offline_access"
}
```

刷新令牌请求仍使用 `grant_type=refresh_token`。每次刷新签发新 refresh token，旧 token 立即失效；检测到旧 token 重放时吊销整个令牌家族并要求重新登录。

### 4.5 撤销

`POST https://shiguanglab.com/oauth/revoke`

退出登录时吊销 refresh token 家族并清除本地凭据。令牌不存在时仍返回成功，避免成为令牌探测接口。本地清除不依赖网络成功。

### 4.6 内嵌知序网页会话

- `POST https://shiguanglab.com/oauth/web-session-ticket`：要求由 `obsidian-asset-hub` 获得、包含 `web:session` scope 且仍在有效期内的 access token；`return_to` 仅允许 `https://doc.shiguanglab.com` 同源地址。接口返回一次性、短时票据。
- `GET https://shiguanglab.com/oauth/web-session?ticket=…`：原子消费票据，建立跨子域 HttpOnly 网页会话，随后跳转到票据绑定且不含票据的知序地址。

`return_to` 只接受站内路径。票据不超过 60 秒，绑定账号、工作空间、客户端和目标页面。完整产品规则见 [05-product-design.md](./05-product-design.md) §7。

## 5. Access Token 与资源服务器

Access token 使用 RS256 JWT，JWS header `typ` 为 `at+jwt`，与网关内部身份令牌区分。至少包含：

```json
{
  "iss": "https://shiguanglab.com",
  "aud": ["asset-hub-api", "auth-service"],
  "sub": "<user id>",
  "client_id": "obsidian-asset-hub",
  "scope": "documents:read documents:write web:session",
  "org_id": "<workspace id>",
  "iat": 1757488482,
  "exp": 1757489382,
  "jti": "<unique id>"
}
```

asset-hub api 校验签名、`iss`、`aud` 包含 `asset-hub-api`、`typ`、有效期及 entitlement，再映射业务权限：

```text
documents:read  -> read
documents:write -> read, write
web:session     -> 不映射业务权限
```

API 仍通过 `Authorization: Bearer <access_token>` 接收插件请求。PAT 与 OAuth JWT 必须按结构明确区分，不能互相降级尝试。

## 6. 插件状态与凭据

### 6.1 登录状态机

```text
signed-out
  -> requesting-device-code
  -> waiting-for-browser
  -> exchanging
  -> signed-in

waiting-for-browser
  -> denied | expired | cancelled | error

signed-in
  -> refreshing
  -> signed-in | authorization-expired
```

登录弹窗显示短码、剩余时间、「重新打开浏览器」「复制登录地址」「取消」。浏览器授权完成后，插件在下一次成功轮询时自动关闭弹窗并继续用户原先发起的操作。

### 6.2 凭据存储

访问令牌和刷新令牌不得明文保存。桌面端使用 Electron `safeStorage` 或等价系统能力加密后，仅将密文写入插件配置；换设备或系统密钥不可用时重新授权，不降级读取明文。

access token 提前 60 秒刷新。并发请求共用一次刷新任务，避免 refresh token 被重复轮转导致整条令牌家族吊销。API 返回 401 时强制刷新一次并重试原请求一次；仍失败则清除凭据并回到重新登录状态。

## 7. auth-service 数据与实现边界

需要服务端持久化两类短期 / 可撤销状态：

| 状态 | 建议存储 | 生命周期 |
| --- | --- | --- |
| Device authorization session | Redis | 10 分钟；保存 device code 哈希、user code、client、scope、状态、批准身份 |
| Refresh token family | Redis 或持久化会话库 | 30 天；支持轮转、重放检测和整族吊销 |

路由全部由 auth-service 实现，经 `https://shiguanglab.com` 对外暴露，不挂要求内部网关 token 的中间件；它们执行自己的客户端校验、限流和 OAuth 安全检查。

最低路由集合：

```text
GET  /.well-known/oauth-authorization-server
POST /oauth/device/authorize
GET  /oauth/device
POST /oauth/device
POST /oauth/token
POST /oauth/revoke
POST /oauth/web-session-ticket
GET  /oauth/web-session
```

asset-hub api 只负责验证 access token 并实施文档权限，不保存 device code、刷新令牌或网页登录会话。

## 8. 验收条件

- 整个首次登录的浏览器地址始终为 `https://shiguanglab.com`，不出现 `127.0.0.1`、`localhost` 或内部服务地址。
- 插件不启动本地监听端口；当前 `loopback-server.ts` 从运行链路移除。
- 浏览器已登录时无需再次输入账号，但仍展示客户端、权限和短码确认。
- 浏览器授权完成后，插件在下一个允许的轮询周期自动识别成功并继续原操作。
- 两个并发登录会话不会串号；旧会话、取消会话和过期会话不能换 token。
- 插件遵守 `interval`、`slow_down`、取消和超时，不产生无限轮询。
- `device_code` 不进入 URL、界面或日志；`user_code` 不能单独兑换 token。
- 刷新、撤销、授权失效和凭据加密符合本稿定义。
- 已登录插件打开内嵌知序时自动建立网页会话，不出现第二次登录。
