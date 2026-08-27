-- 删除勋章系统：badge 与 userbadge 表
-- 先删 userbadge 的外键约束，再删表（userbadge 引用 badge）

ALTER TABLE "userbadge" DROP CONSTRAINT IF EXISTS "userbadge_badgeId_fkey";
ALTER TABLE "userbadge" DROP CONSTRAINT IF EXISTS "userbadge_userId_fkey";
DROP TABLE IF EXISTS "userbadge";
DROP TABLE IF EXISTS "badge";
