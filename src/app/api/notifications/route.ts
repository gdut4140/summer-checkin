// ============================================================
// Phase 3: 通知 API — 列表查询 / 全部已读
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import {
  listNotifications,
  markAllAsRead,
  getUnreadCount,
} from "@/lib/notification";

// GET /api/notifications — 获取通知列表
// Query: ?unreadOnly=true&type=reminder&limit=20&offset=0
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const type = searchParams.get("type") as string | undefined;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "20", 10) || 20,
      100
    );
    const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

    const [result, unreadCount] = await Promise.all([
      listNotifications(user.id, {
        unreadOnly,
        type: type as never,
        limit,
        offset,
      }),
      getUnreadCount(user.id),
    ]);

    return NextResponse.json({
      notifications: result.notifications,
      total: result.total,
      unreadCount,
      hasMore: offset + limit < result.total,
    });
  } catch (error) {
    console.error("[Notification API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get notifications" },
      { status: 500 }
    );
  }
}

// POST /api/notifications — 标记全部已读
// Body: { action: "markAllRead" }
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.action === "markAllRead") {
      const count = await markAllAsRead(user.id);
      return NextResponse.json({ success: true, markedRead: count });
    }

    return NextResponse.json(
      { error: "Invalid action. Supported: markAllRead" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Notification API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
