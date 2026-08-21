import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { PlanList } from "@/components/plans/plan-list";
import { NewPlanButton, CreateFirstPlanLink } from "@/components/plans/new-plan-button";
import { ChartLineUp, Flag, ListChecks, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import type { PlanWithProgress } from "@/types";

export default async function PlansPage() {
  const user = await requireAuth();
  const plans = await prisma.plan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { tasks: { select: { status: true } } },
  });

  const plansWithProgress: PlanWithProgress[] = plans.map((plan) => {
    const totalTasks = plan.tasks.length;
    const completedTasks = plan.tasks.filter((t) => t.status === "done").length;
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      goal: plan.goal,
      startDate: plan.startDate,
      status: plan.status,
      createdAt: plan.createdAt,
      totalTasks,
      completedTasks,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  });

  const averageProgress = plansWithProgress.length > 0
    ? Math.round(plansWithProgress.reduce((sum, plan) => sum + plan.progress, 0) / plansWithProgress.length)
    : 0;

  const totalTasks = plansWithProgress.reduce((sum, plan) => sum + plan.totalTasks, 0);
  const completedTasks = plansWithProgress.reduce((sum, plan) => sum + plan.completedTasks, 0);

  const overview = [
    { label: "全部计划", value: String(plansWithProgress.length), unit: "项", icon: ListChecks },
    { label: "平均进度", value: String(averageProgress), unit: "%", icon: ChartLineUp },
    { label: "已完成任务", value: String(completedTasks), unit: `/ ${totalTasks}`, icon: CheckCircle },
  ];

  return (
    <div className="product-page product-page--redesigned">
        <header className="product-header">
          <div>
            <p className="product-eyebrow">Learning map</p>
            <h1 className="product-title">计划</h1>
            <p className="product-subtitle">把长期目标收拢成清晰、能执行的下一步。</p>
          </div>
          <NewPlanButton />
        </header>
        <section className="product-metrics mt-7 grid-cols-1 sm:grid-cols-3" aria-label="计划总览">
          {overview.map((item, index) => (
            <div key={item.label} className={`product-metric flex items-center gap-3 ${index > 0 ? "border-t border-white/10 sm:border-t-0" : ""}`}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-white/8 bg-white/[0.035] text-primary">
                <item.icon className="size-[18px]" weight="duotone" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-[1.35rem] font-semibold tabular-nums text-foreground">{item.value}<span className="ml-1 text-xs font-normal text-muted-foreground">{item.unit}</span></p>
              </div>
            </div>
          ))}
        </section>

        {plansWithProgress.length === 0 ? (
          <div className="mt-8 flex min-h-72 flex-col items-center justify-center border border-dashed border-white/16 bg-black/10 px-5 text-center">
            <Flag className="size-8 text-primary" weight="duotone" />
            <h2 className="mt-4 text-base font-medium text-foreground">从一个明确的目标开始</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">计划不需要复杂，先写下明确的目标，再逐步补充任务。</p>
            <CreateFirstPlanLink />
          </div>
        ) : (
          <section className="mt-8" aria-labelledby="plan-list-title">
            <div className="mb-4 flex items-end justify-between border-b border-white/8 pb-3">
              <div>
                <h2 id="plan-list-title" className="text-sm font-medium text-foreground/90">全部计划</h2>
                <p className="mt-1 text-xs text-muted-foreground">打开计划进入文档工作室，任务进度可在侧栏快速更新。</p>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">{plansWithProgress.length} 项</span>
            </div>
            <PlanList plans={plansWithProgress} />
          </section>
        )}
    </div>
  );
}
