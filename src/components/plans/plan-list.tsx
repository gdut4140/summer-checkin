"use client";

import { PlanCard } from "./plan-card";
import type { PlanWithProgress } from "@/types";

export function PlanList({ plans }: { plans: PlanWithProgress[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}
