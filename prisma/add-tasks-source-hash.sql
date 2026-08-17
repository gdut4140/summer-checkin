-- 计划任务手动拆分：记录最后一次拆分所用文档的哈希，
-- 用于判断文档改动后任务是否过期（抽屉里提示手动刷新）。
ALTER TABLE "plan" ADD COLUMN IF NOT EXISTS "tasksSourceHash" TEXT;
-- 后台拆分状态：非空 = 正在刷新任务，供抽屉显示"任务刷新中"。
ALTER TABLE "plan" ADD COLUMN IF NOT EXISTS "tasksSplittingAt" TIMESTAMP(3);
