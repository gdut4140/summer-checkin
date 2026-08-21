-- 单房间化：删除房间与成员表，消息表去掉 room_id
-- Prisma Postgres 列名与字段名一致（camelCase）

ALTER TABLE "chatmessage" DROP CONSTRAINT IF EXISTS "chatmessage_roomId_fkey";
DROP INDEX IF EXISTS "chatmessage_roomId_createdAt_idx";
ALTER TABLE "chatmessage" DROP COLUMN IF EXISTS "roomId";
DROP TABLE IF EXISTS "chatroommember";
DROP TABLE IF EXISTS "chatroom";
CREATE INDEX "chatmessage_createdAt_idx" ON "chatmessage" ("createdAt");
