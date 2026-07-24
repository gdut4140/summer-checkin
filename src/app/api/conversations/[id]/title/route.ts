import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createAIClient } from "@/lib/deepseek";

// PATCH /api/conversations/[id]/title — 根据完整对话历史重新生成标题
export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // 查对话及其所有消息
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!conversation || conversation.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 至少需要一轮对话（2条消息）才有意义更新标题
    if (conversation.messages.length < 2) {
      return NextResponse.json({ title: conversation.title, skipped: true });
    }

    // 构造对话摘要，取前几条和后几条作为上下文
    const messagesSummary = conversation.messages
      .map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.content}`)
      .join("\n");

    const client = createAIClient();

    const response = await client.chat.completions.create({
      model: process.env.DASHSCOPE_MODEL ?? "deepseek-chat",
      messages: [
        {
          role: "system",
          content: `你是一个标题生成助手。根据用户与AI的完整对话历史，生成一个简洁的对话标题（不超过20个字）。标题应概括对话的核心主题。只返回标题文本，不要加引号、标点或额外解释。

如果对话涉及多个主题，以最新讨论的主题为准。`,
        },
        { role: "user", content: `请为以下对话生成标题：\n\n${messagesSummary}` },
      ],
      temperature: 0.5,
      max_tokens: 50,
    });

    const newTitle =
      response.choices[0]?.message?.content?.trim() ||
      conversation.title;

    // 只有标题确实变化了才更新数据库
    if (newTitle !== conversation.title) {
      await prisma.conversation.update({
        where: { id },
        data: { title: newTitle },
      });
    }

    return NextResponse.json({ title: newTitle, skipped: false });
  } catch (error) {
    console.error("Update title error:", error);
    return NextResponse.json(
      { error: "Failed to update title" },
      { status: 500 }
    );
  }
}
