// 计划任务拆分接口：把计划文档总结成平铺的、可打勾的任务清单。
// 实际逻辑在 src/lib/plan-split.ts（splitPlanTasks），供 createPlan 工具与前端共用。

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { splitPlanTasks } from "@/lib/plan-split";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // ?force=1 → 跳过「AI 判断大意没变」那道闸门，直接重拆。
  // 那道判断是模型猜的，用户认为改了而模型说没改时需要能覆盖它（见 splitPlanTasks）。
  const force = new URL(req.url).searchParams.get("force") === "1";

  try {
    const result = await splitPlanTasks(id, user.id, { force });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "拆分失败";
    const status = message.includes("可拆分的内容") ? 400 : 500;
    console.error("[split] 拆分失败:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
