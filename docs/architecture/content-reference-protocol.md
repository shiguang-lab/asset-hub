# 内部引用协议 —— 方案与决策点（第一步）

> 关联：[content-reference-gaps.md](./content-reference-gaps.md)（差距记录）。
> 本文只解决「引用协议」这件事，目标是产出一份可拍板的方案，再进入实现。
>
> **决策状态：已拍板（2026-08-17）** —— D1 接受 `asset:` 语法、D2 接受「正文为事实源 + relations 自动投影」、D3 接受「默认快照」、私有权采用「拦截提示」。实现设计见 [content-reference-implementation.md](./content-reference-implementation.md)。

## 1. 目标

在「文档正文里引用另一个资产（文档/图片/文件）」这件事上，统一三处行为：

1. **编辑器**：用户怎么输入、怎么自动补全。
2. **存储**：引用落在哪（正文文本 + 关系表），谁是事实源。
3. **渲染/发布**：阅读页怎么跳转，发布时怎么打包、怎么重写链接。

## 2. 需要决策的三件事

| # | 决策 | 选项 | 影响 |
| --- | --- | --- | --- |
| D1 | 引用语法 | `[[wiki]]` / `[文本](asset:id)` / `asset://id` / 内部路由 URL | 编辑器、渲染器、发布重写三处实现 |
| D2 | 事实源 | 正文文本（弱引用）vs 关系表（强引用） | 关系视图、反向引用、发布依赖图、权限校验的稳定性 |
| D3 | 发布语义 | 快照（bundle 自包含）vs 实时（指向对方发布 URL） | URL 稳定性、失效行为、访问统计、被引用资产更新后的联动 |

## 3. D1：引用语法

### 3.1 候选对比

| 方案 | 形态 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A. Wiki-link | `[[资产名]]` / `[[资产名\|显示文本]]` | Obsidian/Logseq 用户熟悉；编辑器可做快捷输入 | 非标准 Markdown；裸写不渲染成链接，需专门解析；按「名字」引用有重名/改名问题 |
| **B. 协议链接（推荐）** | `[显示文本](asset:<assetId>)` | 复用标准 Markdown 链接语法；`asset:` 是显式锚点，渲染/重写易识别；CodeMirror 只需加 autocomplete | `asset:` 非标准协议，脱离本平台渲染器时会被当外链 |
| C. 内部路由 URL | `[文本](/assets/:id)` | 最直观，零协议 | URL 是前端路由，跨端/发布/移动不稳定；`id` 变更即断链；无法与发布短链解耦 |
| D. 短标记 | `@asset:id` / `#asset:id` | 简短 | 需自研解析器，可读性差，与 Markdown 链接互操作差 |

### 3.2 推荐

**主语法：`[显示文本](asset:<assetId>)`（方案 B）**，理由：

- 不破坏标准 Markdown，正文在任何环境都可读。
- `asset:` 前缀是唯一、可识别的锚点，渲染层（`remark`/`marked`）只加一个协议处理器即可，发布重写时做字符串替换即可，不需要引入 wiki-link 解析器。
- 用 `assetId`（不可变主键）而非「名字」，避免重名/改名断链。

**兼容增强（可选，P1）**：编辑器内支持输入 `[[` 触发资产选择器，选中后**落盘为 `[标题](asset:<id>)`**，兼顾 Obsidian 用户习惯，但存储格式统一为 B。

> 图片引用同样用 `asset:`：`![alt](asset:<imageAssetId>)`，与链接共用同一套协议。

## 4. D2：事实源（弱引用 vs 强引用）

### 4.1 候选对比

| 方案 | 数据落点 | 优点 | 缺点 |
| --- | --- | --- | --- |
| 弱引用（仅正文） | 只存在 markdown 文本里 | 无同步问题，实现最简单 | 关系视图/反向引用/发布依赖图/权限校验都要靠「扫描正文」，每次全量扫描、易漏（图片、HTML embed、不同语法） |
| 强引用（双写） | 正文 + `relations` 表 | 关系视图、反向引用、发布依赖图、权限校验有稳定的 DB 事实源；复用现有 `references` 链路 | 双写一致性问题（增删链接都要同步） |
| **投影（推荐）** | 正文是事实源，`relations` 由后端解析正文自动维护 | 用户只关心正文；关系表是自动维护的投影，永不失配；复用现有 `references` | 需要「保存时解析 + diff 同步」一步后端逻辑 |

### 4.2 推荐：正文为事实源，`relations` 为自动投影

- 现有代码已经以 `relations` 为事实源（发布打包 `publishing.ts` 读 `references`、关系页 `asset-detail.tsx` 读 relations），继续以 `relations` 供查询/发布/权限使用，**不做第二套正文扫描机制**。
- 但写入侧改为「保存文档时自动同步」：在 `PATCH /api/v1/assets/:id`（保存内容）事务内，解析正文里的 `asset:` 引用集合，与现有 `references` 关系 diff，自动新增/删除，避免前端双写遗漏（尤其是 AI 改写、批量粘贴导致链接变化）。

同步规则：

- 正文中出现的每个 `asset:<id>` → 保证存在 `(source=本文档, target=id, relationType="references")`。
- 正文中消失的 `asset:<id>` → 删除对应 `references`（仅删除「正文引用」投影，不动人工附件上传建立的 file 引用——用 `provenance` 字段区分来源，见下）。
- 附件（file）引用继续由编辑器附件面板显式建立，`provenance: { source: "attachment" }`；正文投影用 `provenance: { source: "content-link" }`，两类可区分、可独立清理。

## 5. D3：发布语义（快照 vs 实时）

### 5.1 候选对比

| 方案 | 行为 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **快照（推荐）** | 发布时递归渲染被引用资产，放进 bundle 相对目录，重写链接 | 自包含、稳定；被引用资产删除/改权限后已发布内容不受影响；可静态托管；与现有附件打包一致 | 发布体积增大；被引用资产更新后需「重新发布」 |
| 实时 | 链接指向被引用资产的发布 URL | 自动联动最新内容 | 要求被引用资产也已发布；可见性/权限复杂；未发布/私有即断链；循环引用风险 |

### 5.2 推荐：默认快照，实时链接留作 P1

MVP 采用**快照**，理由：

- 与 PRD `FR-PUB-001`（更新内容不默认改变 URL）的语义一致：主文档 URL 稳定，内容自包含。
- 与现有附件打包（`buildAndAttachRelease` 把 file 下载进 bundle）行为一致，扩展成本最低。
- 权限/循环引用问题在快照模型下最简单（发布时一次性解析 + 校验，产物自包含）。

快照模式下的发布重写规则：

1. 发布时解析正文 `asset:` 引用 → 经 `relations`/资产表取目标资产。
2. 递归渲染目标：文档 → `refs/<assetId>/index.html`；图片/file → `refs/<assetId>/<fileName>`。
3. 重写正文：`href="asset:<id>"` → `href="refs/<id>/index.html"`；`src="asset:<id>"` → `src="refs/<id>/<fileName>"`。
4. 循环引用防护：递归时维护「已收集」集合，重复/环直接复用已生成路径。
5. manifest 增加 `references` 快照：`[{ assetId, versionId, path, kind }]`，供追溯与「引用更新后重新发布」。

## 6. 端到端数据流（推荐方案汇总）

```mermaid
flowchart LR
  E[编辑器\n[[ / asset: 自动补全] -->|落盘 [标题](asset:id)| M[正文 markdown]
  M -->|PATCH 保存| P[api: 保存内容]
  P -->|解析 asset: 引用 + diff| R[(relations\nprovenance=content-link)]
  R --> V[关系视图 / 反向引用]
  R --> PUB[发布]
  M --> PUB
  PUB -->|递归渲染 + 重写链接| B[(release bundle\nindex.html + refs/*)]
  B -->|manifest.references 快照| PUB
```

## 7. 已拍板记录（2026-08-17）

| # | 决策项 | 结论 |
| --- | --- | --- |
| D1 | 引用语法 | ✅ 接受 `[显示文本](asset:<assetId>)` 为主语法（图片同用 `![alt](asset:<id>)`） |
| D2 | 事实源 | ✅ 接受「正文为事实源、`relations` 保存时自动投影」 |
| D3 | 发布语义 | ✅ 接受「默认快照，实时链接 P1」 |
| 私有权 | 被引用资产为 `private` | ✅ **拦截并提示**（不降级、不打包） |
| 引用/附件边界 | content-link 与 attachment 并存 | 按推荐：用 `provenance.sources` 区分，二者互不干扰（实现细节见实现设计文档） |

> 附：`asset_relations` 存在 `UNIQUE(source_asset_id, target_asset_id, relation_type)`，且当前 `addRelation` 遇重不合并 provenance、也没有 `deleteRelation`。因此 D2 的「自动投影」需要在存储层补两件事：`addRelation` 合并 provenance、新增 `deleteRelation`；否则正文删掉某条引用时无法精确清理投影（会误删同名附件关系）。详见实现设计。
