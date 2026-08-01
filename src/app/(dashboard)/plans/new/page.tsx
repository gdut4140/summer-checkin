import { requireAuth } from "@/lib/auth-utils";
import { PlanForm } from "@/components/plans/plan-form";
import Link from "next/link";
function IconArrowLeft({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M224 128a8 8 0 0 1-8 8H59.31l58.35 58.34a8 8 0 0 1-11.32 11.32l-72-72a8 8 0 0 1 0-11.32l72-72a8 8 0 0 1 11.32 11.32L59.31 120H216a8 8 0 0 1 8 8Z"/></svg>;
}

export default async function NewPlanPage() {
  await requireAuth();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/plans"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <IconArrowLeft className="h-4 w-4" />
        返回计划列表
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">新建计划</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          制定你的学习目标和计划。
        </p>
      </div>

      <PlanForm plan={null} />
    </div>
  );
}
