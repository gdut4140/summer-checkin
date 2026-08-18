"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlanCard } from "./plan-card";
import { PlanDrawer } from "./plan-drawer";
import type { PlanWithProgress } from "@/types";

export function PlanList({ plans }: { plans: PlanWithProgress[] }) {
  const [selected, setSelected] = useState<PlanWithProgress | null>(null);
  const router = useRouter();

  // 抽屉里编辑标题后立即同步到选中的计划，抽屉显示无需重开
  const handlePlanNameChange = (name: string) => {
    setSelected((prev) => (prev ? { ...prev, name } : prev));
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onProgress={setSelected} />
        ))}
      </div>
      <PlanDrawer
        plan={selected}
        onClose={() => setSelected(null)}
        onRefresh={() => router.refresh()}
        onPlanNameChange={handlePlanNameChange}
      />
    </>
  );
}
