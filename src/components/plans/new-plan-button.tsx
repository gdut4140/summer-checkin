"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "@phosphor-icons/react";
import { createBlankPlan } from "@/app/(dashboard)/plans/actions";
import { toast } from "sonner";

// 新建计划 → 直接创建一个空白计划并进入其 studio，AI 输入框自动聚焦（?focusAi=1），
// 用户直接在 AI 框里描述目标，AI 把计划内容写进文档。
function useCreateBlankPlan() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await createBlankPlan();
      if (!result.success) {
        toast.error(result.error || "创建计划失败，请稍后重试");
        return;
      }
      if (result.data) {
        router.push(`/plans/${result.data.planId}/studio?focusAi=1`);
      }
    } finally {
      setBusy(false);
    }
  }

  return { create, busy };
}

export function NewPlanButton() {
  const { create, busy } = useCreateBlankPlan();
  return (
    <Button onClick={() => void create()} disabled={busy}>
      <Plus className="h-4 w-4 mr-1.5" weight="bold" />
      新建计划
    </Button>
  );
}

export function CreateFirstPlanLink() {
  const { create, busy } = useCreateBlankPlan();
  return (
    <div className="mt-2">
      <Button variant="link" onClick={() => void create()} disabled={busy}>
        通过 AI 创建你的第一个计划
      </Button>
    </div>
  );
}
