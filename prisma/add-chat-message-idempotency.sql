-- WebSocket 用户消息持久化幂等：clientId 是应用层 Idempotency-Key，
-- (userId, clientId) 唯一约束是并发写入时的最终裁决。
--
-- 存量消息与 AI 消息的 clientId 均为 NULL；PostgreSQL 允许唯一索引中存在
-- 多组 NULL，因此不会与存量数据冲突。本脚本可重复执行。

ALTER TABLE "chatmessage" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "chatmessage_userId_clientId_key"
  ON "chatmessage" ("userId", "clientId");

-- 校验（应返回 1 行）：
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'chatmessage'
--     AND indexname = 'chatmessage_userId_clientId_key';
