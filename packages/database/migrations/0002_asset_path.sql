-- 文档路径：Obsidian 文件夹与 Web 目录树的共同真源。
--
-- 此前目录树只存在于 Web 端 localStorage（apps/web/src/features/documents/documents.tsx），
-- 既无法跨设备保留，也无法表达移动与重命名。把路径提升为 assets 的一等字段后，
-- Web 目录与 Obsidian 文件夹指向同一份数据。
--
-- 取值约定：正斜杠分隔、不含扩展名（由 type 推导）、无前后斜杠、禁止 . 与 ..、
-- 空串表示未分配（历史数据），服务端统一做 NFC 规范化。

ALTER TABLE assets ADD COLUMN IF NOT EXISTS path TEXT NOT NULL DEFAULT '';

-- 回填：历史目录导入把相对路径写在了最新版本的 metadata_json.importPath 里，
-- 将其提升为正式 path。metadata_json 是 TEXT 列且历史数据可能不是合法 JSON，
-- 故先用正则筛出确实含 importPath 的行，避免 ::json 转换在脏数据上整体失败。
UPDATE assets AS a
SET path = sub.import_path
FROM (
  SELECT DISTINCT ON (v.asset_id)
         v.asset_id,
         -- 去掉扩展名：path 不含扩展名，由 assets.type 推导
         regexp_replace(v.metadata_json::json ->> 'importPath', '\.[^./]+$', '') AS import_path
  FROM asset_versions v
  WHERE v.metadata_json LIKE '%"importPath"%'
    AND v.metadata_json::json ->> 'importPath' IS NOT NULL
  ORDER BY v.asset_id, v.sequence DESC
) AS sub
WHERE a.id = sub.asset_id
  AND a.path = ''
  AND sub.import_path IS NOT NULL
  AND sub.import_path <> '';

-- 历史数据没有唯一约束，回填后可能出现同路径重复，会导致下方唯一索引创建失败。
-- 保留 created_at 最早的一条使用原路径，其余追加 -2、-3 序号。
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY workspace_id, path ORDER BY created_at, id) AS rn
  FROM assets
  WHERE deleted_at IS NULL
    AND path <> ''
    AND type IN ('document', 'html')
)
UPDATE assets AS a
SET path = a.path || '-' || ranked.rn
FROM ranked
WHERE a.id = ranked.id
  AND ranked.rn > 1;

-- 同一工作空间内路径唯一。限定未删除的文档类资产：软删记录不应阻止用户
-- 在同一路径上重新创建文档。
CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_path
  ON assets (workspace_id, path)
  WHERE deleted_at IS NULL AND path <> '' AND type IN ('document', 'html');

-- 增量同步主查询：按 workspace + type 扫描 updated_at 时间窗，
-- 覆盖 (updated_at, id) 以匹配现有游标排序。
CREATE INDEX IF NOT EXISTS idx_assets_sync
  ON assets (workspace_id, type, updated_at, id)
  WHERE deleted_at IS NULL;

-- 目录树前缀查询：text_pattern_ops 让 LIKE 'prefix%' 能走索引。
CREATE INDEX IF NOT EXISTS idx_assets_path_prefix
  ON assets (workspace_id, path text_pattern_ops)
  WHERE deleted_at IS NULL;
