import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// DELETE /api/conversations/[id]/messages — 清空对话的所有消息
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // 验证对话属于当前用户
    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation || conversation.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 删除该对话的所有消息
    await prisma.conversationMessage.deleteMany({
      where: { conversationId: id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clear messages error:", error);
    return NextResponse.json(
      { error: "Failed to clear messages" },
      { status: 500 }
    );
  }
}
