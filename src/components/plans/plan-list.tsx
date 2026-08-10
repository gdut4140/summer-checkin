"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlanCard } from "./plan-card";
import { PlanDrawer } from "./plan-drawer";
import type { PlanWithProgress } from "@/types";

export function PlanList({ plans }: { plans: PlanWithProgress[] }) {
  const [selected, setSelected] = useState<PlanWithProgress | null>(null);
  const router = useRouter();

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} onClick={() => setSelected(plan)} />
        ))}
      </div>
      <PlanDrawer plan={selected} onClose={() => setSelected(null)} onRefresh={() => router.refresh()} />
    </>
  );
}
