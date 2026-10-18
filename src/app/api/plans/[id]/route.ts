import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { syncTasksFromDocument } from "@/lib/studio/plan-sync";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, document: true, updatedAt: true },
  });
  if (!plan || plan.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // 条件请求：与 documents 同构 —— AI 每轮结束后前端会拉一次最新正文，
  // 正文没变时回 304（无 body），避免白传整篇 Markdown。
  const etag = `W/"${plan.updatedAt.getTime()}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  const { updatedAt: _updatedAt, ...payload } = plan;
  return NextResponse.json(payload, { headers: { ETag: etag } });
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

  // 同 documents PATCH：回带 ETag，让客户端保存后把本地 etag 推到最新版本
  return NextResponse.json(updated, {
    headers: { ETag: `W/"${updated.updatedAt.getTime()}"` },
  });
}
