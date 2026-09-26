-- 对话按界面与归属对象隔离：conversation 表新增 surface + refId
--
-- 背景：智能体页、文档工作台、计划工作台三处的 AI 对话共用 conversation 表，
-- 但表里没有任何字段区分来源，导致工作台的对话会混进智能体页的对话列表。
--
--   surface  界面来源：agent 智能体页 / doc 文档工作台 / plan 计划工作台
--   refId    归属对象：doc 时为文档 id，plan 时为计划 id，agent 时为 NULL
--
-- 为什么需要 refId：「这段对话属于哪篇文档/计划」原本只存在浏览器
-- localStorage（studio-chat:doc:<id>）里，换设备/清缓存就断，点「新对话」
-- 还会把上一条变成谁也够不着的孤儿。落到服务端后，工作台可以直接查询自己的历史。
--
-- 历史数据：2026-09-26 之前创建的对话没有来源信息，无法追溯归属。
--   · 默认全部标成 'agent'（其中由工作台产生的那几条，已按首条消息的字面量特征人工订正）
--   · refId 一律为 NULL，不影响任何文档/计划的查询（它们按 refId 精确匹配）

ALTER TABLE "conversation"
  ADD COLUMN "surface" TEXT NOT NULL DEFAULT 'agent';

ALTER TABLE "conversation"
  ADD COLUMN "refId" TEXT;

-- 索引换代：从 (userId, surface, updatedAt) 扩成 (userId, surface, refId, updatedAt)，
-- 后者能覆盖前者（前缀相同），所以直接换掉而不是叠加
DROP INDEX IF EXISTS "conversation_userId_surface_updatedAt_idx";
CREATE INDEX "conversation_userId_surface_refId_updatedAt_idx"
  ON "conversation" ("userId", "surface", "refId", "updatedAt");

-- 人工订正：2026-09-26 前由工作台产生、可凭首条消息确认的对话
-- （'studio' 是过渡期的旧取值，已废弃，统一拆成 doc / plan）
UPDATE "conversation" SET "surface" = 'plan'
WHERE "surface" = 'studio'
  AND "id" IN (
    SELECT c."id" FROM "conversation" c
    JOIN "conversationmessage" m ON m."conversationId" = c."id"
    WHERE m."content" LIKE '帮我制定一个学习计划，我的目标是：%'
  );

UPDATE "conversation" SET "surface" = 'doc'
WHERE "surface" = 'studio';
