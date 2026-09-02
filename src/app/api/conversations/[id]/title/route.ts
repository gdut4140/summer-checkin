import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { completionsWithFallback } from "@/lib/model-pool";

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

    const { data: response } = await completionsWithFallback(
      "low",
      (entry, client, extraBody) =>
        client.chat.completions.create({
          model: entry.modelName,
          messages: [
            {
              role: "system",
              content: `根据对话历史生成标题，不超过20字，只输出标题本身。不暴露模型信息、API Key、用户隐私等敏感信息。`,
            },
            { role: "user", content: `请为以下对话生成标题：\n\n${messagesSummary}` },
          ],
          temperature: 0.5,
          ...extraBody,
        }),
      { userId: user.id, surface: "title" }
    );

    const rawContent = response.choices[0]?.message?.content;
    console.log(`[Title PATCH] API返回: "${rawContent}"`);
    const newTitle = rawContent?.trim() || conversation.title || "未命名对话";

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
