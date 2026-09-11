# obsidian-plugin

知序资产中心的 Obsidian 插件。在 Obsidian 内管理与同步文档中心。

**范围**：仅文档中心（`type = document | html`）。不含调研、演示、数据集、图表、知识库问答。

## 设计文档

| 文档 | 内容 |
| --- | --- |
| [05-product-design.md](./docs/05-product-design.md) | 产品设计：按篇关联、文档菜单、自动双向同步、内嵌知序与发布 |
| [00-overview.md](./docs/00-overview.md) | 现状勘察结论、架构决策、系统边界、实施顺序 |
| [01-oauth-design.md](./docs/01-oauth-design.md) | 目标 OAuth 设计：设备授权、轮询、令牌生命周期、内嵌页面自动登录 |
| [02-sync-design.md](./docs/02-sync-design.md) | 同步状态机、三方比对、冲突矩阵、重命名与删除语义 |
| [03-server-changes.md](./docs/03-server-changes.md) | 服务端改动清单：迁移器、`path` 字段、增量同步、Web 目录迁移 |
| [04-plugin-architecture.md](./docs/04-plugin-architecture.md) | 工程结构、构建、设置项、发布 |

## 构建与运行

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # typecheck + esbuild 打包成 main.js

# 拷到测试 vault，然后在 Obsidian 里「重新加载插件」
OBSIDIAN_VAULT_PATH=/path/to/vault pnpm deploy:local
```

`manifest.json` 设了 `isDesktopOnly: true`：插件使用 Electron 系统凭据保护和内嵌知序页面。

## 实现范围

| 能力 | 状态 |
| --- | --- |
| OAuth 设备授权登录、单飞刷新、退出并吊销 | 完成；浏览器只访问 `shiguanglab.com`，无本地回调页 |
| 按篇关联与三方比对同步（拉取 / 推送 / 冲突） | 完成；不会创建或扫描专用 Vault 目录 |
| 冲突副本生成与面板裁决 | 完成 |
| 文档菜单、侧边知序页面、发布弹窗入口、同步状态面板 | 完成 |
| SSE 实时触发、vault 事件防抖触发、定时同步 | 完成 |
| `type = html` 文档同步 | 未做，只同步 markdown |
| 上架 Obsidian 社区市场 | 未做，见 04 章 §11 |

服务端前置改动（迁移执行器、`assets.path`、OAuth 授权服务器、OAuth token 校验）已随 `packages/database`、`packages/contracts`、`apps/api`、auth-service 落地，详见 [03-server-changes.md](./docs/03-server-changes.md)。
