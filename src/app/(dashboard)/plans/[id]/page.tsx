import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PlanDetail } from "@/components/plans/plan-detail";
import type { PlanTaskInfo } from "@/types";
function IconArrowLeft({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M224 128a8 8 0 0 1-8 8H59.31l58.35 58.34a8 8 0 0 1-11.32 11.32l-72-72a8 8 0 0 1 0-11.32l72-72a8 8 0 0 1 11.32 11.32L59.31 120H216a8 8 0 0 1 8 8Z"/></svg>;
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  // /plans/new → 新建表单
  if (id === "new") {
    return redirect("/plans/new");
  }

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ weekNumber: "asc" }, { dayNumber: "asc" }],
      },
    },
  });

  if (!plan || plan.userId !== user.id) {
    notFound();
  }

  const totalTasks = plan.tasks.length;
  const completedTasks = plan.tasks.filter((t) => t.status === "done").length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const tasksStats = {
    total: totalTasks,
    done: completedTasks,
    inProgress: plan.tasks.filter((t) => t.status === "in_progress").length,
  };

  return (
    <div className="product-page max-w-5xl">
      <Link
        href="/plans"
        className="mb-5 inline-flex items-center gap-1 text-xs text-white/44 transition-colors hover:text-white"
      >
        <IconArrowLeft className="h-4 w-4" />
        返回计划列表
      </Link>

      <PlanDetail
        plan={{
          id: plan.id,
          name: plan.name,
          description: plan.description,
          goal: plan.goal,
          startDate: plan.startDate,
          endDate: plan.endDate,
          status: plan.status,
          createdAt: plan.createdAt,
          totalTasks,
          completedTasks,
          progress,
        }}
        tasks={plan.tasks.map((t) => ({
          id: t.id,
          planId: plan.id,
          title: t.title,
          description: t.description,
          dayNumber: t.dayNumber,
          weekNumber: t.weekNumber,
          category: t.category as PlanTaskInfo["category"],
          status: t.status as PlanTaskInfo["status"],
          priority: t.priority as PlanTaskInfo["priority"],
          completedAt: t.completedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        }))}
        tasksStats={tasksStats}
      />
    </div>
  );
}
