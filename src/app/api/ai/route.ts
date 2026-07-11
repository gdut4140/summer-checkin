import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getAIResponse } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";

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
      const title =
        lastMessage.content.slice(0, 30) + (lastMessage.content.length > 30 ? "..." : "");

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

    // 调用 AI
    const response = await getAIResponse(messages);

    // 保存 AI 回复
    await prisma.conversationMessage.create({
      data: {
        conversationId: activeConversationId,
        role: "assistant",
        content: response,
      },
    });

    // 更新对话的 updatedAt
    await prisma.conversation.update({
      where: { id: activeConversationId },
      data: { updatedAt: new Date() },
    });

    // 同时保留旧的 AIHistory 兼容（可选，后续可移除）
    await prisma.aIHistory.create({
      data: {
        userId: user.id,
        message: lastUserMsg.content,
        response,
      },
    });

    return NextResponse.json({
      response,
      conversationId: activeConversationId,
    });
  } catch (error) {
    console.error("AI API error:", error);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}
