import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { syncTasksFromDocument } from "@/lib/studio/plan-sync";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, document: true },
  });
  if (!plan || plan.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(plan);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan || plan.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.goal !== undefined) data.goal = body.goal;
  if (body.description !== undefined) data.description = body.description;
  if (body.status !== undefined) data.status = body.status;
  if (body.document !== undefined) data.document = body.document;

  const updated = await prisma.plan.update({ where: { id }, data });

  // 文档变更时，把「## 任务安排」段落同步回 PlanTask（勾选状态 + 新增任务，不删除）
  if (typeof body.document === "string") {
    const sync = await syncTasksFromDocument(id, user.id, body.document).catch(
      (err) => {
        console.error("[PATCH plan] 任务同步失败:", err);
        return { created: 0, updated: 0 };
      }
    );
    if (sync.created > 0 || sync.updated > 0) {
      console.log(
        `[PATCH plan] 文档任务同步: 新增 ${sync.created}，更新 ${sync.updated}`
      );
    }
  }

  return NextResponse.json(updated);
}
