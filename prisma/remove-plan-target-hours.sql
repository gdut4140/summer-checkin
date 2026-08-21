-- 计划不再计时：删除 plan.target_hours 列
ALTER TABLE "plan" DROP COLUMN IF EXISTS "targetHours";
