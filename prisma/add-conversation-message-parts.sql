-- 对话消息结构化：conversationmessage 表新增 parts
--
-- 背景：AI 回复此前只以纯文本落库（content），流式协议也只传文本，导致
-- 「AI 调用了什么工具」在服务端有（onStepEnd 的日志打得到），却没有任何信道
-- 抵达浏览器。前端把 /api/ai 迁到 AI SDK 的 UI Message Stream 协议后，助手消息
-- 变成一组 part（text / tool），工具调用才能渲染成卡片。
--
--   content  纯文本，**继续写**。标题生成与 conversationHint 都按字符串读它。
--   parts    结构化片段，形状见 src/lib/ai/parts.ts 的 ViewPart。
--
-- 为什么 nullable：2026-10 之前的存量行只有 content，没有工具信息可回填。parts 为
-- null 时前端回落到纯文本渲染，旧对话照常可读——不做数据迁移，也就没有回滚风险。
--
-- 为什么不存 AI SDK 的 UIMessagePart 原样：工具的 input/output 会在落库前被压成
-- 一条短摘要。updateDocument 的 input 是**整篇文档**（zod 上限 100000 字符），
-- 原样落库等于把整篇文档复制进每一条消息行。
--
-- 本地开发库由 `prisma db push` 同步，本文件供部署库执行（与
-- add-conversation-surface-ref.sql 同一套做法：幂等，可重复执行）。

ALTER TABLE "conversationmessage"
  ADD COLUMN IF NOT EXISTS "parts" JSONB;
