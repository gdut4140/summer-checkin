// ============================================================
// Phase 4: Agent Decision API — 单条决策操作（采纳/拒绝）
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { updateDecisionStatus } from "@/lib/agent/decisions";

// PATCH /api/agent/decisions/[id] — 更新决策状态
// Body: { status: "executed" | "rejected", feedback?: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const { status, feedback } = body;
    if (status !== "executed" && status !== "rejected") {
      return NextResponse.json(
        { error: "Invalid status. Use 'executed' or 'rejected'" },
        { status: 400 }
      );
    }

    const ok = await updateDecisionStatus(id, user.id, status, feedback);
    if (!ok) {
      return NextResponse.json(
        { error: "Decision not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Decision API] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update decision" },
      { status: 500 }
    );
  }
}
