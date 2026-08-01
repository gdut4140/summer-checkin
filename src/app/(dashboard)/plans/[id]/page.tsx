import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PlanDetail } from "@/components/plans/plan-detail";
import { Button } from "@/components/ui/button";
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
      checkins: { select: { hours: true } },
      tasks: {
        orderBy: [{ weekNumber: "asc" }, { dayNumber: "asc" }],
      },
    },
  });

  if (!plan || plan.userId !== user.id) {
    notFound();
  }

  const totalHours = plan.checkins.reduce((s, c) => s + c.hours, 0);
  const progress = plan.targetHours > 0
    ? Math.min(100, Math.round((totalHours / plan.targetHours) * 100))
    : 0;

  const tasksStats = {
    total: plan.tasks.length,
    done: plan.tasks.filter((t) => t.status === "done").length,
    inProgress: plan.tasks.filter((t) => t.status === "in_progress").length,
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 返回导航 */}
      <Link
        href="/plans"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
          targetHours: plan.targetHours,
          startDate: plan.startDate,
          endDate: plan.endDate,
          status: plan.status,
          createdAt: plan.createdAt,
          totalHours,
          progress,
        }}
        tasks={plan.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          dayNumber: t.dayNumber,
          weekNumber: t.weekNumber,
          category: t.category,
          status: t.status,
          priority: t.priority,
          completedAt: t.completedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        }))}
        tasksStats={tasksStats}
      />

      {/* 编辑按钮 */}
      <div className="flex justify-center">
        <Link href={`/plans/${plan.id}/edit`}>
          <Button variant="outline" size="sm">
            编辑计划
          </Button>
        </Link>
      </div>
    </div>
  );
}
