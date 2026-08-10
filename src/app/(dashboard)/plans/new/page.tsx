import { requireAuth } from "@/lib/auth-utils";
import { PlanForm } from "@/components/plans/plan-form";
import Link from "next/link";
function IconArrowLeft({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M224 128a8 8 0 0 1-8 8H59.31l58.35 58.34a8 8 0 0 1-11.32 11.32l-72-72a8 8 0 0 1 0-11.32l72-72a8 8 0 0 1 11.32 11.32L59.31 120H216a8 8 0 0 1 8 8Z"/></svg>;
}

export default async function NewPlanPage() {
  await requireAuth();

  return (
    <div className="product-page max-w-4xl">
      <Link
        href="/plans"
        className="mb-5 inline-flex items-center gap-1 text-xs text-white/44 transition-colors hover:text-white"
      >
        <IconArrowLeft className="h-4 w-4" />
        返回计划列表
      </Link>

      <header className="product-header"><div><p className="product-eyebrow">New direction</p><h1 className="product-title">新建计划</h1><p className="product-subtitle">先写清楚目标，再决定每天要走多远。</p></div></header>

      <PlanForm plan={null} />
    </div>
  );
}
