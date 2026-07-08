import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { PlanCard } from "@/components/plans/plan-card";
import { NewPlanButton, CreateFirstPlanLink } from "@/components/plans/new-plan-button";
import type { PlanWithProgress } from "@/types";

export default async function PlansPage() {
  const user = await requireAuth();

  const plans = await prisma.plan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      checkins: { select: { hours: true } },
    },
  });

  const plansWithProgress: PlanWithProgress[] = plans.map((plan) => {
    const totalHours = plan.checkins.reduce((s, c) => s + c.hours, 0);
    return {
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
      progress: plan.targetHours > 0 ? Math.min(100, Math.round((totalHours / plan.targetHours) * 100)) : 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            学习计划
          </h1>
          <p className="text-muted-foreground mt-1">
            制定和管理你的学习目标。
          </p>
        </div>
        <NewPlanButton />
      </div>

      {plansWithProgress.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
          <p className="text-muted-foreground">还没有学习计划。</p>
          <CreateFirstPlanLink />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plansWithProgress.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
