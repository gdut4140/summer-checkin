"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "@phosphor-icons/react";

// 新建计划 → 跳转到智能体独立页面，并带上 ?new=1 让页面预填「生成学习计划」并聚焦输入框
export function NewPlanButton() {
  const router = useRouter();
  return (
    <Button onClick={() => router.push("/agent?new=1")}>
      <Plus className="h-4 w-4 mr-1.5" weight="bold" />
      新建计划
    </Button>
  );
}

export function CreateFirstPlanLink() {
  const router = useRouter();
  return (
    <div className="mt-2">
      <Button variant="link" onClick={() => router.push("/agent?new=1")}>
        通过 AI 创建你的第一个学习计划
      </Button>
    </div>
  );
}
