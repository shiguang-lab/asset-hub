# OAuth 2.0 授权码 + PKCE 设计

`auth-service` 改造为标准授权服务器（AS），`asset-hub api` 作为资源服务器（RS），Obsidian 插件作为公开客户端。

## 1. 为什么必须新建

`auth-service` 现有能力无一可直接复用：

| 现有机制 | 为何不可用 |
| --- | --- |
| `/api/auth/local-broker` | 需 `X-SG-Gateway-Token`（`server.go:501-510`），且校验 `Origin == policy.PublicOrigin`。插件既无网关 token 也无合法 Origin |
| `/api/auth/identity-token` | 同样在 `authenticateGateway` 之后，且 audience 固定写死 |
| 飞书 OAuth | 该服务是依赖方（RP），不是授权方（AS） |
| `__Secure-sg_session` cookie | 域限定 `.shiguanglab.com`，Electron 内的插件请求不携带 |

## 2. 客户端注册模型

公开客户端，无 `client_secret`。

```
client_id:                 obsidian-asset-hub
client_name:               知序资产中心 for Obsidian
client_type:               public
token_endpoint_auth_method: none
grant_types:               authorization_code, refresh_token
response_types:            code
redirect_uris:             http://127.0.0.1:*/callback   (回环，端口通配)
                           http://[::1]:*/callback
scopes:                    documents:read documents:write offline_access
require_pkce:              true  (仅接受 S256)
```

**回环端口通配是刻意的**。RFC 8252 §7.3 明确要求 AS 对回环重定向忽略端口号——原生应用无法预知可用端口。校验逻辑必须严格：主机固定为 `127.0.0.1` 或 `[::1]`，路径固定为 `/callback`，scheme 固定 `http`，仅端口任意。**不得**放宽为前缀匹配，否则 `http://127.0.0.1.evil.com/callback` 会通过。

配置形态沿用现有 `LocalBrokerPolicy` 的代码内 map 风格（`internal/login/service.go`），首期单客户端无需建表：

```go
// internal/oauth/registry.go
type ClientPolicy struct {
    ClientID          string
    ClientType        string   // "public"
    AllowedScopes     []string
    RequirePKCE       bool
    LoopbackRedirect  bool     // 启用 RFC 8252 回环端口忽略
    RedirectPath      string   // "/callback"
    AccessTokenTTL    time.Duration
    RefreshTokenTTL   time.Duration
    Audience          string   // "asset-hub-api"
}
```

## 3. 端到端时序

```
插件                      系统浏览器              auth-service              asset-hub api
 │                            │                        │                         │
 │ 1. 生成 verifier(43-128字符)│                        │                         │
 │    challenge = S256(v)     │                        │                         │
 │    state, nonce (各128位熵) │                        │                         │
 │ 2. 启动 127.0.0.1:<port>   │                        │                         │
 │    仅监听回环               │                        │                         │
 │                            │                        │                         │
 │ 3. 打开系统浏览器 ─────────>│                        │                         │
 │                            │ 4. GET /oauth/authorize│                         │
 │                            │───────────────────────>│                         │
 │                            │                        │ 5. 读 __Secure-sg_session
 │                            │                        │    未登录→跳登录页       │
 │                            │                        │    已登录→同意页         │
 │                            │<───── 同意页 ──────────│                         │
 │                            │ 6. 用户点「授权」        │                         │
 │                            │───────────────────────>│                         │
 │                            │                        │ 7. code 存 Redis
 │                            │                        │    绑 challenge/client/
 │                            │                        │    redirect_uri, TTL 60s
 │                            │<── 302 到回环地址 ──────│                         │
 │ 8. 收到 code + state ◄─────│                        │                         │
 │    校验 state 一致          │                        │                         │
 │    立刻关闭监听             │                        │                         │
 │                            │                        │                         │
 │ 9. POST /oauth/token ─────────────────────────────>│                         │
 │    code + verifier + client_id                      │ 10. 校验:
 │                                                     │  S256(verifier)==challenge
 │                                                     │  code 未用过 (原子删除)
 │                                                     │  redirect_uri 完全一致
 │<─── access(15m) + refresh(30d) ────────────────────│                         │
 │                                                     │                         │
 │ 11. Authorization: Bearer <access> ───────────────────────────────────────────>│
 │                                                     │  12. JWKS 验签           │
 │<──────────────────── 文档数据 ─────────────────────────────────────────────────│
```

### 3.1 为什么用系统浏览器而非内嵌 WebView

RFC 8252 §8.12 明确禁止嵌入式用户代理。系统浏览器带来三个不可替代的好处：

1. **复用既有会话**——用户在浏览器已登录 `shiguanglab.com`，`__Secure-sg_session` cookie 直接可用，无需重新输密码
2. **凭据不经插件**——插件永远看不到用户密码
3. **地址栏可验真**——用户能确认自己在真实域名上输入凭据

Obsidian 用 `window.open(url, '_blank')` 或 `require('electron').shell.openExternal(url)` 打开外部浏览器。

## 4. 端点设计

### 4.1 `GET /.well-known/oauth-authorization-server`

RFC 8414 元数据文档，**免网关**（与现有 `/.well-known/jwks.json` 同级挂载）。插件据此发现端点，避免硬编码。

```json
{
  "issuer": "https://shiguanglab.com",
  "authorization_endpoint": "https://shiguanglab.com/oauth/authorize",
  "token_endpoint": "https://shiguanglab.com/oauth/token",
  "revocation_endpoint": "https://shiguanglab.com/oauth/revoke",
  "jwks_uri": "https://shiguanglab.com/.well-known/jwks.json",
  "scopes_supported": ["documents:read", "documents:write", "offline_access"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

注意 `code_challenge_methods_supported` 只列 `S256`。**不支持 `plain`**——`plain` 等于没有 PKCE。

### 4.2 `GET /oauth/authorize`

| 参数 | 必需 | 说明 |
| --- | --- | --- |
| `response_type` | 是 | 固定 `code` |
| `client_id` | 是 | `obsidian-asset-hub` |
| `redirect_uri` | 是 | 回环地址，需通过 §2 严格校验 |
| `scope` | 是 | 空格分隔 |
| `state` | 是 | ≥128 位熵，防 CSRF |
| `code_challenge` | 是 | base64url(SHA256(verifier))，无填充 |
| `code_challenge_method` | 是 | 固定 `S256`，其他值拒绝 |

处理流程：

1. 校验 `client_id`、`redirect_uri`、`code_challenge_method`
   - **这一步的错误绝不重定向**，直接渲染错误页。否则成为开放重定向器
2. 读 `__Secure-sg_session` 判断登录态（复用 `internal/session/redis.go`）
   - 未登录 → 302 到现有登录页，`return_to` 带回本请求完整 URL
3. 校验 entitlement `asset-hub:access`（复用 `decision` 逻辑），无权限渲染错误页
4. 渲染同意页，展示客户端名称与 scope 中文描述
5. 用户同意后生成 `code`（32 字节随机），存 Redis：

```
key:   auth:oauth:code:<code>
TTL:   60s
value: { clientID, subject, sessionID, orgID, roles, entitlements,
         scope, codeChallenge, redirectURI, nonce, createdAt }
```

6. 302 到 `redirect_uri?code=<code>&state=<state>`

TTL 取 60 秒。RFC 6749 §4.1.2 建议不超过 10 分钟，但回环流程中插件立即兑换，60 秒足够且显著缩小窗口。

### 4.3 `POST /oauth/token`

免网关，`Content-Type: application/x-www-form-urlencoded`。

**授权码兑换**：

```
grant_type=authorization_code
code=<code>
redirect_uri=http://127.0.0.1:51234/callback
client_id=obsidian-asset-hub
code_verifier=<原始 verifier>
```

校验顺序（任一失败返回 `400 invalid_grant`，且**不泄露具体原因**）：

1. **原子取出并删除** code——`GETDEL` 或 Lua 脚本。这是防重放的核心，必须原子
2. `client_id` 与 code 绑定值一致
3. `redirect_uri` 与 code 绑定值**完全字符串相等**（含端口）
4. `base64url(SHA256(code_verifier)) == codeChallenge`，用 `subtle.ConstantTimeCompare`
5. 会话仍有效（用户可能已在别处登出）

成功返回：

```json
{
  "access_token":  "<RS256 JWT>",
  "token_type":    "Bearer",
  "expires_in":    900,
  "refresh_token": "<48 字节不透明随机串>",
  "scope":         "documents:read documents:write offline_access"
}
```

**刷新令牌轮转**：

```
grant_type=refresh_token
refresh_token=<current>
client_id=obsidian-asset-hub
```

轮转规则（RFC 6749 §10.4 + OAuth 2.1）：

- 每次刷新签发**新** refresh token，旧的立即失效
- 检测重放：若收到已使用过的 refresh token，**吊销整条令牌家族**并返回 `invalid_grant`。这意味着令牌可能已泄露，宁可让用户重新登录
- 家族标识 `familyID` 贯穿整条轮转链

```
key:   auth:oauth:refresh:<sha256(token)>
TTL:   30d
value: { familyID, clientID, subject, sessionID, scope,
         generation, createdAt, usedAt }

key:   auth:oauth:family:<familyID>      # 家族成员集合，用于批量吊销
```

refresh token 用**不透明随机串**而非 JWT。理由：需要服务端可吊销，JWT 的无状态特性在此是缺点。

### 4.4 `POST /oauth/revoke`

RFC 7009。插件「退出登录」时调用，吊销整个家族。返回 `200`——即使令牌不存在也返回 200，避免成为令牌探测接口。

## 5. Access Token 结构

RS256 JWT，复用现有 `signer.Issue`（`internal/identity/signer.go:90-105`），但 claims 需区分于 sg-identity：

```json
{
  "iss": "https://shiguanglab.com",
  "aud": "asset-hub-api",
  "sub": "<ZITADEL user id>",
  "sid": "<session id>",
  "client_id": "obsidian-asset-hub",
  "scope": "documents:read documents:write",
  "org_id": "<org>",
  "roles": ["editor"],
  "entitlements": ["asset-hub:access"],
  "iat": 1757488482,
  "exp": 1757489382,
  "jti": "<唯一 id>"
}
```

JWS header `typ` 设为 `at+jwt`（RFC 9068），**区别于** sg-identity 的 `sg-identity+jwt`。

这个区分是必要的：`apps/api/src/platform/sg-identity.ts` 现有校验要求 `typ == "sg-identity+jwt"`，若 access token 复用同一 `typ`，两类令牌将可互换使用，绕过 scope 限制。

TTL 15 分钟。短 TTL 配合 refresh 轮转，泄露窗口可控。

## 6. asset-hub api 侧校验

新增 `OAuthTokenVerifier`，与现有 `SgIdentityVerifier` 并列。挂载点在 `apps/api/src/platform/identity.ts` 的 `resolve` 内，位于现有 `Authorization: Bearer` 分支（L36-41）**之前**——需先区分 PAT 与 OAuth token。

判别方式：PAT 以 `sg_` 前缀开头（`modules/integrations.ts:13-37`），JWT 含两个 `.`。

```ts
// apps/api/src/platform/identity.ts
const bearer = extractBearer(req);
if (bearer) {
  if (bearer.startsWith("sg_")) {
    return resolveApiToken(bearer);        // 现有 PAT 路径
  }
  if (bearer.split(".").length === 3) {
    return resolveOAuthToken(bearer);      // 新增
  }
}
```

`resolveOAuthToken` 校验项：

1. RS256 验签（复用现有 JWKS 缓存机制，`sg-identity.ts:117-144`，5 分钟缓存）
2. `iss == "https://shiguanglab.com"`
3. `aud == "asset-hub-api"`
4. JWS header `typ == "at+jwt"`
5. `exp` / `nbf` 有效
6. `entitlements` 含 `asset-hub:access`

映射到现有 `ActorContext`（`packages/contracts/src/index.ts:1016-1026`）：

```ts
{
  subject:       claims.sub,
  workspaceId:   resolvePersonalWorkspace(claims.sub),
  workspaceType: "personal",
  workspaceRole: claims.roles.includes("editor") ? "editor" : "viewer",
  requestId:     req.id,
  isService:     false,
  tokenScopes:   mapScopes(claims.scope),   // documents:read → "read"
  displayName:   claims.name,
}
```

`tokenScopes` 复用现有 `["read","write"]` 枚举（`contracts/src/index.ts:997`），使既有授权检查（如 `requireWrite`）无需改动即可生效：

```
documents:read  → read
documents:write → read, write
```

## 7. 插件侧实现要点

### 7.1 回环服务器

```ts
// 关键：仅绑定回环，端口交由系统分配
const server = http.createServer(handler);
server.listen(0, '127.0.0.1');
const port = (server.address() as AddressInfo).port;
```

`listen(0)` 让系统分配空闲端口，避免硬编码冲突。绑定 `127.0.0.1` 而非 `0.0.0.0`——后者会暴露到局域网。

安全措施：

- **超时**：120 秒未收到回调即关闭并报错
- **单次响应**：收到首个 `/callback` 请求后立即 `server.close()`
- **state 校验**：不匹配则丢弃，不兑换
- **响应页面**：返回一个「授权成功，可关闭此页」的 HTML，不回显任何参数（防注入）

### 7.2 令牌存储

Obsidian 无系统钥匙串 API。令牌存 `data.json`（插件配置目录）。

**必须向用户明示**：`data.json` 为明文。这是 Obsidian 插件的普遍限制，不应假装安全。缓解措施：

- access token 仅 15 分钟有效
- refresh token 可随时在 Web 端吊销
- 设置面板提供「退出登录」清除本地令牌并调用 `/oauth/revoke`
- 文档中提示用户勿将 `.obsidian/plugins/*/data.json` 提交到公开仓库

```ts
interface AuthState {
  accessToken:      string;
  accessExpiresAt:  number;   // epoch ms
  refreshToken:     string;
  scope:            string;
  subject:          string;
  displayName:      string;
}
```

### 7.3 自动刷新与并发抑制

`access_token` 提前 60 秒刷新，避免边界失效。

并发请求可能同时触发刷新，导致多次轮转、令牌家族被误判为重放攻击而全部吊销。必须用**单飞（single-flight）**约束：

```ts
private refreshInFlight: Promise<string> | null = null;

async getValidToken(): Promise<string> {
  if (Date.now() < this.state.accessExpiresAt - 60_000) {
    return this.state.accessToken;
  }
  // 已有刷新在进行，复用同一 Promise
  this.refreshInFlight ??= this.doRefresh().finally(() => {
    this.refreshInFlight = null;
  });
  return this.refreshInFlight;
}
```

这一点若遗漏，表现为「用同一段时间内多开几个文档就被强制登出」，且极难排查。

### 7.4 401 处理

收到 401 时：刷新一次并重试原请求（仅一次）。若重试仍 401 → 清除本地令牌，通知栏提示重新登录。**不做无限重试**。

## 8. 安全清单

| 威胁 | 缓解 |
| --- | --- |
| 授权码拦截 | PKCE S256，强制；code TTL 60s；原子单次使用 |
| CSRF | `state` ≥128 位熵，回调严格比对 |
| 开放重定向 | `redirect_uri` 严格校验，主机/路径/scheme 固定，仅端口通配；校验失败不重定向 |
| 授权码重放 | Redis 原子 `GETDEL` |
| refresh token 泄露 | 每次轮转；检测重放即吊销整个家族 |
| 令牌类型混用 | JWS `typ` 区分 `at+jwt` 与 `sg-identity+jwt` |
| 局域网嗅探回调 | 回环服务器仅绑 `127.0.0.1` |
| 本地明文令牌 | 短 TTL + 可远程吊销 + 向用户明示 |
| 时序攻击 | `code_verifier` 与网关 token 比对均用 `subtle.ConstantTimeCompare` |

## 9. auth-service 改动清单

新增文件：

```
internal/oauth/
  registry.go     客户端策略与 redirect_uri 校验
  authorize.go    GET /oauth/authorize
  token.go        POST /oauth/token（授权码 + 刷新轮转）
  revoke.go       POST /oauth/revoke
  metadata.go     GET /.well-known/oauth-authorization-server
  store.go        Redis：code / refresh / family
  consent.go      同意页渲染
  *_test.go       单测
```

`internal/httpapi/server.go` 路由注册（免网关，与 `/.well-known/jwks.json` 同级）：

```go
// OAuth 2.0 授权服务器端点。公开客户端通过 PKCE 与 client 校验保护，
// 不适用 authenticateGateway——插件无法持有网关 token。
if s.oauth != nil {
    router.Get("/.well-known/oauth-authorization-server", s.oauth.Metadata)
    router.Get("/oauth/authorize", s.oauth.Authorize)
    router.Post("/oauth/authorize", s.oauth.ConsentSubmit)
    router.Post("/oauth/token", s.oauth.Token)
    router.Post("/oauth/revoke", s.oauth.Revoke)
}
```

`signer.go` 需支持自定义 JWS `typ` 与 `scope`/`client_id` claims。当前 `Issue` 硬编码 `typ=sg-identity+jwt`（L113），需参数化。

配置项（全部**默认关闭**，不设 `OAUTH_ENABLED` 时端点不挂载，`/oauth/*` 返回 404）：

```
OAUTH_ENABLED=true
OAUTH_ISSUER=https://shiguanglab.com        # 缺省取 PublicOrigin
OAUTH_LOGIN_URL=https://shiguanglab.com/login   # 缺省取 PublicOrigin + /login
OAUTH_CLIENT_ID=obsidian-asset-hub
OAUTH_CLIENT_NAME=知序资产中心 for Obsidian
OAUTH_CLIENT_REDIRECT_URIS=http://127.0.0.1/callback,http://[::1]/callback
OAUTH_CLIENT_SCOPES=documents:read,documents:write,offline_access
OAUTH_CLIENT_AUDIENCE=asset-hub-api
OAUTH_REQUIRED_ENTITLEMENTS=asset-hub:access
OAUTH_ACCESS_TOKEN_TTL=15m
OAUTH_REFRESH_TOKEN_TTL=720h
OAUTH_CODE_TTL=60s
OAUTH_CONSENT_TTL=10m
OAUTH_REDIS_KEY_PREFIX=auth:oauth:
```

客户端用环境变量描述，不读外部 JSON 文件：只有一个公开客户端，为它引入一套文件格式、加载与校验逻辑没有对应的需求。重定向 URI 写成**模板**——端口可省略表示任意回环端口，这也是 IPv4 与 IPv6 各列一条的原因。启动时会校验这些配置（issuer 必须是绝对 URL、client id 必须是纯 token、TTL 上限等），配置不安全则拒绝启动而不是降级运行。

## 10. 验证要点

单测：

- `redirect_uri` 校验：`http://127.0.0.1:1/callback` 通过；`http://127.0.0.1.evil.com/callback`、`http://192.168.1.5/callback`、`https://127.0.0.1/callback`、`http://127.0.0.1/other` 全部拒绝
- PKCE：正确 verifier 通过；错误、空、`plain` 方法拒绝
- code 重放：第二次兑换必须失败
- refresh 轮转：旧令牌失效；重放旧令牌导致家族全灭
- `typ` 混用：`sg-identity+jwt` 令牌调 asset-hub api 应被 OAuth 校验器拒绝

端到端：

- 浏览器未登录 → 跳登录 → 登录后回到同意页 → 授权 → 插件拿到令牌
- 无 `asset-hub:access` entitlement 的用户 → 错误页
- Web 端吊销后，插件刷新失败并提示重新登录
