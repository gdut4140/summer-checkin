// ============================================================
// Phase 4: Agent Decision API — 决策列表查询
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { listDecisions, getDecisionStats } from "@/lib/agent/decisions";

// GET /api/agent/decisions — 获取决策列表 + 统计
// Query: ?type=PLAN_ADJUST&limit=20&includeStats=true
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as string | undefined;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "20", 10) || 20,
      100
    );
    const includeStats = searchParams.get("includeStats") !== "false";

    const [decisions, stats] = await Promise.all([
      listDecisions(user.id, {
        type: type as never,
        limit,
      }),
      includeStats ? getDecisionStats(user.id) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      decisions,
      stats,
    });
  } catch (error) {
    console.error("[Decision API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to get decisions" },
      { status: 500 }
    );
  }
}
