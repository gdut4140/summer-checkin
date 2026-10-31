-- ============================================================
-- Memory v2：建表补充索引 + 从 usermemory 回填
--
-- 前置条件
--   1. schema.prisma 已包含 Memory / MemoryEvent / MemoryCandidate
--   2. 已执行 `npx prisma db push`（由它创建三张新表）
--   3. PostgreSQL 已启用 pgvector（沿用 migrate-to-pgvector.sql）
--
-- 执行方式
--   docker exec -i postgresServer psql -U postgres -d summer_checkin \
--     -v ON_ERROR_STOP=1 < prisma/add-memory-v2.sql
--
-- 幂等性
--   · 索引全部 IF NOT EXISTS
--   · 回填以 memory."legacyId" 为幂等键，重复执行不会重复导入
--   · import 事件按 (memoryId, action='import') 去重
--
-- 回滚
--   · 旧表 usermemory 全程不动，代码回滚即可恢复 v1
--   · 如需丢弃 v2：DROP TABLE IF EXISTS memorycandidate, memoryevent, memory;
--     （v2 上线后产生的数据会一起丢失，先导出再删）
--
-- 存量数据映射约定
--   · type              → kind
--   · lastUsed          → lastInjectedAt（v1 的语义就是“被注入”）
--   · createdAt         → lastConfirmedAt
--   · goal 的 createdAt → validFrom（v1 没有有效期的概念，不伪造 validTo）
--   · embedding         → 原样复制（同为 vector(1024)）
--   · sourceType        → 'legacy'
--   · normalizedKey     → NULL（避免对旧数据做错误的合并）
-- ============================================================

\echo '--- 0. 备份 v1 表 ---'
CREATE TABLE IF NOT EXISTS usermemory_backup_v2 AS SELECT * FROM usermemory;

\echo '--- 1. 扩展与索引 ---'
CREATE EXTENSION IF NOT EXISTS vector;

-- Prisma 表达不了的部分唯一索引：同用户同 normalizedKey 只能有一条 active
CREATE UNIQUE INDEX IF NOT EXISTS memory_active_key_uniq
  ON memory ("userId", "normalizedKey")
  WHERE status = 'active' AND "normalizedKey" IS NOT NULL;

-- 向量索引（与查询里的 <=> 对应）
CREATE INDEX IF NOT EXISTS memory_embedding_hnsw
  ON memory USING hnsw (embedding vector_cosine_ops);

BEGIN;

\echo '--- 2. 回填 usermemory → memory ---'
INSERT INTO memory (
  id,
  "userId",
  "legacyId",
  kind,
  content,
  "normalizedKey",
  status,
  importance,
  confidence,
  "validFrom",
  "validTo",
  "lastConfirmedAt",
  "lastRetrievedAt",
  "lastInjectedAt",
  "injectedCount",
  "toolReadCount",
  "supersedesId",
  "sourceType",
  "sourceConversationId",
  "sourceMessageId",
  embedding,
  "embeddingModel",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  gen_random_uuid()::text,
  m."userId",
  m.id,
  m.type,
  m.content,                       -- 存量正文不截断，避免丢信息
  NULL,
  'active',
  m.importance,
  m.confidence,
  CASE WHEN m.type = 'goal' THEN m."createdAt" ELSE NULL END,
  NULL,
  m."createdAt",
  NULL,
  m."lastUsed",
  0,
  0,
  NULL,
  'legacy',
  NULL,
  NULL,
  m.embedding,
  NULL,
  m."createdAt",
  m."createdAt",
  NULL
FROM usermemory m
WHERE NOT EXISTS (
  SELECT 1 FROM memory existing WHERE existing."legacyId" = m.id
);

\echo '--- 3. 为回填数据写 import 事件 ---'
INSERT INTO memoryevent (
  id,
  "userId",
  "memoryId",
  action,
  actor,
  before,
  after,
  evidence,
  "sourceConversationId",
  "sourceMessageId",
  "createdAt"
)
SELECT
  gen_random_uuid()::text,
  mem."userId",
  mem.id,
  'import',
  'migration',
  NULL,
  to_jsonb(mem),
  'legacy usermemory import',
  NULL,
  NULL,
  now()
FROM memory mem
WHERE mem."sourceType" = 'legacy'
  AND NOT EXISTS (
    SELECT 1 FROM memoryevent e
    WHERE e."memoryId" = mem.id AND e.action = 'import'
  );

COMMIT;

\echo '--- 4. 校验 ---'
\echo '4.1 行数（memory 应 >= usermemory）'
SELECT
  (SELECT COUNT(*) FROM usermemory) AS v1_rows,
  (SELECT COUNT(*) FROM memory WHERE "sourceType" = 'legacy') AS v2_legacy_rows,
  (SELECT COUNT(*) FROM memory) AS v2_total_rows;

\echo '4.2 向量复制情况'
SELECT
  COUNT(*) AS total,
  COUNT(embedding) AS with_vector,
  MIN(vector_dims(embedding)) AS min_dim,
  MAX(vector_dims(embedding)) AS max_dim
FROM memory;

\echo '4.3 类型映射分布'
SELECT kind, COUNT(*) FROM memory GROUP BY kind ORDER BY kind;

\echo '4.4 import 事件数（应等于 legacy 行数）'
SELECT COUNT(*) AS import_events FROM memoryevent WHERE action = 'import';

\echo '4.5 索引确认'
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'memory'
ORDER BY indexname;
