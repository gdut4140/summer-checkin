-- ============================================================
-- Context Engineering / AgentState 迁移
--
-- 内容：
--   1. conversationmessage.rawParts —— 保存 AI SDK 原始 parts，
--      用于后续轮次重建 tool-call/tool-result 配对
--   2. agentstate —— 会话级短期记忆（一对一 Conversation）
--
-- 为什么不用 `prisma db push`：
--   库里有人工备份表（如 usermemory_backup_v2），db push 会把它当成
--   漂移表并要求 --accept-data-loss。生产环境请直接执行本脚本。
--
-- 执行：
--   docker exec -i postgresServer psql -U postgres -d summer_checkin \
--     -v ON_ERROR_STOP=1 < prisma/add-context-agentstate.sql
--
-- 幂等：所有 DDL 都带 IF NOT EXISTS / 约束存在性检查，可重复执行。
-- 回滚：
--   DROP TABLE IF EXISTS agentstate;
--   ALTER TABLE conversationmessage DROP COLUMN IF EXISTS "rawParts";
--   （rawParts 只影响上下文重建，回滚后旧消息退化为纯文本历史）
-- ============================================================

BEGIN;

ALTER TABLE conversationmessage
  ADD COLUMN IF NOT EXISTS "rawParts" jsonb;

CREATE TABLE IF NOT EXISTS agentstate (
  id text PRIMARY KEY,
  "conversationId" text NOT NULL,
  summary text NOT NULL DEFAULT '',
  "workingMemory" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "todoList" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "compressedThroughMessageId" text,
  version integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agentstate_conversationId_key"
  ON agentstate ("conversationId");
CREATE INDEX IF NOT EXISTS "agentstate_conversationId_idx"
  ON agentstate ("conversationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agentstate_conversationId_fkey'
  ) THEN
    ALTER TABLE agentstate
      ADD CONSTRAINT "agentstate_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES conversation(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;

-- 校验
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'agentstate'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'conversationmessage' AND column_name = 'rawParts';
