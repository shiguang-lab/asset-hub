# 服务端改动清单

> 历史实施稿：已完成能力可作为代码线索，但授权码 + loopback 相关内容不再是目标方案。OAuth 以 [01-oauth-design.md](./01-oauth-design.md) 的设备授权流程为准，产品边界以 [05-product-design.md](./05-product-design.md) 为准。

插件依赖的服务端能力缺口。按依赖顺序排列。

## 0. 前置：迁移机制缺失（阻塞项）

**当前没有迁移框架**。`openDatabase`（`packages/database/src/db.ts:59-63`）硬编码只执行一个文件：

```ts
const p = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations/0001_init.sql");
await pool.query(await readFile(p, "utf8"));
```

`SCHEMA_VERSION = 1`（`db.ts:8`）写入 `schema_meta` 后再无使用；`migrations/` 目录只有 `0001_init.sql`。`Dockerfile:38` 也硬校验该文件存在。

这意味着新增 `0002_*.sql` **不会被执行**。必须先补最小迁移执行器,否则后续所有 schema 改动无法落地。

### 0.1 最小迁移执行器

按序读取 `migrations/*.sql`，已执行的跳过，记录到 `schema_migrations` 表。

```sql
-- 追加到 0001_init.sql 末尾（幂等，老库也能补上）
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

```ts
// packages/database/src/db.ts
async function applyMigrations(pool: Pool, dir: string): Promise<void> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(resolve(dir, file), "utf8");
    // 每个迁移在单事务内执行，失败即回滚，避免半应用状态
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const done = await client.query(
        "SELECT name FROM schema_migrations WHERE name = $1", [file]);
      if (done.rowCount === 0) {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)",
          [file, new Date().toISOString()]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`迁移 ${file} 失败: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }
}
```

`0001_init.sql` 全文用 `CREATE TABLE IF NOT EXISTS`，重复执行安全，可直接纳入该机制。`Dockerfile:38` 的校验改为校验目录非空。

## 1. `assets.path` 字段

### 1.1 迁移脚本

```sql
-- packages/database/migrations/0002_asset_path.sql
-- 文档路径：Obsidian 文件夹与 Web 目录树的共同真源。
-- 此前目录仅存于 Web 端 localStorage（apps/web/src/features/documents/documents.tsx:92-93），
-- 换设备即丢失，且无法表达移动/重命名。

ALTER TABLE assets ADD COLUMN IF NOT EXISTS path TEXT NOT NULL DEFAULT '';

-- 同一工作空间内路径唯一（仅对未删除的文档类资产生效）。
-- 部分索引避免了软删记录与新建同路径文档冲突。
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_path
  ON assets (workspace_id, path)
  WHERE deleted_at IS NULL AND path <> '' AND type IN ('document', 'html');

-- 增量同步主查询：按 workspace + 时间窗扫描。
CREATE INDEX IF NOT EXISTS idx_assets_sync
  ON assets (workspace_id, type, updated_at, id)
  WHERE deleted_at IS NULL;

-- 目录树前缀查询（text_pattern_ops 支持 LIKE 'prefix%' 走索引）。
CREATE INDEX IF NOT EXISTS idx_assets_path_prefix
  ON assets (workspace_id, path text_pattern_ops)
  WHERE deleted_at IS NULL;

-- 回填：历史导入的 metadata.importPath 提升为正式 path。
UPDATE assets AS a
SET path = sub.import_path
FROM (
  SELECT DISTINCT ON (v.asset_id)
         v.asset_id,
         regexp_replace(v.metadata_json::json ->> 'importPath', '\.[^./]+$', '') AS import_path
  FROM asset_versions v
  WHERE v.metadata_json::json ->> 'importPath' IS NOT NULL
  ORDER BY v.asset_id, v.sequence DESC
) AS sub
WHERE a.id = sub.asset_id
  AND a.path = ''
  AND sub.import_path IS NOT NULL
  AND sub.import_path <> '';
```

回填后可能出现重复路径（历史数据无约束），唯一索引会创建失败。**迁移脚本需先去重**：

```sql
-- 重复路径追加 -2 -3 后缀，保留 created_at 最早的一条使用原路径
WITH ranked AS (
  SELECT id, path, workspace_id,
         ROW_NUMBER() OVER (PARTITION BY workspace_id, path ORDER BY created_at, id) AS rn
  FROM assets
  WHERE deleted_at IS NULL AND path <> '' AND type IN ('document', 'html')
)
UPDATE assets AS a
SET path = a.path || '-' || ranked.rn
FROM ranked
WHERE a.id = ranked.id AND ranked.rn > 1;
```

顺序：`ADD COLUMN` → 回填 → 去重 → 建唯一索引。

### 1.2 `path` 取值约定

| 规则 | 说明 |
| --- | --- |
| 分隔符 | 正斜杠 `/`，与操作系统无关 |
| 无扩展名 | `产品/周报/W37`，扩展名由 `type` 推导 |
| 无前后斜杠 | 不以 `/` 开头或结尾 |
| 根目录文档 | `path` 即文件名，如 `README` |
| 空字符串 | 未分配路径（历史数据），Web 端归入「未分类」 |
| 禁止 `.` `..` | 服务端校验拒绝，防路径穿越 |
| 长度上限 | 512 字符 |
| Unicode | 允许中文，服务端做 NFC 规范化（macOS 用 NFD，不统一会导致同名判为不同） |

NFC 规范化这点容易漏。macOS 的 Obsidian 传上来的中文路径是 NFD 分解形式，Windows/Linux 是 NFC，若不统一，同一个「产品」文件夹会在服务端变成两条不同 `path`。

### 1.3 contracts 改动

```ts
// packages/contracts/src/index.ts

// 路径格式：斜杠分隔、无扩展名、无前后斜杠、禁止 . 与 ..
export const assetPathSchema = z
  .string()
  .max(512)
  .refine((v) => !v.startsWith("/") && !v.endsWith("/"), "路径不得以斜杠开头或结尾")
  .refine((v) => !v.split("/").some((s) => s === "." || s === ".."), "路径不得包含 . 或 ..")
  .transform((v) => v.normalize("NFC"));

// assetSchema 增加（L108-127 之间）
path: z.string().default(""),

// createAssetInputSchema 增加（L937-943）
path: assetPathSchema.optional(),

// 新增 patch schema —— 当前 PATCH 的入参在 assets.ts 内联定义，需一并补 path
export const updateAssetInputSchema = z.object({
  title:       z.string().min(1).optional(),
  description: z.string().optional(),
  visibility:  visibilitySchema.optional(),
  path:        assetPathSchema.optional(),
  content:     z.record(z.string(), z.unknown()).optional(),
});

// listAssetsQuerySchema 增加（L926-935）
pathPrefix: z.string().optional(),   // 目录树筛选
```

### 1.4 store 与路由

- `store.ts` 的 asset 行映射（`rowToAsset` 之类）补 `path`
- `createAsset` / `updateAssetMeta` 支持 `path` 写入
- 唯一约束冲突（PG `23505`）→ 转 `409` Problem Details，新增 `code=ASSET_PATH_CONFLICT`，沿用 `platform/errors.ts:59-73` 的构造方式
- `PATCH /assets/:id`（`assets.ts:294`）接受 `path`
- `GET /assets` 支持 `pathPrefix` 过滤

## 2. 增量同步

### 2.1 `since` 过滤

`listAssetsQuerySchema`（`contracts/src/index.ts:926-935`）当前无时间过滤，插件每次同步只能翻全表。

```ts
// listAssetsQuerySchema 增加
since: z.string().datetime().optional(),   // ISO 8601，返回 updated_at > since
```

`store.listAssets` 的 WHERE 追加 `AND updated_at > $since`，走 §1.1 的 `idx_assets_sync` 索引。

排序保持现有 `updated_at DESC, id DESC`（`store.ts:444-468`），游标机制不变。

### 2.2 ETag 响应头

当前只消费 `If-Match`，不返回 ETag（`assets.ts:1091-1099`）。插件需要读取版本号才能构造后续写请求。

```ts
// GET /assets/:id 与 PATCH /assets/:id 成功后
reply.header("etag", `"${asset.lockVersion}"`);
```

`@fastify/cors` 已在 `exposedHeaders` 暴露 `etag`（`bootstrap/app.ts:28-32`），无需额外配置。

### 2.3 删除项返回

`includeDeleted` 参数已存在（`contracts/src/index.ts:934`），确认与 `since` 组合可用：

```
GET /api/v1/assets?type=document&since=<t>&includeDeleted=true
```

需返回 `deletedAt` 字段（`assetSchema` 已含，L121）。插件据此删除本地文件。

## 3. OAuth Token 校验

见 [01-oauth-design.md](./01-oauth-design.md) §6。改动集中在：

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/platform/sg-identity.ts` | `tokenType` 选项（默认 `sg-identity+jwt`），校验 JWS 头部的 `typ` |
| `apps/api/src/platform/oauth-scope.ts`（新） | `documents:read` → `read`；`documents:write` → `read` + `write` |
| `apps/api/src/platform/identity.ts` | `resolve` 内新增 OAuth 分支，置于 `sg_` PAT 分支之前 |
| `apps/api/src/bootstrap/app.ts` | 在现有 verifier 之外再构造一个 `tokenType: "at+jwt"` 的实例，注入 `verifyOAuth` |

配置项（沿用现有的 `SG_*` 前缀，缺省回落到身份令牌的配置）：

```
SG_OAUTH_ISSUER=https://shiguanglab.com
SG_OAUTH_AUDIENCE=asset-hub-api
```

没有 `SG_OAUTH_JWKS_URL`：JWKS 地址由 issuer 按标准路径推导。

**`typ` 校验是这一节的核心。** 两类令牌由同一个签名密钥签发、`iss` 与 `aud` 相同，唯一的结构差异就是 JWS 头部的 `typ`。不校验它，网关断言就能当 OAuth access token 用，反之亦然——两边权限面的差异会被一个字段抹平。

OAuth 分支命中前先排除 `sg_` 前缀的 PAT：否则使用方 token 会被误判成 JWT 送进验签。OAuth 令牌映射到个人工作空间，权限由 scope 决定，因此它拿不到网关令牌能拿到的那些能力。

## 4. Web 端目录迁移

`apps/web/src/features/documents/documents.tsx` 的 localStorage 目录已改为服务端 `path` 的投影。

### 4.1 现状代码

| 位置 | 内容 | 处置 |
| --- | --- | --- |
| `FOLDERS_STORAGE_KEY` | 目录定义存 localStorage | 已删除 |
| `FOLDER_ASSIGNMENTS_STORAGE_KEY` | 文档→目录归属 | 已删除 |
| `DEFAULT_DOCUMENT_FOLDERS` | 硬编码「产品/产品规划/需求文档」 | 已删除 |
| `readStoredFolders` | 读 localStorage | 已删除，改为从 `path` 派生 |
| `readFolderAssignments` | 读归属 | 已删除 |
| `folderIdForImportPath` / `restoreImportedDocumentFolders` | 导入后前端拼 folder id | 已删除，改由服务端按导入路径写 `path` |
| `inferredFolderId` | 按标题关键词猜目录 | 已删除，目录归属就是 `path` |
| `useState<DocumentFolder[]>` | 目录状态 | 已删除，改为 `useMemo(() => deriveFolderTree(all))` |
| `DEMO_DOCUMENTS` | 演示数据无 `path` | 已补 `path`，演示目录与实际模型一致 |

纯逻辑抽到 `apps/web/src/shared/document-path.ts`，可独立单测；旧数据迁移逻辑在 `document-folder-migration.ts`。

### 4.2 目录树从 `path` 派生

目录不再是独立实体，而是 `path` 的投影：

```ts
// 从资产列表推导目录树，目录 = path 的各级前缀
export function deriveFolderTree(assets: readonly { path?: string | null }[]): DocumentFolder[] {
  const paths = new Set<string>();
  for (const asset of assets) {
    const normalised = normalizeFolderPath(asset.path ?? "");
    if (!normalised) continue;
    const segments = normalised.split("/");
    segments.pop();                       // 末段是文件名，不是目录
    for (let i = 1; i <= segments.length; i += 1) {
      paths.add(segments.slice(0, i).join("/"));
    }
  }
  return [...paths].sort((l, r) => l.localeCompare(r)).map(/* id=路径, name=末段, parentId=父路径 */);
}
```

这个逻辑与服务端 `collectImportFolders`（`assets.ts`）算法一致，两者必须同步演进。

目录节点的 id 就是目录路径本身（`产品/需求文档`），所以「选中目录」等价于「按路径前缀筛选」，不需要再维护一棵 id 树。筛选用 `isInFolder`，前缀匹配停在分隔符上，`产品规划` 不会被 `产品` 选中。

### 4.3 空目录

文档归属仍以 `asset.path` 为同步真源；`document_folders` 表额外持久化目录路径，使空目录
可以跨设备存在。Web 目录树合并服务端目录记录与文档路径投影，因此 Obsidian 创建的文件夹、
Web 新建的空目录和已有文档目录使用同一套路径标识。

目录面板提供「新建目录」，目录行菜单提供「新建子目录」。

### 4.4 目录级操作

服务端没有目录实体，改名与删除都归结为改写其下文档的 `path`：

| 操作 | 实现 |
| --- | --- |
| 移动到目录 | `PATCH /assets/:id` 写 `path`，文件名沿用原值 |
| 拖拽到目录行 | 同上 |
| 重命名目录 | 在事务中同时改写目录子树与所有文档的路径前缀 |
| 删除目录 | 仅允许删除空目录；含文档或子目录时返回冲突，要求先移走内容 |

批量用 `If-Match` 逐条提交，单条失败不影响其余，最后按失败数汇报。路径在服务端唯一，目标路径被占用会返回 409 `ASSET_PATH_CONFLICT`。

回收站中的文档不参与目录改名，恢复后仍保留删除前的原路径。

### 4.5 新建与导入落在当前目录

- 新建文档：目录页带 `?folder=<目录路径>`，编辑器创建时把 `path` 定为 `目录/文件名`。标题变更时，若路径末段仍等于旧标题（即自动派生的文件名），跟随一起改；否则保持不动。
- 导入：`POST /assets/documents/import` 新增 `pathPrefix` 查询参数，导入的文件直接落进该目录。非法前缀按根目录处理。此前后端各造一套目录 id，导入的目录树与正式 `path` 会分叉。

### 4.6 迁移用户既有数据

用户 localStorage 里已有目录归属，直接改造会丢失，因此保留一次性迁移：

1. 首次加载检测到旧归属键存在，且全部资产 `path` 为空
2. 弹窗询问「检测到本地目录数据，是否上传到云端？」
3. 确认后按旧目录链换算成 `path`，批量 `PATCH /assets/:id`
4. 成功后清除旧键

只要服务端已有任何非空 `path`，就不再提示——说明这份本地数据要么已经迁过，要么已被更新的事实取代。

## 5. 改动汇总

| 序号 | 文件 | 类型 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| 0 | `packages/database/src/db.ts` | 迁移执行器 | 无（阻塞项，最先做） | 已完成 |
| 0 | `packages/database/migrations/0001_init.sql` | 追加 `schema_migrations` 表 | 无 | 已完成 |
| 0 | `Dockerfile:38` | 校验改为目录非空 | 无 | 已完成 |
| 1 | `packages/database/migrations/0002_asset_path.sql` | 新增 | 0 | 已完成 |
| 1 | `packages/contracts/src/index.ts` | `assetPathSchema`、`path`、`pathPrefix`、`since`、`updateAssetInputSchema` | 无 | 已完成 |
| 1 | `packages/database/src/store.ts` | `path` 读写、`since` 过滤、路径冲突、按时间窗返回已删项 | 1 | 已完成 |
| 1 | `apps/api/src/modules/assets.ts` | PATCH/POST/GET 支持 `path`、ETag 响应头、导入 `pathPrefix` | 1 | 已完成 |
| 1 | `apps/api/src/platform/errors.ts` | `ASSET_PATH_CONFLICT` | 1 | 已完成 |
| 3 | `apps/api/src/platform/sg-identity.ts` | 支持 `typ` 参数（`sg-identity+jwt` / `at+jwt`）区分令牌类型 | auth-service OAuth | 已完成 |
| 3 | `apps/api/src/platform/oauth-scope.ts` | scope → 权限映射 | 3 | 已完成 |
| 3 | `apps/api/src/platform/identity.ts` | OAuth access token 分支 | 3 | 已完成 |
| 3 | `apps/api/src/bootstrap/app.ts` | 注入 `verifyOAuth`（`SG_OAUTH_ISSUER` / `SG_OAUTH_AUDIENCE`） | 3 | 已完成 |
| 4 | `apps/web/src/shared/document-path.ts`（新） | 目录树派生与路径改写（纯函数） | 1 | 已完成 |
| 4 | `apps/web/src/shared/document-folder-migration.ts`（新） | 旧 localStorage 目录的换算 | 无 | 已完成 |
| 4 | `apps/web/src/features/documents/documents.tsx` | 目录改造：派生树、批量改写 `path`、一次性迁移 | 1 | 已完成 |
| 4 | `apps/web/src/features/documents/editor.tsx` | 新建文档落在当前目录，标题变更同步文件名 | 1 | 已完成 |
| 4 | `apps/web/src/shell/layout.tsx` | 导入携带 `pathPrefix` | 1 | 已完成 |

第 3 组没有新建 `oauth-token.ts`：asset-hub api 侧要做的只是「换一个 JWKS、换一个 `typ`」，`SgIdentityVerifier` 已经实现了 JWKS 拉取与缓存、`iss`/`aud`/`exp` 校验。把 `typ` 参数化就复用了全部实现，独立文件只会复制一遍取密钥的逻辑。

第 4 组与本插件没有依赖关系——插件只读写 `path` 字段，不关心 Web 端怎么展示目录——但它决定了 `path` 是否真的有人写。Web 端目录树一度只是 localStorage 里的假数据，`path` 字段没有真实来源；两组一起做，`path` 才成为两端共用的真源。

## 6. 验证要点

```bash
pnpm check    # format + lint + typecheck + test + build
```

新增单测：

- `assetPathSchema`：合法路径通过；`/a`、`a/`、`a/../b`、超长、`.`/`..` 段拒绝；NFD 输入规范化为 NFC
- 路径唯一：同 workspace 同 path 第二次写入返回 409 `ASSET_PATH_CONFLICT`；软删后同 path 可重新创建
- `since` 过滤：边界值（`updated_at == since` 不返回，`> since` 返回）
- ETag：GET/PATCH 均返回，值等于 `lockVersion`
- 迁移执行器：重复执行不报错；中途失败回滚；`schema_migrations` 正确记录
- 回填去重：构造重复 `importPath` 数据，确认加后缀且唯一索引建成
- 导入前缀：`parseImportPathPrefix` 接受目录路径并规范化，拒绝 `/产品/`、`产品/../研究`、`产品//需求`；`withImportPrefix` 挂载与空前缀直通
- `document-path`：多级路径、根目录文档、空 path、同名段（`产品` 不吞 `产品规划`）、目录改名前后缀改写、上提到父目录
- `document-folder-migration`：多级旧目录换算、root 与非存在目录跳过、服务端已有 path 时不再迁移、损坏 JSON 不抛错、目录链断裂退化
