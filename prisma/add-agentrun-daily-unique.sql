-- 每日分析幂等抢锁：给 agentrun 加一列本地日期 + 复合唯一约束。
--
-- 背景：/api/agent/daily-run 原来用「先 findFirst 查今天跑过没有，再 create」判断幂等，
-- 两个标签页同时打开会双双读到空 → 双双执行。改成「插入即抢锁」：
-- 插入成功 = 今天归我，唯一冲突(P2002) = 别人已经在跑。
--
-- 用法：在目标库上直接执行本脚本即可，**不要**改用 `prisma db push`
-- （db push 是全库 schema 同步，会把其他漂移一并改掉，存量库上还会删表）。
--
-- 安全性：新列在所有存量行上都是 NULL，Postgres 视多个 NULL 互不相等，
-- 所以建唯一索引不可能因存量数据冲突而失败；其他 mode 的行（默认 planner）
-- 也因 runDate 为 NULL 而不受约束。幂等，可重复执行。

ALTER TABLE "agentrun" ADD COLUMN IF NOT EXISTS "runDate" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "agentrun_userId_runDate_key"
  ON "agentrun" ("userId", "runDate");

-- 校验（应返回 1 行）：
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'agentrun' AND indexname = 'agentrun_userId_runDate_key';
