import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/todos/sync
 * 前台传入本地 todos 全量列表，后端差量同步：
 * - 新 todo → 创建
 * - 已存在 → 更新 completed
 * - 本地已删除的 → 后端也删除
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { todos } = (await req.json()) as {
    todos: { id: string; title: string; completed: boolean; createdAt: string }[];
  };

  if (!Array.isArray(todos)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const localIds = todos.map((t) => t.id);

  // 1. 删除后端有但本地没有的
  await prisma.todo.deleteMany({
    where: {
      userId: user.id,
      id: { notIn: localIds },
    },
  });

  // 2. 逐个 upsert
  for (const t of todos) {
    await prisma.todo.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        userId: user.id,
        title: t.title,
        completed: t.completed,
        createdAt: new Date(t.createdAt),
      },
      update: {
        title: t.title,
        completed: t.completed,
      },
    });
  }

  return NextResponse.json({ synced: todos.length });
}
