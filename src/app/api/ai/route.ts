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
import { getDeepThinkOptions, generateChatTitle, SYSTEM_PROMPT } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";
import { createTextStreamResponse, isStepCount } from "ai";
import { streamTextWithFallback, isQuotaError } from "@/lib/model-pool";
import { assertInteractiveUsageAllowed, UsageLimitError, ENERGY_DOWN_MESSAGE } from "@/lib/usage";
import { createStudyTools, createRAGTool, createAgentTools } from "@/lib/tools";
import { createStudioTools } from "@/lib/tools/studio-tools";
import {
  getRelevantMemories,
  formatMemoriesForPrompt,
  extractAndSaveMemories,
  touchMemories,
} from "@/lib/memory";
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 交互式面：每日限额早检（超限抛 UsageLimitError，由外层 catch 流式返回友好文本；不建会话不写库）
    await assertInteractiveUsageAllowed(user.id);

    const body = await request.json();
    const messages = body.messages as {
      role: "user" | "assistant";
      content: string;
    }[];
    const conversationId = body.conversationId as string | undefined;
    const deepThink = body.deepThink as boolean | undefined;
    const studioContext = body.studioContext as
      | { kind?: "plan" | "doc"; refId?: string; document?: string }
      | undefined;

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
      const title = await generateChatTitle(lastMessage.content, user.id);

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

    // 最近对话摘要：createPlan 后台生成计划文档时作为个性化上下文（截断，控制成本）
    const conversationHint = truncatedMessages
      .slice(-6)
      .map((m) => `${m.role === "user" ? "用户" : "雨宝"}: ${m.content.slice(0, 200)}`)
      .join("\n");

    // ============================================================
    // Day 16 知识库检索：不再主动注入
    // 交给 AI 通过 searchKnowledgeBase 工具自行判断是否检索，
    // 避免寒暄/闲聊消息也白白做向量检索拖慢回复
    // ============================================================

    // ============================================================
    // Phase 3/4 文档工作室：注入当前文档上下文 + 文档修改工具
    // ============================================================
    let studioPrompt = "";
    let studioTools = {};
    const studioKind = studioContext?.kind;
    const studioRefId = studioContext?.refId;
    if (
      (studioKind === "plan" || studioKind === "doc") &&
      studioRefId &&
      typeof studioContext?.document === "string"
    ) {
      if (studioKind === "plan") {
        const plan = await prisma.plan.findFirst({
          where: { id: studioRefId, userId: user.id },
          select: { id: true, name: true },
        });
        if (plan) {
          studioTools = createStudioTools(user.id, {
            kind: "plan",
            id: plan.id,
          });
          studioPrompt = [
            `用户正在文档工作室里编辑学习计划「${plan.name}」的 Markdown 文档，完整内容如下：`,
            "",
            studioContext.document,
            "",
            "你可以调用工具直接修改它：调整计划信息用 updatePlanInfo；修改文档内容用 updateDocument（必须传完整的修改后文档）。",
            "涉及任务时，请同步修改文档中「## 任务安排」段落的任务行。",
          ].join("\n");
        }
      } else {
        const doc = await prisma.document.findFirst({
          where: { id: studioRefId, userId: user.id },
          select: { id: true, title: true },
        });
        if (doc) {
          studioTools = createStudioTools(user.id, { kind: "doc", id: doc.id });
          studioPrompt = [
            `用户正在文档工作室里编辑文档「${doc.title}」的 Markdown 内容，完整内容如下：`,
            "",
            studioContext.document,
            "",
            "你可以用 updateDocument 工具直接修改这份文档（必须传完整的修改后文档）。",
          ].join("\n");
        }
      }
    }

    // ============================================================
    // 用户个人资料名字注入
    // 聊天系统提示词带上用户设置的名字，设置页改名立即生效；
    // 用户在当前对话里明确要求换称呼时，以用户最新说的为准。
    // ============================================================
    const userNamePrompt = user.name
      ? [
          `## 用户名字`,
          `用户设置里的名字是「${user.name}」，称呼用户时优先用这个名字。`,
          `如果用户在这段对话中明确说要换别的称呼，以用户最新说的为准。`,
        ].join("\n")
      : "";

    const fullSystem = [SYSTEM_PROMPT, userNamePrompt, studioPrompt, memoryPrompt]
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
    // 走模型池 HIGH 档（agent/文档），免费额度耗尽自动降级到下一个模型
    const { stream } = await streamTextWithFallback("high", (_entry, model) => ({
      model,
      system: fullSystem,
      providerOptions: getDeepThinkOptions(deepThink ?? false),
      messages: truncatedMessages,
      // Day 7: 学习工具 + Day 16: RAG 知识库工具 + Day 22: Agent Workflow 工具
      // Phase 1: Coach 工具（学习分析 + 计划调整）
      tools: {
        // 在文档工作室里编辑已有计划/文档时，不给 createPlan，避免 AI 新建重复计划；
        // 聊天场景把最近对话 + 长期记忆带给 createPlan，用于后台生成个性化计划文档
        ...createStudyTools(
          user.id,
          studioContext
            ? { excludeCreatePlan: true }
            : { conversation: conversationHint, memories: memoryPrompt }
        ),
        ...createRAGTool(user.id),
        ...createAgentTools(user.id),
        ...studioTools,
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
    }), {
      userId: user.id,
      surface: studioContext ? "studio" : "agent",
      enforce: true,
    });

    return createTextStreamResponse({
      stream,
      headers: {
        "X-Conversation-Id": activeConversationId,
        "Access-Control-Expose-Headers": "X-Conversation-Id",
      },
    });
  } catch (error) {
    // 每日精力用完（UsageLimitError）或余额/配额不足（isQuotaError）：
    // 统一流式返回「我宕机了，呃啊」，前端照常渲染为雨宝的回复
    if (error instanceof UsageLimitError || isQuotaError(error)) {
      return limitStreamResponse(ENERGY_DOWN_MESSAGE);
    }
    console.error("AI API error:", error);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}

/** 把一段文本包装成流式响应（雨宝没精力时的友好提示） */
function limitStreamResponse(message: string) {
  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue(message);
      controller.close();
    },
  });
  return createTextStreamResponse({ stream });
}
