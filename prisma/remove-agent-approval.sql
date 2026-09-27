-- 删除「Agent 人工审批 / 决策」这套未落地的机制：agentapproval 与 agentdecision 两张表
--
-- 背景：这两张表当初是为「Agent 生成计划草案 → 用户确认 → 再落库」的人机协同流程建的，
-- 但承载该流程的界面组件（agent-workspace / coach-overview / decision-timeline）从未挂到
-- 任何路由上，属于不可达代码，已随本次改动删除。此后：
--   · agentapproval 没有任何写入方，表内历史行是每日分析留下的、永远不会被处理的 pending 记录；
--   · agentdecision 同样只写不读（唯一的读取方是已删除的 decision-timeline）。
-- 两张表均无其他表引用，删除不影响 agentrun / agentstep（每日分析仍在用）。
--
-- 用法：在目标库上直接执行本脚本即可，**不要**改用 `prisma db push`——
-- db push 是全库 schema 同步，会把其他漂移（如 usermemory.embedding 的 NOT NULL）一并改掉。

ALTER TABLE "agentapproval" DROP CONSTRAINT IF EXISTS "agentapproval_runId_fkey";
ALTER TABLE "agentapproval" DROP CONSTRAINT IF EXISTS "agentapproval_stepId_fkey";
DROP TABLE IF EXISTS "agentapproval";

ALTER TABLE "agentdecision" DROP CONSTRAINT IF EXISTS "agentdecision_userId_fkey";
ALTER TABLE "agentdecision" DROP CONSTRAINT IF EXISTS "agentdecision_runId_fkey";
DROP TABLE IF EXISTS "agentdecision";
