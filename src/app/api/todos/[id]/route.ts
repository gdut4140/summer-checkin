import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as { completed?: boolean } | null;
  if (typeof body?.completed !== "boolean") {
    return NextResponse.json({ error: "Completed is required" }, { status: 400 });
  }

  const existing = await prisma.todo.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Todo not found" }, { status: 404 });
  const todo = await prisma.todo.update({ where: { id }, data: { completed: body.completed } });
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
