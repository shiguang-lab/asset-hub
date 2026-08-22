# Asset Hub 项目长期约定

## Web 样式规范（用户明确要求，锁定）
- **优先 antd-style + Ant Design Theme Token**，禁止新增业务 `.css` / `.less` 文件或在页面入口导入项目自有 CSS。
- **组件主题外观一律走 ThemeConfig.components.* 的 Theme Token**（统一收敛在 `apps/web/src/theme/tokens.ts`），组件内 `createStyles` 不得重复写 Token 已覆盖的属性（否则会覆盖 Token 导致主题失效）。
- **关键坑**：antd-style `createStyles` 回调的 token 是「全局 AliasToken」，**不含组件专属 Token**（如 `Tabs.itemColor`、`titleFontSize`）。组件专属外观必须配在 tokens.ts，createStyles 只兜底 Token 表达不了的（结构/伪元素/动画/徽标等）。
- 组件内聚样式用 `createStyles`；跨组件基础样式/第三方覆盖用 `createGlobalStyle`，由 ThemeProvider 统一挂载，不建单体 styles.css。
- 历史遗留：`apps/web/src/styles/*.ts` 里的 createGlobalStyle 业务样式属旧代码，新代码不得继续新增。
- 落地范式：`apps/web/src/shared/AppTabs.tsx` + `docs/apps/web.md` 3.3.1。
- 统一 Tabs：所有页面用 `shared/AppTabs.tsx`（antd Tabs 封装，含加粗不抖动占位撑宽），不要自研 role="tab" 按钮组。

## 本地调试 web
- broker 模式：`.env.local` 配 `ASSET_HUB_LOCAL_BROKER_ENABLED=true` + 线上账号密码 + `ASSET_HUB_AUTH_TARGET=https://shiguanglab.com`；接口走线上需 `ASSET_HUB_LOCAL_API_TARGET=http://100.87.115.78:3701`。
- 启动命令：`cd apps/web && node node_modules/vite/dist/node/cli.js --port 3000 --strictPort`（勿用 `node .bin/vite`，那是 shell 脚本）。
- 授权由 broker 向 shiguanglab.com 换 identity token 注入 x-sg-identity 头，线上 API JWKS 校验；dev 强制监听 127.0.0.1。
