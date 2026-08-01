import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { PlanForm } from "@/components/plans/plan-form";
import { notFound } from "next/navigation";
import Link from "next/link";
function IconArrowLeft({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M224 128a8 8 0 0 1-8 8H59.31l58.35 58.34a8 8 0 0 1-11.32 11.32l-72-72a8 8 0 0 1 0-11.32l72-72a8 8 0 0 1 11.32 11.32L59.31 120H216a8 8 0 0 1 8 8Z"/></svg>;
}

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan || plan.userId !== user.id) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href={`/plans/${plan.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconArrowLeft className="h-4 w-4" />
        返回计划详情
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">编辑计划</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          修改学习计划的目标和安排。
        </p>
      </div>

      <PlanForm plan={{
        id: plan.id,
        name: plan.name,
        description: plan.description,
        goal: plan.goal,
        targetHours: plan.targetHours,
        startDate: plan.startDate,
        endDate: plan.endDate,
      }} />
    </div>
  );
}
