import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const todos = await prisma.todo.findMany({
    where: { userId: user.id },
    orderBy: [{ completed: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ todos });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { title?: string; completed?: boolean; createdAt?: string }
    | null;
  const title = body?.title?.trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  // completed/createdAt 可选：供老 localStorage 数据一次性迁移时保留原状
  const data: {
    userId: string;
    title: string;
    completed?: boolean;
    createdAt?: Date;
  } = { userId: user.id, title };
  if (typeof body?.completed === "boolean") data.completed = body.completed;
  if (
    typeof body?.createdAt === "string" &&
    !Number.isNaN(Date.parse(body.createdAt))
  ) {
    data.createdAt = new Date(body.createdAt);
  }

  const todo = await prisma.todo.create({ data });
  return NextResponse.json({ todo }, { status: 201 });
}
