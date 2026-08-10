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
    <div className="product-page max-w-4xl">
      <Link
        href={`/plans/${plan.id}`}
        className="mb-5 inline-flex items-center gap-1 text-xs text-white/44 transition-colors hover:text-white"
      >
        <IconArrowLeft className="h-4 w-4" />
        返回计划详情
      </Link>

      <header className="product-header"><div><p className="product-eyebrow">Refine direction</p><h1 className="product-title">编辑计划</h1><p className="product-subtitle">目标发生变化时，及时调整路径，而不是放弃路径。</p></div></header>

      <PlanForm plan={{
        id: plan.id,
        name: plan.name,
        description: plan.description,
        goal: plan.goal,
        startDate: plan.startDate,
        endDate: plan.endDate,
      }} />
    </div>
  );
}
