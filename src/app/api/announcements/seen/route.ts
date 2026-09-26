// ============================================================
// 记下「今天已经弹过公告了」
//
// day 由客户端按**自己的本地时区**给出 —— 服务端不知道用户在哪个时区，
// 也不该猜。这里只做格式校验和落库，不做任何日期解释。
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUser } from "@/lib/auth-utils";
import { markAnnouncementSeen } from "@/lib/announcement";

const bodySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "day 需为 YYYY-MM-DD"),
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid day" }, { status: 400 });
  }

  try {
    await markAnnouncementSeen(user.id, parsed.data.day);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Announcement API] mark seen error:", error);
    return NextResponse.json(
      { error: "Failed to update announcement state" },
      { status: 500 }
    );
  }
}
