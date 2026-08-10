import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { PlanList } from "@/components/plans/plan-list";
import { NewPlanButton, CreateFirstPlanLink } from "@/components/plans/new-plan-button";
import { ChartLineUp, Flag, ListChecks } from "@phosphor-icons/react/dist/ssr";
import type { PlanWithProgress } from "@/types";

export default async function PlansPage() {
  const user = await requireAuth();
  const plans = await prisma.plan.findMany({
    where: { userId: user.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
      endDate: plan.endDate,
      status: plan.status,
      createdAt: plan.createdAt,
      totalTasks,
      completedTasks,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  });

  const activePlans = plansWithProgress.filter((plan) => plan.status === "active");
  const averageProgress = activePlans.length > 0
    ? Math.round(activePlans.reduce((sum, plan) => sum + plan.progress, 0) / activePlans.length)
    : 0;
  const nextDeadline = activePlans
    .filter((plan) => plan.endDate)
    .sort((a, b) => (a.endDate?.getTime() ?? 0) - (b.endDate?.getTime() ?? 0))[0]?.endDate;

  const overview = [
    { label: "进行中的计划", value: String(activePlans.length), unit: "项", icon: ListChecks },
    { label: "平均进度", value: String(averageProgress), unit: "%", icon: ChartLineUp },
    { label: "最近截止", value: nextDeadline ? `${nextDeadline.getMonth() + 1}月${nextDeadline.getDate()}日` : "未设置", unit: "", icon: Flag },
  ];

  return (
    <div className="product-page">
        <header className="product-header">
          <div>
            <p className="product-eyebrow">Learning map</p>
            <h1 className="product-title">学习计划</h1>
            <p className="product-subtitle">把长期目标收拢成清晰、能执行的下一步。</p>
          </div>
          <NewPlanButton />
        </header>

        <section className="mt-7 grid grid-cols-2 border-y border-white/10 bg-black/10 lg:grid-cols-4" aria-label="计划总览">
          {overview.map((item, index) => (
            <div key={item.label} className={`flex min-h-24 items-center gap-3 px-3 py-4 md:px-5 ${index % 2 === 1 ? "border-l border-white/10" : ""} ${index > 1 ? "border-t border-white/10 lg:border-t-0" : ""} ${index > 0 ? "lg:border-l lg:border-white/10" : ""}`}>
              <item.icon className="size-5 shrink-0 text-[#d7ef83]" weight="duotone" />
              <div>
                <p className="text-xs text-white/42">{item.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-white">{item.value}<span className="ml-1 text-xs font-normal text-white/36">{item.unit}</span></p>
              </div>
            </div>
          ))}
        </section>

        {plansWithProgress.length === 0 ? (
          <div className="mt-8 flex min-h-72 flex-col items-center justify-center border border-dashed border-white/16 bg-black/10 px-5 text-center">
            <Flag className="size-8 text-[#d7ef83]" weight="duotone" />
            <h2 className="mt-4 text-base font-medium text-white">从一个明确的目标开始</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-white/42">计划不需要复杂，先写下目标时长和截止时间，再逐步补充任务。</p>
            <CreateFirstPlanLink />
          </div>
        ) : (
          <section className="mt-8" aria-labelledby="plan-list-title">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="plan-list-title" className="text-sm font-medium text-white/78">全部计划</h2>
              <span className="text-xs text-white/34">{plansWithProgress.length} 项</span>
            </div>
            <PlanList plans={plansWithProgress} />
          </section>
        )}
    </div>
  );
}
