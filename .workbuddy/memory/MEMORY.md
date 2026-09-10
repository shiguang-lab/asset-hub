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
- `pnpm` 不在 PATH；corepack/npx 拉起来的 pnpm 会撞 pnpm store 陈旧 symlink 报 `CODEBUDDY_BROKER_DENY EEXIST`。改用根目录已有二进制：`./node_modules/.bin/tsc|vitest|turbo`。
- 单包测试：`cd <pkg> && ../../node_modules/.bin/vitest run src`（turbo 需要 pnpm 才能跑，会失败）。
- 缺依赖时用 `curl https://registry.npmjs.org/<pkg>/-/<pkg>-<ver>.tgz | tar xz` 解到目标 `node_modules/`；`node_modules/` 已被 gitignore，不影响仓库。
- 需要 `esbuild` 时从 `node_modules/.pnpm/esbuild@<ver>/node_modules/esbuild` 软链。注意相对路径层级：从 `apps/*/node_modules/` 起是 `../../../node_modules/...`（两层会指到 `apps/node_modules`）。
- Go 不在 PATH：`export PATH=$PATH:/usr/local/go/bin`。

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

## 本地调试 web
- broker 模式：`.env.local` 配 `ASSET_HUB_LOCAL_BROKER_ENABLED=true` + 线上账号密码 + `ASSET_HUB_AUTH_TARGET=https://shiguanglab.com`；接口走线上需 `ASSET_HUB_LOCAL_API_TARGET=http://100.87.115.78:3701`。
- 启动命令：`cd apps/web && node node_modules/vite/dist/node/cli.js --port 3000 --strictPort`（勿用 `node .bin/vite`，那是 shell 脚本）。
- 授权由 broker 向 shiguanglab.com 换 identity token 注入 x-sg-identity 头，线上 API JWKS 校验；dev 强制监听 127.0.0.1。
