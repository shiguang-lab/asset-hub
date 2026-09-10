# 插件工程架构

## 1. 目录结构

```
apps/obsidian-plugin/
├── docs/                        设计文档（本目录）
├── scripts/
│   └── deploy-local.mjs         拷贝产物到测试 vault
├── src/
│   ├── main.ts                  入口，继承 Plugin，装配所有部件
│   ├── settings.ts              设置数据结构与默认值
│   ├── logger.ts                控制台日志（受 debugLogging 开关控制）
│   ├── auth/
│   │   ├── oauth-client.ts      授权码 + PKCE 编排 + RFC 8414 元数据发现
│   │   ├── pkce.ts              verifier / challenge 生成
│   │   ├── loopback-server.ts   127.0.0.1 回调服务器
│   │   └── token-store.ts       令牌持久化 + 单飞刷新
│   ├── api/
│   │   ├── client.ts            HTTP 客户端（认证注入、401 重试、错误映射）
│   │   ├── documents.ts         文档 CRUD
│   │   ├── types.ts             与服务端契约对齐的最小类型镜像
│   │   └── events.ts            SSE（fetch + ReadableStream）
│   ├── obsidian/
│   │   └── vault-adapter.ts     VaultAdapter 接口 + Obsidian 实现
│   ├── sync/
│   │   ├── engine.ts            调度：先拉后推、并发控制、冲突裁决
│   │   ├── index-store.ts       sync-index.json 读写与损坏恢复
│   │   ├── differ.ts            三方比对（纯函数）
│   │   ├── conflict.ts          冲突副本命名
│   │   ├── hash.ts              与服务端一致的 sha256:<hex>
│   │   ├── path-mapper.ts       remotePath ↔ vaultPath 转换
│   │   ├── types.ts             快照 / 绑定 / 动作的共享类型
│   │   └── watcher.ts           vault 事件监听 + 防抖
│   ├── test/
│   │   ├── obsidian-stub.ts     vitest 下替代 obsidian 模块
│   │   └── memory-index-storage.ts
│   └── ui/
│       ├── settings-tab.ts      设置面板
│       ├── status-view.ts       侧边栏同步状态
│       └── status-bar.ts        状态栏指示（文案为纯函数）
├── styles.css                   状态栏与面板样式（走 Obsidian 主题变量）
├── manifest.json
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── esbuild.config.mjs
└── README.md
```

文案直接内联在组件里，不设 `i18n.ts`：插件目前只有中文界面，抽象出一层字典只会增加一层间接。

## 2. 技术约束

Obsidian 插件的运行环境有几个硬性限制，直接影响实现选择：

| 约束 | 影响 | 应对 |
| --- | --- | --- |
| 必须打包成单文件 `main.js` | 不能用 ESM 多文件分发 | esbuild bundle，`format: cjs` |
| `obsidian` 模块为外部依赖 | 不可打入 bundle | esbuild `external: ["obsidian"]` |
| Electron 环境，可用 Node API | 能起 http 服务器（回环回调依赖此） | `external` 需列全 node 内建模块 |
| `EventSource` 不支持自定义头 | SSE 无法传 `Authorization` | `fetch` + `ReadableStream` 手动解析 |
| 无系统钥匙串 API | 令牌只能明文存 `data.json` | 短 TTL + 可远程吊销 + 向用户明示 |
| 移动端无 Node API | 回环服务器不可用 | `manifest.json` 设 `isDesktopOnly: true` |

`isDesktopOnly: true` 是必须的。OAuth 回环回调依赖本地 HTTP 服务器，移动端无法实现。

## 3. manifest.json

```json
{
  "id": "asset-hub-sync",
  "name": "知序资产中心",
  "version": "0.1.0",
  "minAppVersion": "1.5.0",
  "description": "在 Obsidian 中管理与同步知序资产中心的文档。",
  "author": "Shiguang",
  "isDesktopOnly": true
}
```

## 4. 构建

不接入 monorepo 的 turbo `build`——插件产物需要输出到 vault 才能测试，与其他 app 的 `dist/**` 约定不同。保持独立脚本。

```js
// esbuild.config.mjs
import esbuild from "esbuild";
import builtins from "builtin-modules";

const prod = process.argv.includes("--production");

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // obsidian 由宿主注入；node 内建模块在 Electron 中直接可用，均不可打包
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2022",
  platform: "node",
  sourcemap: prod ? false : "inline",
  minify: prod,
  outfile: "main.js",
  logLevel: "info",
  ...(prod ? {} : { watch: true }),
});
```

```json
{
  "name": "@shiguang/obsidian-plugin",
  "private": true,
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc --noEmit && node esbuild.config.mjs --production",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "deploy:local": "node scripts/deploy-local.mjs"
  },
  "devDependencies": {
    "obsidian": "latest",
    "builtin-modules": "^4.0.0",
    "esbuild": "^0.25.0",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`deploy:local` 把 `main.js` / `manifest.json` / `styles.css` 拷到测试 vault 的 `.obsidian/plugins/asset-hub-sync/`，配合 Obsidian 的 Reload 命令快速迭代。目标路径读环境变量 `OBSIDIAN_VAULT_PATH`。

### 4.1 纯函数优先，便于测试

`differ.ts`、`hash.ts`、`path-mapper.ts`、`conflict.ts`、`index-store.ts`、`status-bar.ts`、`pkce.ts`、`token-store.ts`、`events.ts` 都不引用 `obsidian` 模块，可在 vitest 中直接单测。这是刻意的划分——同步逻辑的正确性最关键，而依赖 Obsidian API 的部分难以自动化测试。

`engine.ts` 只通过接口使用 vault，因此也能测：`vitest.config.ts` 把 `obsidian` 别名到一个桩模块，测试用内存实现替换 `VaultAdapter` 与 `DocumentsApi`，就能在无 Obsidian 实例的情况下跑完整的同步轮次。

```ts
export interface VaultAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(root: string): Promise<VaultEntry[]>;
  trash(path: string): Promise<void>;
  ensureFolder(path: string): Promise<void>;
  onModify(handler: (path: string) => void): () => void;
  onDelete(handler: (path: string) => void): () => void;
  onRename(handler: (path: string, previousPath: string) => void): () => void;
}
```

没有 `rename`：本地重命名不需要显式操作 vault——文件已经在新路径上，插件只要把云端文档移动过去。删除一律走 `trash`，软删让错误的同步决定可恢复。

## 5. 设置项

```ts
interface PluginSettings {
  // 服务端
  serverUrl:        string;   // https://shiguanglab.com
  apiUrl:           string;   // https://doc.shiguanglab.com/api/v1

  // 同步
  syncRoot:         string;   // 默认「拾光资产中心」
  syncEnabled:      boolean;
  autoSyncInterval: number;   // 分钟，默认 5，0 = 关闭
  syncOnStartup:    boolean;  // 默认 true
  realtimeEnabled:  boolean;  // SSE，默认 true

  // 删除行为（保守默认）
  deleteRemoteOnLocalDelete: boolean;   // 默认 false
  deleteLocalOnRemoteDelete: boolean;   // 默认 true

  // 界面
  showStatusBar:    boolean;
  debugLogging:     boolean;  // 默认 false
}
```

`apiUrl` 含版本段（`/api/v1`），与 Web 端的 `API_BASE` 一致；请求路径因此从 `/assets` 起算，而不是 `/api/v1/assets`。

`deleteRemoteOnLocalDelete` 默认关闭。误删云端文档不可逆（虽有 30 天回收站，但用户未必知道），而留一份孤儿数据无害。

首期只同步 markdown。`type = html` 的文档不参与，因此没有 `syncHtmlDocuments` 开关——等文档中心真的产生 HTML 资产再说。

### 5.1 设置面板结构

```
账号
  [未登录]  → 「使用知序账号登录」按钮
  [已登录]  → 显示名 + 已授权权限 + 「退出登录」
              提示：令牌以明文存于 data.json，请勿将插件目录提交到公开仓库

同步
  同步根目录       [拾光资产中心      ]
  启用同步         [✓]
  启动时同步       [✓]
  自动同步间隔     [5 分钟            ]   0 = 关闭定时同步
  实时更新（SSE）  [✓]

删除行为
  本地删除时同步删除云端   [ ]   ⚠ 开启后在 Obsidian 删除文件会软删云端文档
  云端删除时删除本地       [✓]

界面
  显示状态栏      [✓]
  输出调试日志    [ ]   在开发者控制台打印每次同步的比对结果

高级
  服务地址        [https://shiguanglab.com]
  接口地址        [https://doc.shiguanglab.com/api/v1]
  [重建]          [同步]
```

填写的是纯文本而非下拉框：Obsidian 的 `Setting` 没有数字输入控件，而「分钟数」用一个数字框比一个下拉列表更省事。回车或失焦即保存。

## 6. 命令

| 命令 | 说明 |
| --- | --- |
| 立即同步 | 手动触发完整同步轮次，完成后提示结果 |
| 登录知序账号 | OAuth 流程（已登录时该命令不出现） |
| 退出登录 | 清除本地令牌并请求服务端吊销（未登录时不出现） |
| 打开同步状态面板 | 侧边栏面板，含冲突裁决 |
| 在资产中心打开当前文档 | 浏览器打开对应 Web 页面（未同步的文件不出现） |
| 重建同步索引 | 索引损坏时的恢复入口 |

侧边栏面板与状态栏徽标都可点击。「登录 / 退出登录」用 `checkCallback` 按登录态互斥显示，避免菜单里同时出现两个相反的条目。

## 7. 错误呈现

| 情形 | 呈现 |
| --- | --- |
| 未登录 | 状态栏「－ 未登录」；手动同步时提示并打开设置 |
| 网络不可达 | 状态栏「○ 离线」，轮次静默失败，不弹通知（避免骚扰） |
| 冲突 | 通知栏「『路径』存在冲突，已在同目录生成副本，请在面板中裁决」+ 状态栏「⚠ N 个冲突」+ 面板列出 |
| 单个文档同步失败 | 通知栏「N 项同步操作失败，详见控制台」（warning），轮次继续处理其余文档 |
| scope 不足 403 | 通知栏「缺少写入权限，请重新登录并授权」 |
| 服务端 5xx / 429 | 状态栏「✕ 同步失败」，面板显示错误详情；此时不弹通知 |
| 本地删除未同步的文档 | 通知栏「云端已删除『路径』，但本地仍有未同步的修改，已保留本地文件」 |

原则：**可自动恢复的不打扰用户**（网络抖动、乐观锁竞争、令牌刷新），**需要用户决策的必须显式提示**（冲突、权限）。

失败按影响面分两级：整轮失败（列举文档就失败了）会中断并报错；单个文档失败只记入控制台并以 warning 汇总，因为一篇文档写不进去不该阻塞其余几十篇。`ASSET_PATH_CONFLICT`（409）和 401 是例外——它们意味着后续动作也会同样失败，因此直接中断整轮。

401 处理上，API 客户端只重试一次：刷新令牌后仍 401，说明会话真的没了，再试只会浪费一轮。

## 8. 状态栏

```
✓ 已同步 · 3 分钟前
⟳ 同步中 12/48
⚠ 2 个冲突
✕ 同步失败
○ 离线
– 未登录
```

点击打开侧边栏状态面板。

## 9. 首次使用流程

1. 安装插件，打开设置，按需修改「同步根目录」
2. 点「使用知序账号登录」→ 系统浏览器 → 同意授权 → 回到 Obsidian
3. 登录成功即自动跑一轮，云端文档落到同步根目录下
4. 状态栏显示「✓ 已同步 · 刚刚」

没有独立的「确认导入」向导。首轮拉取与后续轮次走同一条代码路径，多一个向导等于多一条需要单独维护和测试的分支，而同步根本身已是增量且可重复的——用户不满意直接删掉文件夹再同步一次即可。

## 10. 与 monorepo 的关系

| 项 | 决定 |
| --- | --- |
| `pnpm-workspace.yaml` | 已含 `apps/*`，自动纳入，无需改动 |
| turbo `build` | 插件的 `build` 输出 `main.js` 而非 `dist/**`，不参与 turbo 缓存。`turbo.json` 无需改动，插件的 build 仅在本地/发布时手动执行 |
| `@shiguang/contracts` | **不复用**。contracts 依赖 zod 且含大量非文档 schema，打进插件会显著增大体积。插件内自维护最小类型定义 |
| 类型一致性 | 靠单测保障：插件的类型定义与 contracts 的字段名对齐，用一个 fixture 校验 |

不复用 contracts 是取舍。复用能保证类型同步，但插件产物体积敏感（用户要下载），而文档相关字段很少且稳定。

## 11. 发布

Obsidian 社区插件市场需要：

- GitHub 仓库（当前在 monorepo 内，发布时需 subtree 或独立仓库）
- Release 附带 `main.js`、`manifest.json`、`styles.css`
- 版本号与 `manifest.json` 一致的 tag

首期先做**手动安装**分发（把三个文件放进 vault 插件目录），验证稳定后再考虑上架市场。上架涉及独立仓库拆分，不在本轮范围。

## 12. 实施阶段

| 阶段 | 内容 | 可验证结果 |
| --- | --- | --- |
| P1 | 骨架 + 设置面板 + `manifest.json` + 构建 | 插件能在 Obsidian 加载，设置面板可见 |
| P2 | OAuth 登录（依赖 auth-service AS 就绪） | 能登录，设置面板显示用户名 |
| P3 | API 客户端 + 只读拉取 | 云端文档能落地到 vault |
| P4 | 本地变更检测 + 推送 | Obsidian 编辑能同步到云端 |
| P5 | 冲突处理 + 状态面板 | 双改场景生成冲突副本，面板可裁决 |
| P6 | SSE 实时 + 重命名移动 + 删除 | 全功能 |

P1 不依赖服务端改动；P2 依赖 01 章的 auth-service 改造；P3 依赖 03 章的 `path` 字段。

P6 里的「重命名移动」没有用到 `since`：每轮列举全部文档，靠索引判定变更。服务端支持 `since`（03 章 §2），但增量窗口要求插件自己维护水位线，而删除是以「缺席」表达的，窗口扫描仍得兜底重扫，换来的复杂度大于它省下的那点流量。详见 [02-sync-design.md](./02-sync-design.md)。

## 13. 验证

```bash
cd apps/obsidian-plugin
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # typecheck + esbuild 打包 main.js
OBSIDIAN_VAULT_PATH=/path/to/vault pnpm deploy:local
```

单测覆盖不依赖 Obsidian 实例的部分：三方比对矩阵（含重命名、路径冲突、删除策略）、内容哈希与路径规范化、索引读写与损坏恢复、冲突副本命名、令牌单飞刷新、SSE 帧解析、状态栏文案，以及用内存 vault + 假 API 跑通的完整同步轮次（含先拉后推顺序、冲突保留与裁决、重命名不产生重复文档）。
