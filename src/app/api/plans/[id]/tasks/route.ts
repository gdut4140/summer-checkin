import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { planTaskSourceHash } from "@/lib/plan-tasks";

/**
 * 「正在拆分」的判定上限，与 plan-split.ts 的 `2 分钟内视为进行中` 保持同一阈值。
 *
 * 为什么要设上限：tasksSplittingAt 只在拆分收尾路径里被清掉，那次拆分若中途断了
 * （请求取消 / 进程重启 / 超时），标记会**永久**留在库里。此后每次 GET 都返回
 * splitting=true → 抽屉永远显示「任务刷新中」且每 2 秒轮询一次，刷新页面也不恢复。
 * 超过阈值就当没在拆分，让 UI 自愈；plan-split.ts 那边同样超过 2 分钟就允许重新发起。
 */
const SPLITTING_TIMEOUT_MS = 120_000;

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
    // id 兜底排序：拆分出来的任务 weekNumber/dayNumber 多为 null，不加 id 排序不稳定会乱序
    orderBy: [{ weekNumber: "asc" }, { dayNumber: "asc" }, { id: "asc" }],
  });

  // 任务是否过期：文档（含目标/说明）自上次拆分后是否有改动。
  // 从未通过 /split 拆分过（如 AI 直接创建任务）时不判断，避免误报。
  const stale =
    !!plan.tasksSourceHash && plan.tasksSourceHash !== planTaskSourceHash(plan);

  // 是否正在后台拆分任务（抽屉据此显示「任务刷新中」）。超过上限当作没在拆分，
  // 见 SPLITTING_TIMEOUT_MS 的说明——这是崩溃后自愈的唯一入口。
  const splitting =
    !!plan.tasksSplittingAt &&
    Date.now() - plan.tasksSplittingAt.getTime() < SPLITTING_TIMEOUT_MS;

  return NextResponse.json({
    stale,
    splitting,
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
