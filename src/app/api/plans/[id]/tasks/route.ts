import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan || plan.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tasks = await prisma.planTask.findMany({
    where: { planId: id },
    orderBy: [{ weekNumber: "asc" }, { dayNumber: "asc" }],
  });
  return NextResponse.json({
    tasks: tasks.map((t) => ({ ...t, completedAt: t.completedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString() })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { taskId, status, title, dayNumber } = await req.json();

  const task = await prisma.planTask.findUnique({ where: { id: taskId } });
  if (!task || task.planId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan || plan.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (dayNumber !== undefined) data.dayNumber = dayNumber;
  if (status !== undefined) { data.status = status; data.completedAt = status === "done" ? new Date() : null; }

  const updated = await prisma.planTask.update({ where: { id: taskId }, data });
  return NextResponse.json({ ...updated, completedAt: updated.completedAt?.toISOString() ?? null, createdAt: updated.createdAt.toISOString() });
}
