import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { getTodayUsage } from "@/lib/usage";

// GET /api/usage — 当前用户今日 AI 用量（雨宝精力）
export async function GET(_request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usage = await getTodayUsage(user.id);
  return NextResponse.json(usage);
}
