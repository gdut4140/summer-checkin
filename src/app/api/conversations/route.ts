import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const SURFACES = ["agent", "doc", "plan"] as const;
type Surface = (typeof SURFACES)[number];

// GET /api/conversations — 获取对话列表
//
// 三种界面（智能体页 / 文档工作台 / 计划工作台）的对话存在同一张表里，
// 必须带 surface 才不串台：
//   ?surface=agent（缺省）        智能体页的对话
//   ?surface=doc&refId=<文档 id>  某篇文档的对话
//   ?surface=plan&refId=<计划 id> 某个计划的对话
// doc / plan 必须带 refId：不带就等于把该用户所有文档的对话一起列出来，
// 既没有意义也违背「严格区分」，所以直接 400 挡掉。
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const surface = (params.get("surface") ?? "agent") as Surface;
    if (!SURFACES.includes(surface)) {
      return NextResponse.json(
        { error: `surface 只能是 ${SURFACES.join(" / ")}` },
        { status: 400 }
      );
    }

    const refId = params.get("refId");
    if (surface !== "agent" && !refId) {
      return NextResponse.json(
        { error: `surface=${surface} 必须带 refId` },
        { status: 400 }
      );
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        userId: user.id,
        surface,
        ...(refId ? { refId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 1, // 只取第一条作为预览
        },
      },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    return NextResponse.json(
      { error: "Failed to get conversations" },
      { status: 500 }
    );
  }
}

// POST /api/conversations — 创建新对话
// 注意：目前没有调用方（对话由 /api/ai 按需自动创建）。保留 surface / refId 入参，
// 免得将来有人接上它却漏了归属，又造出一批串台或够不着的对话。
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const title = body.title?.trim() || "新对话";
    const surface: Surface = SURFACES.includes(body.surface) ? body.surface : "agent";
    const refId = typeof body.refId === "string" && body.refId ? body.refId : null;
    if (surface !== "agent" && !refId) {
      return NextResponse.json(
        { error: `surface=${surface} 必须带 refId` },
        { status: 400 }
      );
    }

    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title,
        surface,
        refId,
      },
    });

    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("Create conversation error:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations — 删除对话
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
    }

    // 确保对话属于当前用户
    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation || conversation.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.conversation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete conversation error:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}
