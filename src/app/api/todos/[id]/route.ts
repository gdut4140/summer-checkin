import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { title?: string; completed?: boolean }
    | null;

  const title = body?.title?.trim();
  const completed = body?.completed;
  // 至少提供 title 或 completed 之一
  const hasTitle = typeof title === "string" && title.length > 0;
  const hasCompleted = typeof completed === "boolean";
  if (!hasTitle && !hasCompleted) {
    return NextResponse.json(
      { error: "Title or Completed is required" },
      { status: 400 }
    );
  }

  const existing = await prisma.todo.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Todo not found" }, { status: 404 });

  const data: { title?: string; completed?: boolean } = {};
  if (hasTitle) data.title = title;
  if (hasCompleted) data.completed = completed;

  const todo = await prisma.todo.update({ where: { id }, data });
  return NextResponse.json({ todo });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await prisma.todo.deleteMany({ where: { id, userId: user.id } });
  if (!result.count) return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
