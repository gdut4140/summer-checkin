// 计划任务拆分接口：把计划文档总结成平铺的、可打勾的任务清单。
// 实际逻辑在 src/lib/plan-split.ts（splitPlanTasks），供 createPlan 工具与前端共用。

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { splitPlanTasks } from "@/lib/plan-split";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const result = await splitPlanTasks(id, user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "拆分失败";
    const status = message.includes("可拆分的内容") ? 400 : 500;
    console.error("[split] 拆分失败:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
