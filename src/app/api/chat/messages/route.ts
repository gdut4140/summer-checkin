import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

/**
 * GET /api/chat/messages                  — 最新 100 条聊天记录（单房间全局流）
 * GET /api/chat/messages?before=<id>      — 该消息**之前**（更早）的 100 条，供上滑加载历史
 *
 * 游标分页而不是 page=1/2/3：聊天流会不断插入新消息，用页码翻页时「第 2 页」
 * 的含义会随新消息漂移，导致漏读或重读；游标钉在具体一条消息上则不会。
 *
 * 响应新增 hasMore / nextCursor。老客户端只读 messages，行为不变（默认仍是最新 100 条）。
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const params = request.nextUrl.searchParams;
    const before = params.get("before");
    const rawLimit = Number(params.get("limit"));
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const rows = await prisma.chatMessage.findMany({
      // 倒序取「最新的 N+1 条」，再翻回正序返回：
      // 多取的那一条只用来判断「还有没有更早的」，不返回给前端。
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      // 有游标时从该条之后（更早方向）继续取；skip:1 跳过游标自身
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, name: true, image: true } },
        // 引用回复：带出被引用消息快照（含其发送者名字）
        replyTo: { include: { user: { select: { name: true } } } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const list = page.reverse().map((m) => ({
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

    return NextResponse.json({
      messages: list,
      hasMore,
      // 下一页的游标 = 本次返回里最旧的那一条
      nextCursor: list.length > 0 ? list[0].id : null,
    });
  } catch (error) {
    console.error("List chat messages error:", error);
    return NextResponse.json({ error: "Failed to list messages" }, { status: 500 });
  }
}
