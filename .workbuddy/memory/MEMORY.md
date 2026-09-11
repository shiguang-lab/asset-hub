# Asset Hub 项目长期约定

## Web 样式规范（用户明确要求，锁定）
- **优先 antd-style + Ant Design Theme Token**，禁止新增业务 `.css` / `.less` 文件或在页面入口导入项目自有 CSS。
- **组件主题外观一律走 ThemeConfig.components.* 的 Theme Token**（统一收敛在 `apps/web/src/theme/tokens.ts`），组件内 `createStyles` 不得重复写 Token 已覆盖的属性（否则会覆盖 Token 导致主题失效）。
- **关键坑**：antd-style `createStyles` 回调的 token 是「全局 AliasToken」，**不含组件专属 Token**（如 `Tabs.itemColor`、`titleFontSize`）。组件专属外观必须配在 tokens.ts，createStyles 只兜底 Token 表达不了的（结构/伪元素/动画/徽标等）。
- 组件内聚样式用 `createStyles`；跨组件基础样式/第三方覆盖用 `createGlobalStyle`，由 ThemeProvider 统一挂载，不建单体 styles.css。
- 历史遗留：`apps/web/src/styles/*.ts` 里的 createGlobalStyle 业务样式属旧代码，新代码不得继续新增。
- 落地范式：`apps/web/src/shared/AppTabs.tsx` + `docs/apps/web.md` 3.3.1。
- 统一 Tabs：所有页面用 `shared/AppTabs.tsx`（antd Tabs 封装，含加粗不抖动占位撑宽），不要自研 role="tab" 按钮组。

## 构建与验证（沙箱内 pnpm 不可用）
- `pnpm` 不在 PATH；corepack/npx 拉起来的 pnpm 会撞 pnpm store 陈旧 symlink 报 `CODEBUDDY_BROKER_DENY EEXIST`。日常校验改用根目录已有二进制：`./node_modules/.bin/tsc|vitest|turbo`。
- **但 pnpm 本体可以自取**（网络通时）：`curl -sSL -o pnpm.tgz https://registry.npmjs.org/@pnpm/macos-x64/-/macos-x64-<ver>.tgz && tar xzf pnpm.tgz`，可执行文件在 `package/pnpm`。配合 `--store-dir /tmp/pnpm-store` 就不会碰仓库内 `.pnpm-store`。
- **只改 lockfile 用 `pnpm install --lockfile-only`**：不落 node_modules、不触发 broker 拦截，改完 diff 干净。这是新增 workspace 包后同步 `pnpm-lock.yaml` 的唯一可行路径（漏了它 `--frozen-lockfile` 会直接让镜像构建失败）。
- 单包测试：`cd <pkg> && ../../node_modules/.bin/vitest run src`（turbo 需要 pnpm 才能跑，会失败）。
- 缺依赖时用 `curl https://registry.npmjs.org/<pkg>/-/<pkg>-<ver>.tgz | tar xz` 解到目标 `node_modules/`；`node_modules/` 已被 gitignore，不影响仓库。
- 需要 `esbuild` 时从 `node_modules/.pnpm/esbuild@<ver>/node_modules/esbuild` 软链。注意相对路径层级：从 `apps/*/node_modules/` 起是 `../../../node_modules/...`（两层会指到 `apps/node_modules`）。
- Go 不在 PATH：`export PATH=$PATH:/usr/local/go/bin`。
- 回归跑全量测试时要**逐个包串行**：并排跑多个 vitest 会 SIGTERM（exit 137）。`apps/web` 的 typecheck 需要 `NODE_OPTIONS=--max-old-space-size=6144`。

## 文档目录模型（真源约定，锁定）
- `asset.path` 是**含末段文件名的完整逻辑路径**、不含扩展名：`产品/需求文档/PRD`；根目录文档只有一段（`README`）；空串 = 未归类。服务端唯一（同 workspace 同 path 冲突 → 409 `ASSET_PATH_CONFLICT`）。
- **目录不是实体**，是 `path` 去掉末段后的各级前缀投影，节点 id 就是目录路径本身。没有空目录。
- 纯逻辑在 `apps/web/src/shared/document-path.ts`（`deriveFolderTree` / `isInFolder` / `rewriteFolderPrefix` / `ROOT_FOLDER_ID`），别再在页面里手写路径拼接。
- 服务端 `collectImportFolders`（`apps/api/src/modules/assets.ts`）与 `deriveFolderTree` 是同一算法，改动必须同步。
- 目录级操作没有专用接口，一律归结为批量 `PATCH /assets/:id` 写 `path`（带 `If-Match`）：改名 = 换前缀；删除 = 上提到父目录。
- 路径规范化统一 NFC，段两侧 trim，禁 `.`/`..`。macOS 上传的中文路径是 NFD，不统一会分叉出两条目录。

## Obsidian 插件（apps/obsidian-plugin）
- 构建：`node esbuild.config.mjs --production` → `main.js`（cjs，`external: ["obsidian","electron",...builtin-modules]`）。
- 测试：`vitest.config.ts` 把 `obsidian` 别名到 `src/test/obsidian-stub.ts`，因此 `sync/engine.ts` 能用内存 vault + 假 DocumentsApi 跑完整轮次。新增依赖 `obsidian` 模块的模块时，若测试要 import，得先给 stub 补导出。
- `manifest.json` 必须 `isDesktopOnly: true`（OAuth 回环回调依赖 Node `http`）。
- 不复用 `@shiguang/contracts`：插件产物体积敏感，`src/api/types.ts` 自维护最小镜像。
- 索引文件 `sync-index.json` 存于插件目录，`IndexStorage` 注入以便测试；**以 `vaultPath` 为键**，重命名时必须整条记录搬走。
- 内容哈希必须与服务端一致：`sha256:<hex>`，且**上传前先做 CRLF→LF 规范化**（否则两端算不出同一个值）。

## 发布流程（锁定：只有 tag 触发）
- **`main` 不跑任何工作流**。两条工作流都只在 `push: tags: ["v*"]` 触发：
  - `.github/workflows/docker-publish.yml`：6 个 target 单作业多平台 buildx，每个 tag 推 `X.Y.Z` + `vX.Y.Z` + `sha-<12>` + `latest`（每 tag 都覆盖 latest，不做最高 semver 判断）。
  - `.github/workflows/obsidian-plugin-release.yml`：装依赖 → **断言 tag 版本 == `manifest.json` version**（不一致就失败，Obsidian 靠这个认更新）→ 测试 → 构建 → `gh release create` 挂 `main.js`/`manifest.json`/`styles.css`。
- 插件 `main.js` 是构建产物，已 gitignore（`apps/obsidian-plugin/.gitignore`），**不要入库**；分发走 Release 附件或本地 `deploy:local`。
- 新增 workspace 包后必须同步三处，否则 tag 构建会挂：①`pnpm install --lockfile-only` 更新 lockfile importer；②Dockerfile `node-deps` 阶段补 `COPY <pkg>/package.json`（该阶段逐个列举 workspace 清单，`apps/*` 的 glob 不生效）；③若新包引入 `strict-peer-dependencies` 不满足的 peer，加 `pnpm.peerDependencyRules.allowedVersions`（`obsidian` 精确锁 CodeMirror peer 就是这种情况，实际不打包故放行）。
- `pnpm/action-setup` **不要写 `version:`**，仓库 `packageManager` 字段已声明 pnpm 版本，同时写会报「Multiple versions of pnpm specified」。
- **action 大版本必须 ≥ 各仓库的「Node 24 分界版本」**，否则报 Node 20 弃用告警（GitHub 2025-09-19 起）。实测分界：`actions/checkout` v5、`actions/setup-node` v5、`pnpm/action-setup` v5、`docker/login-action` v4、`docker/setup-buildx-action` v4、`docker/setup-qemu-action` v4、`docker/build-push-action` v7（v7 起 `node24`）。当前锁定：v7 / v7 / v6 / v4 / v4 / v4 / v7。
- `actions/setup-node@v5+` 的自动缓存只对 npm 生效（v5 曾对 `packageManager` 全量自动缓存，v6 收紧为仅 npm），pnpm 必须显式 `cache: pnpm`，且该步要排在 `pnpm/action-setup` 之后。
- **已发布的 tag 不能再重指**：`obsidian-plugin-release.yml` 最后一步是无 `--clobber` 的 `gh release create`，同名 release 已存在会直接失败。
- **Obsidian 插件登录的两个线上前置**（2026-09-10 现状）：①auth-service 的 OAuth 端点（`/.well-known/oauth-authorization-server`、`/oauth/*`）代码已在 main（tag v0.1.0），但线上跑的是旧镜像，访问返回 SPA HTML——插件登录报 `Unexpected token '<'` 就是它；②`doc.shiguanglab.com` 的 edge forward-auth 只认浏览器 session，不认 OAuth Bearer（带假 token 也 `401 session_missing`），插件登录打通后同步请求仍会被网关拦，需要 edge 侧对 `/api/v1/*` 放行 Bearer（api 侧已支持 `at+jwt` 校验）。域名分工：serverUrl=`https://shiguanglab.com`（授权服务器），apiUrl=`https://doc.shiguanglab.com/api/v1`（默认值已修正，曾错写成 shiguanglab.com/api/v1）。
- 本地安装插件到 vault：`OBSIDIAN_VAULT_PATH=<vault> node scripts/deploy-local.mjs`（拷 main.js/manifest.json/styles.css 到 `.obsidian/plugins/asset-hub-sync/`）。本机 vault 是 `/Users/yanxianliang/overseas/pd-atlas`。
- biome 要显式排除构建产物：`apps/obsidian-plugin/main.js` 与 `**/.next`；否则 `biome check .` 会被打包产物灌进 9 万条噪音。

## 已知存量问题（非本次引入，未处理）
- `pnpm check` 目前在 main 上就是红的：`apps/api/src/{internal/routes.ts,modules/comments.ts,platform/render.ts}`、`apps/worker/src/workflows/presentation*.ts`、`apps/web/public/presentation-player.js`、`packages/database/src/db.ts`、`skills/seed-skills.mjs` 有 lint/format 问题（多数 `biome check --write` 可自动修）；另有 `.codeartsdoer/temp/` 等工具目录未纳入 biome 排除。

## 本地调试 web
- broker 模式：`.env.local` 配 `ASSET_HUB_LOCAL_BROKER_ENABLED=true` + 线上账号密码 + `ASSET_HUB_AUTH_TARGET=https://shiguanglab.com`；接口走线上需 `ASSET_HUB_LOCAL_API_TARGET=http://100.87.115.78:3701`。
- 启动命令：`cd apps/web && node node_modules/vite/dist/node/cli.js --port 3000 --strictPort`（勿用 `node .bin/vite`，那是 shell 脚本）。
- 授权由 broker 向 shiguanglab.com 换 identity token 注入 x-sg-identity 头，线上 API JWKS 校验；dev 强制监听 127.0.0.1。
- **边缘网关真源**：doc/shiguanglab 域名的 Caddyfile 真源在 `shiguang/deploy/access-gateway/Caddyfile`（独立 deploy 仓库），NAS 落地 `/volume1/docker/shiguang-deploy/access-gateway/`，发布跑 `deploy.sh`（validate→备份→重建→健康断言）。改边缘路由不要改 `shiguang/access-gateway` 代码仓库里的副本（已落后）。
- **原生客户端 API 鉴权链路**：`Authorization: Bearer`（at+jwt）在边缘跳过 forward_auth 直透 `asset-hub-api:3001`，API 用 JWKS 自校验（`apps/api/src/platform/identity.ts` + `bootstrap/app.ts` 的 oauthVerifier）；无 Bearer 仍走 forward_auth（浏览器 session）。OAuth 端点（`/.well-known/oauth-authorization-server`、`/oauth/*`）在 shiguanglab.com host 直连 auth-service，不剥 Cookie、不加网关 token。

## 本地调试 web
- **网关配置只认一份**：唯一真源 `shiguang/deploy/access-gateway/Caddyfile`。源码仓库 `shiguang/access-gateway` 的 Caddyfile 仅是镜像内嵌兜底（被 NAS 挂载覆盖），已同步为真源逐字节一致，改路由永远只改 deploy 仓库。NAS 目录已清理散落 `Caddyfile.bak.*`，历史备份统一在 `backups/`（deploy.sh 自动生成）。
