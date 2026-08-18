# 内容引用、导入与发布打包 —— 现状与差距记录

> 记录时间：2026-08-17
> 触发来源：分享/发布弹窗审查后，发现「文档引用文档 / 内容插入链接 / 发布时一起发布」尚未形成完整设计。
> 配套文档：[content-reference-protocol.md](./content-reference-protocol.md)（第一步：内部引用协议方案）。

## 1. 结论摘要

「导入文档 → 正文引用其他文档/图片 → 发布时把这些依赖一起打包」这条链路目前没有打通：

- **导入**：只支持 `.md/.markdown/.txt` 纯文本，不提取正文里的图片与相对资源，`refs` 恒为空。
- **引用**：编辑器没有插入内部资产链接的能力，只能手写裸 Markdown 链接；插入后也不写关系表。
- **发布**：只打包单资产 + `file` 型附件，不递归打包被引用文档、不重写内部链接、不打包正文内嵌图片。

数据模型层面（`relations` 表、`content.refs`、版本、release manifest）已铺了基础，但「内容级引用」这条主线没有打通。

## 2. 数据模型现状（根因）

当前有两套并存的「引用」，互不相通：

| 层 | 字段/表 | 现状 | 问题 |
| --- | --- | --- | --- |
| 内容二进制引用 | `AssetContent.refs[]`（`packages/contracts/src/index.ts:166-182`） | 只存 `objectKey/role/hash/size/mediaType`，**没有 assetId** | 只能表示「引用了某个 S3 对象」，不能表示「引用了某个文档资产」 |
| 资产间关系 | `relations` 表 + `relationTypeSchema`（7 种，`index.ts:80-89`） | 表结构齐全，但**代码里实际只写了 `references` 一种**（全仓只有 `editor.tsx` 附件上传 1 处） | 关系能力 90% 是「死」的 |

`references` 这一种目前只被用作「文档 → file 附件」；文档 → 文档、文档 → 图片、报告 → Source 都没有写入路径。`asset-detail.tsx:387` 的「关系」页是只读展示，空态文案写着「由文档生成演示、报告引用来源等操作会在这里建立关系」，但这些操作并不存在。

## 3. 差距一：文档导入

现状（`apps/api/src/modules/assets.ts`）：

- `POST /api/v1/assets/documents/import`（`assets.ts:162-199`）
- `parseImportedDocumentFile`（`assets.ts:587-610`）：只支持 `.md/.markdown/.txt`、≤5MB、纯文本，`content.refs` 恒为 `[]`。

需求侧：PRD 2.1 明确 File 类型 = 「PDF / Office / 图片」，价值主张是「文档在线化」。

| # | 缺口 | 说明 |
| --- | --- | --- |
| 1 | 格式 | Word / PDF / HTML / 图片不能导入（`IMPORTED_DOCUMENT_EXTENSIONS` 只有三种文本格式） |
| 2 | 富资源丢失 | 导入的 Markdown 里 `![图](./assets/x.png)` 相对图片路径不提取、不上传，`refs` 恒空 → 导入后图片 404 |
| 3 | 无批量/目录导入 | 一个 md + 它的图片目录（Obsidian/Typora 典型结构）没有打包导入能力 |
| 4 | 无来源溯源 | `sourceType: "upload"` 但未保存原始文件名/大小/哈希等 provenance，事后不可追溯（`relations` 有 `provenance` 字段却没用上） |

## 4. 差距二：文档引用文档 / 内容插入链接

现状：

- 编辑器是 CodeMirror + 裸 Markdown（`apps/web/src/features/documents/editor.tsx`），**没有**插入资产链接、`@引用`、`[[wiki-link]]`、资产选择器或自动补全（全仓唯一「选择资产」在知识库来源 `knowledge.tsx:1129`）。
- 用户只能手写 `[标题](url)`。
- 阅读/发布渲染（`shared/markdown.tsx`、`platform/render.ts:renderMarkdownHtml`）对 `<a href>` 原样渲染，不认识任何内部引用语法。
- 插入链接**不写 relations 表**。

需求侧：PRD 只有 `FR-DOC-002`（Image / HTML Embed，**未提内部文档链接**）、`20.2 Asset Relation`、P1 的 `FR-ASSET-006` 关系视图。这是「设计缺口」而非单纯实现缺口：

| # | 缺口 | 说明 |
| --- | --- | --- |
| 1 | 引用协议未定义 | 需要定一个语法/协议（`[[资产名]]`、`@[标题](asset:id)`、`asset://id` …），决定编辑器、渲染、发布重写三处怎么对齐 |
| 2 | 是否落关系表未定义 | 正文插链接是「弱引用」（只改文本）还是「强引用」（同时写 `relations`，进入关系视图/发布依赖图）？不双写则 `FR-ASSET-006` 永远空 |
| 3 | 反向引用/失效提示缺失 | 关系视图只有 out/in 展示，没有「哪些文档引用了我」「链接是否失效」等生产必需能力 |

## 5. 差距三：发布时「一起发布」

现状（`apps/api/src/modules/publishing.ts` 的 `buildAndAttachRelease`（`publishing.ts:226-359`）+ `platform/render.ts`）：

- 只打包**单个资产**：markdown/html/presentation → `index.html`（+`index.md`）+ 主 blob。
- 「附件」= `listRelations` 里 `references` → **file 型**资产，下载进 bundle 并注入下载按钮。
- `renderMarkdownHtml` 只是 `marked.parse`，**不重写任何链接**。

| # | 缺口 | 说明 |
| --- | --- | --- |
| 1 | 不递归打包被引用文档 | A 引用 B，发布 A 时 B 不在 bundle，正文链接 404 |
| 2 | 不重写内部链接 | `/assets/:id`、相对路径、未来的 `asset:` 链接在静态 bundle 里没有可解析目标 |
| 3 | 不打包正文内嵌图片 | `![...](...)` 不进 bundle（附件只认 file 型关系）；CSP `img-src 'self' data: https:`（`render.ts:192`）允许外部 https 图，但内部图 404 |
| 4 | HTML / Presentation 无引用打包 | 附件打包只对 `document/report` 生效（`publishing.ts:278`）；HTML 资产里引用的资产、演示里的图片都不打包 |
| 5 | 权限不联动 | 被引用文档若是 `private`，发布主文档时既不校验也不降级，可能泄露私有内容或链接打不开（PRD 18.2） |
| 6 | 发布语义未定义 | 快照 vs 实时：打包成快照（像附件那样），还是保留实时链接（指向对方发布 URL）？两者 URL 稳定性、失效行为、访问统计完全不同 |
| 7 | 依赖图不进 manifest | manifest 只有文件清单（`render.ts:182-193`），没有「本次发布包含/引用了哪些 asset 及版本」，无法追溯、无法做「引用资产更新后重新发布」 |

## 6. 与 PRD 的显式对不齐

| 需求 ID | 要求 | 当前状态 |
| --- | --- | --- |
| File 类型（2.1） | PDF/Office/图片 | ❌ 仅 md/txt 文本导入 |
| FR-DOC-002 | Image / HTML Embed | 半：渲染支持，导入/打包不支持内嵌资源 |
| FR-ASSET-006（P1） | 关系视图，generated_from/source_of/knowledge_of | ⚠️ 只读空视图，几乎无写入 |
| FR-PUB-001/005/006 | 稳定 URL / 二维码 / 分享 | ✅ 主体已实现 |
| 20.2 Asset Relation | 6 种关系 | ⚠️ 数据模型在，业务写入缺失 |
| 22.1 MVP 组合能力 | Document→Knowledge、Document→Presentation、Report→Presentation | ⚠️ 组合动作存在，但关系不落库、发布不带走 |

## 7. 建议落地顺序

1. **定内部引用协议**（设计决策）：定一个语法 + 是否双写 relations + 发布快照/实时语义。这是 2/3/4 的共同地基，见 [content-reference-protocol.md](./content-reference-protocol.md)。
2. **打通引用写入**：编辑器加「插入资产链接」选择器 → 正文写链接 + 关系自动同步 → 关系视图/反向引用立刻有数据。
3. **发布依赖图 + 链接重写**：发布时解析正文引用 → 递归收集被引用文档/图片 → 渲染成 bundle 内相对路径 → 重写 href/src → 快照进 manifest（含 asset 版本）。
4. **权限校验**：发布前校验所有被引用资产对匿名/链接访问者的可见性，private 的降级为提示或拦截。
5. **导入增强**：先补 Markdown 图片/相对资源提取上传（性价比最高），再考虑 Word/PDF 转 Markdown（成本高，建议 P1）。
