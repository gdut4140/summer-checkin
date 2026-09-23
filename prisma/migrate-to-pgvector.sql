-- ============================================================
-- 迁移：embedding 列 jsonb → pgvector vector(1024)
--
-- 背景
--   项目最初跑在 MySQL 上（MySQL 无 vector 类型，也无 pgvector），
--   embedding 从一开始就只能存进 JSON 列。2026-08 迁到 PostgreSQL 时
--   （提交 d7f7366），列类型被直接平移为 jsonb，pgvector 虽已随镜像就位
--   但从未启用。检索一直靠应用层全量拉回 + JS 余弦，且有
--   `ORDER BY "createdAt" DESC LIMIT 1000` 的静默截断——超出窗口的文档
--   永远搜不到且不报错（实测有用户 1033 个 chunk 检索覆盖为 0）。
--
-- 前置条件（2026-09-22 已在生产库实测确认）
--   · documentchunk 4449 行 / usermemory 27 行，维度统一为 1024
--   · jsonb_typeof(embedding) 全为 'array'，无 JSON 字符串脏数据
--   · pgvector 0.8.6 文件已随镜像内置（installed_version 为空 = 未启用）
--
-- ⚠️ 本脚本是一次性的，不可重复执行
--   （第二次执行时 embedding 已是 vector，#>> '{}' 对其不再适用）
--
-- 执行方式
--   docker exec -i postgresServer psql -U postgres -d summer_checkin \
--     -v ON_ERROR_STOP=1 < prisma/migrate-to-pgvector.sql
-- ============================================================

-- ------------------------------------------------------------
-- 步骤 0：备份（推荐保留）
-- 61 MB，秒级完成。全脚本包在事务里，若迁移失败会自动回滚，
-- 但迁移「成功」后才发现问题就只能靠这两个备份表了。
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentchunk_backup_20260922 AS SELECT * FROM documentchunk;
CREATE TABLE IF NOT EXISTS usermemory_backup_20260922    AS SELECT * FROM usermemory;

\echo '备份完成，开始迁移...'

-- ------------------------------------------------------------
-- 步骤 1-4：迁移（单事务，要么全成要么全不动）
-- ------------------------------------------------------------
BEGIN;

-- 1. 启用扩展（文件已在镜像内，这里只是在本库启用）
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 列类型 jsonb → vector(1024)
--    #>> '{}' 对 jsonb 数组取值即为干净的向量字面量 "[0.1,0.2,...]"，
--    正是 pgvector 的输入格式。维度不符会让整条 ALTER 失败并回滚，
--    不会留下半迁移状态。
ALTER TABLE documentchunk
  ALTER COLUMN embedding TYPE vector(1024)
  USING (embedding #>> '{}')::vector;

ALTER TABLE usermemory
  ALTER COLUMN embedding TYPE vector(1024)
  USING (embedding #>> '{}')::vector;

-- 3. 对齐 schema 里挂起的一处差异：
--    schema.prisma 已是 Unsupported("vector(1024)")?（可空），
--    但库里仍是 NOT NULL。embedding 生成失败时需留空，故放开。
ALTER TABLE usermemory ALTER COLUMN embedding DROP NOT NULL;

-- 4. HNSW 索引（余弦距离，与查询里的 <=> 对应）
--    4400 余行，构建耗时秒级
DROP INDEX IF EXISTS documentchunk_embedding_hnsw;
CREATE INDEX documentchunk_embedding_hnsw
  ON documentchunk USING hnsw (embedding vector_cosine_ops);

DROP INDEX IF EXISTS usermemory_embedding_hnsw;
CREATE INDEX usermemory_embedding_hnsw
  ON usermemory USING hnsw (embedding vector_cosine_ops);

COMMIT;

\echo '迁移完成，开始校验...'

-- ------------------------------------------------------------
-- 步骤 5：校验
-- ------------------------------------------------------------
\echo '--- 5.1 扩展状态（installed_version 应为 0.8.6）---'
SELECT name, default_version, installed_version
FROM pg_available_extensions WHERE name = 'vector';

\echo '--- 5.2 列类型（应为 vector(1024)）---'
SELECT table_name, column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name IN ('documentchunk', 'usermemory') AND column_name = 'embedding';

\echo '--- 5.3 索引（应有两个 hnsw 索引）---'
SELECT indexname, indexdef FROM pg_indexes
WHERE indexname IN ('documentchunk_embedding_hnsw', 'usermemory_embedding_hnsw');

\echo '--- 5.4 数据行数比对（应与备份表一致：4449 / 27）---'
SELECT
  (SELECT COUNT(*) FROM documentchunk) AS chunks_now,
  (SELECT COUNT(*) FROM documentchunk_backup_20260922) AS chunks_backup,
  (SELECT COUNT(*) FROM usermemory) AS memories_now,
  (SELECT COUNT(*) FROM usermemory_backup_20260922) AS memories_backup;

\echo '--- 5.5 向量抽样（确认无 null / 维度正确）---'
SELECT COUNT(*) AS total,
       COUNT(embedding) AS with_vector,
       MIN(vector_dims(embedding)) AS min_dim,
       MAX(vector_dims(embedding)) AS max_dim
FROM documentchunk;

-- ------------------------------------------------------------
-- 回滚（仅在上面的校验发现问题时使用）
-- ------------------------------------------------------------
-- BEGIN;
--   DROP INDEX IF EXISTS documentchunk_embedding_hnsw;
--   DROP INDEX IF EXISTS usermemory_embedding_hnsw;
--   ALTER TABLE documentchunk ALTER COLUMN embedding TYPE jsonb USING (embedding::text::jsonb);
--   ALTER TABLE usermemory    ALTER COLUMN embedding TYPE jsonb USING (embedding::text::jsonb);
--   ALTER TABLE usermemory    ALTER COLUMN embedding SET NOT NULL;
-- COMMIT;
-- 若已确认要彻底还原，改用备份表：
--   ALTER TABLE documentchunk RENAME TO documentchunk_migrated;
--   ALTER TABLE documentchunk_backup_20260922 RENAME TO documentchunk;
