// ============================================================
// 全站公告 — 只读接口
//
// 公告由站主通过 scripts/announce.ts 写入（目前没有管理界面）。
// 这里只负责读；需要登录才能看，和仪表盘其余接口保持一致。
// ============================================================

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getAnnouncementSeenOn, listAnnouncements } from "@/lib/announcement";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [announcements, seenOn] = await Promise.all([
      listAnnouncements(),
      getAnnouncementSeenOn(user.id),
    ]);

    return NextResponse.json({
      announcements: announcements.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        popup: a.popup,
        createdAt: a.createdAt.toISOString(),
      })),
      // 客户端拿它和自己的本地日期比 —— 相等就说明今天已经弹过（可能是别的设备弹的）
      seenOn,
    });
  } catch (error) {
    console.error("[Announcement API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load announcements" },
      { status: 500 }
    );
  }
}
