-- 头像历史：记录被替换下来的上一张 OSS 头像，仅保留最近 1 个
ALTER TABLE "avatarchange" ADD COLUMN IF NOT EXISTS "image" TEXT;
