// ============================================================
// Day 7 新增：
// ① isStepCount       — 控制多步调用，Tool Calling 需要 ≥2 步
// ② createStudyTools  — 工厂函数，为当前用户创建学习助手工具
// ③ tools             — streamText 的 tools 参数，让 LLM 调用项目功能
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getAIModel, generateChatTitle, SYSTEM_PROMPT } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";
import { streamText, toTextStream, createTextStreamResponse, isStepCount } from "ai";
import { createStudyTools } from "@/lib/tools";

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
    // Day 3 核心：streamText 替代 getAIResponse
    // ① streamText() 返回一个流式结果，AI 的每个 token 实时产出
    // ② onFinish 回调 — 流结束后触发，用于保存完整回复到 DB
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
      system: SYSTEM_PROMPT,
      messages: messages,
      // Day 7: 为当前用户创建学习助手工具
      tools: createStudyTools(user.id),
      // Day 7: 允许多步 — 默认 1 步不够 Tool Calling 闭环
      stopWhen: isStepCount(5),
      onFinish: async ({ text }) => {
        // 流完成后保存 AI 回复到数据库
        await prisma.conversationMessage.create({
          data: {
            conversationId: activeConversationId!,
            role: "assistant",
            content: text,
          },
        });

        // 更新对话的 updatedAt
        await prisma.conversation.update({
          where: { id: activeConversationId! },
          data: { updatedAt: new Date() },
        });

        // 兼容旧的 AIHistory
        await prisma.aIHistory.create({
          data: {
            userId: user.id,
            message: lastUserMsg.content,
            response: text,
          },
        });
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
