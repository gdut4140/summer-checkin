// ============================================================
// Day 7 新增：
// ① isStepCount       — 控制多步调用，Tool Calling 需要 ≥2 步
// ② createStudyTools  — 工厂函数，为当前用户创建学习助手工具
// ③ tools             — streamText 的 tools 参数，让 LLM 调用项目功能
//
// Day 13 新增：长期记忆
// ④ 注入记忆          — streamText 前查询 UserMemory 拼入 system prompt
// ⑤ 提取记忆          — onEnd 中 fire-and-forget 用 AI 提取新记忆
//
// Day 16 新增：RAG 知识库
// ⑥ RAG 工具          — searchKnowledgeBase 搜索知识库文档
// ⑦ RAG 注入          — 主动检索知识库，结果拼入 system prompt
//
// Day 22 新增：Agent Workflow
// ⑧ Agent 工具        — breakdownPlanTasks, getPlanTasks, updateTaskStatus, getTodayTasks
// ⑨ 增至 10 步        — Agent 工作流需要更多 LLM 步骤
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getAIModel, getDeepThinkOptions, generateChatTitle, SYSTEM_PROMPT } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";
import { streamText, toTextStream, createTextStreamResponse, isStepCount } from "ai";
import { createStudyTools, createRAGTool, createAgentTools, createCoachTools } from "@/lib/tools";
import {
  getRelevantMemories,
  formatMemoriesForPrompt,
  extractAndSaveMemories,
  touchMemories,
} from "@/lib/memory";
import {
  searchKnowledge,
  formatKnowledgeForPrompt,
} from "@/lib/rag";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const messages = body.messages as {
      role: "user" | "assistant";
      content: string;
    }[];
    const conversationId = body.conversationId as string | undefined;
    const deepThink = body.deepThink as boolean | undefined;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    // 如果没有 conversationId，自动创建一个新对话
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const lastMessage = messages[messages.length - 1];
      const title = await generateChatTitle(lastMessage.content);

      const conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          title,
        },
      });
      activeConversationId = conversation.id;
    }

    // 保存用户消息
    const lastUserMsg = messages[messages.length - 1];
    await prisma.conversationMessage.create({
      data: {
        conversationId: activeConversationId,
        role: "user",
        content: lastUserMsg.content,
      },
    });

    // ============================================================
    // Day 12 新增：短期记忆 — 后端兜底截断
    // 只取最近 20 轮（40 条消息），超出部分被省略
    // （前端已做截断，后端再做一层保险）
    // ============================================================
    const MAX_CONTEXT_ROUNDS = 20;
    const MAX_CONTEXT_MESSAGES = MAX_CONTEXT_ROUNDS * 2;
    const truncatedMessages =
      messages.length > MAX_CONTEXT_MESSAGES
        ? messages.slice(-MAX_CONTEXT_MESSAGES)
        : messages;

    if (messages.length > MAX_CONTEXT_MESSAGES) {
      console.log(
        `[AI] 后端截断: ${messages.length} → ${MAX_CONTEXT_MESSAGES} 条消息`
      );
    }

    // ============================================================
    // Day 13 新增：注入长期记忆到 system prompt
    // ============================================================
    const memories = await getRelevantMemories(user.id);
    const memoryPrompt = formatMemoriesForPrompt(memories);

    // 标记记忆被检索使用（用于冷淘汰：不用的记忆会被清理）
    touchMemories(memories.map((m) => m.id)).catch(() => {});

    // ============================================================
    // Day 16 新增：主动检索知识库
    // 对用户的最后一条消息做知识库搜索，结果注入 system prompt
    // ============================================================
    let ragPrompt = "";
    try {
      const ragResult = await searchKnowledge(lastUserMsg.content, user.id);
      ragPrompt = formatKnowledgeForPrompt(ragResult);
    } catch (err) {
      // RAG 检索失败不阻塞对话
      console.warn("[AI] RAG 检索跳过（服务不可用）:", err);
    }

    const fullSystem = [SYSTEM_PROMPT, ragPrompt, memoryPrompt]
      .filter(Boolean)
      .join("\n\n");

    // ============================================================
    // Day 3 核心：streamText 替代 getAIResponse
    // ① streamText() 返回一个流式结果，AI 的每个 token 实时产出
    // ② onEnd 回调 — 流+工具全部完成后触发，保存 AI 回复到 DB
    // ③ toTextStreamResponse() — 将流包装成 HTTP Response 返回给前端
    //
    // Day 7 新增：Tool Calling — 让 AI 操作项目已有功能
    // ④ tools      — createStudyTools(userId) 为当前用户创建工具
    //                 AI 可以：创建计划、查询计划、查询打卡记录
    // ⑤ stopWhen   — isStepCount(5) 允许多步调用：
    //                 Step 1: LLM 判断 → 调用 tool → execute 写入 DB
    //                 Step 2: LLM 基于 tool 结果 → 生成自然语言回复
    //                 （默认 isStepCount(1) 无法完成 Tool Calling 闭环）
    // ============================================================
    const result = streamText({
      model: getAIModel(),
      system: fullSystem,
      providerOptions: getDeepThinkOptions(deepThink ?? false),
      messages: truncatedMessages,
      // Day 7: 学习工具 + Day 16: RAG 知识库工具 + Day 22: Agent Workflow 工具
      // Phase 1: Coach 工具（学习分析 + 计划调整）
      tools: {
        ...createStudyTools(user.id),
        ...createRAGTool(user.id),
        ...createAgentTools(user.id),
        ...createCoachTools(user.id),
      },
      // Day 7: 允许多步 — 默认 1 步不够 Tool Calling 闭环
      // Day 22: 增至 10 步 — Agent Workflow 需要更多步骤（规划→拆分→检查）
      stopWhen: isStepCount(10),
      // Day 7 调试：观察每一步的执行情况
      onStepEnd: (step) => {
        console.log(
          `[AI] Step | finishReason=${step.finishReason} | ` +
          `text=${step.text?.length ?? 0}chars | ` +
          `toolCalls=${step.toolCalls?.length ?? 0} | ` +
          `toolResults=${step.toolResults?.length ?? 0}`
        );
      },
      // Day 7 修复：onEnd 替代废弃的 onFinish
      // ① onEnd 确保所有 tool execution 完成后才回调
      // ② text 为空时从 steps 兜底取最后一步的文本
      // ③ try-catch 避免单个 DB 失败导致静默中断
      onEnd: async ({ text, steps }) => {
        // 兜底：text 可能为空（tool calling 场景），从 steps 获取
        const finalText =
          text || steps?.at(-1)?.text || "";

        if (!finalText || !activeConversationId) {
          console.warn("[AI] onEnd: no text or no conversationId, 跳过保存", {
            hasText: !!finalText,
            hasConversationId: !!activeConversationId,
          });
          return;
        }

        console.log(
          `[AI] onEnd: 保存 AI 回复 (${finalText.length} 字符) → conversation:${activeConversationId}`
        );

        try {
          await prisma.conversationMessage.create({
            data: {
              conversationId: activeConversationId,
              role: "assistant",
              content: finalText,
            },
          });

          await prisma.conversation.update({
            where: { id: activeConversationId },
            data: { updatedAt: new Date() },
          });

          await prisma.aIHistory.create({
            data: {
              userId: user.id,
              message: lastUserMsg.content,
              response: finalText,
            },
          });

          console.log("[AI] onEnd: 保存成功 ✅");

          // ============================================================
          // Day 13: fire-and-forget 提取长期记忆
          // ============================================================
          extractAndSaveMemories(
            user.id,
            lastUserMsg.content,
            finalText
          ).catch((err) =>
            console.error("[Memory] 后台提取失败:", err)
          );
        } catch (err) {
          console.error("[AI] onEnd: 数据库写入失败", err);
        }
      },
    });

    // Day 3: 用独立 helper 函数创建流式响应（非弃用方法）
    // ① toTextStream — 将 streamText 的原始流转为纯文本流
    // ② createTextStreamResponse — 包装成 HTTP Response，设置自定义 header
    const textStream = toTextStream({ stream: result.stream });
    return createTextStreamResponse({
      stream: textStream,
      headers: {
        "X-Conversation-Id": activeConversationId,
        "Access-Control-Expose-Headers": "X-Conversation-Id",
      },
    });
  } catch (error) {
    console.error("AI API error:", error);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}
