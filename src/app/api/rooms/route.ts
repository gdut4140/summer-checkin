import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

// GET /api/rooms — 房间列表
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rooms = await prisma.chatRoom.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { members: true, messages: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error("List rooms error:", error);
    return NextResponse.json({ error: "Failed to list rooms" }, { status: 500 });
  }
}

// POST /api/rooms — 创建房间
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "房间名不能为空" }, { status: 400 });

    const room = await prisma.chatRoom.create({
      data: {
        name,
        members: { create: { userId: user.id } },
      },
    });

    return NextResponse.json({ room });
  } catch (error) {
    console.error("Create room error:", error);
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}
