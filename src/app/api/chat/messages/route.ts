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
      include: { user: { select: { id: true, name: true, image: true } } },
    });

    return NextResponse.json({ messages: messages.reverse() });
  } catch (error) {
    console.error("List chat messages error:", error);
    return NextResponse.json({ error: "Failed to list messages" }, { status: 500 });
  }
}
