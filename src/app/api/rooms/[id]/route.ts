import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/rooms/:id — 房间详情 + 最近消息（含用户信息）
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const room = await prisma.chatRoom.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 100,
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    });

    if (!room) return NextResponse.json({ error: "房间不存在" }, { status: 404 });
    return NextResponse.json({ room });
  } catch (error) {
    console.error("Get room error:", error);
    return NextResponse.json({ error: "Failed to get room" }, { status: 500 });
  }
}
