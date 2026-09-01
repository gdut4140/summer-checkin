import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// GET /api/chat/messages — 最近 100 条聊天记录（单房间全局流）
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const messages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, image: true } },
        // 引用回复：带出被引用消息快照（含其发送者名字）
        replyTo: { include: { user: { select: { name: true } } } },
      },
    });

    const list = messages.reverse().map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      aiRole: m.aiRole,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      user: m.user
        ? { name: m.user.name, image: m.user.image }
        : null,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            userId: m.replyTo.userId,
            userName: m.replyTo.user?.name ?? "用户",
            content: m.replyTo.content,
          }
        : null,
    }));

    return NextResponse.json({ messages: list });
  } catch (error) {
    console.error("List chat messages error:", error);
    return NextResponse.json({ error: "Failed to list messages" }, { status: 500 });
  }
}
