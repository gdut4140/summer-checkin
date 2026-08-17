"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { createPlan, updatePlan } from "@/app/(dashboard)/plans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ListChecks } from "@phosphor-icons/react";

interface PlanFormProps {
  plan?: {
    id: string;
    name: string;
    description: string | null;
    goal: string | null;
    startDate: Date | null;
  } | null;
}

export function PlanForm({ plan }: PlanFormProps) {
  const router = useRouter();
  const isEditing = !!plan;

  async function handleAction(_prev: unknown, formData: FormData) {
    // Day 10: Server Action 不再 throw，改为返回值判断
    const result = isEditing
      ? await updatePlan(plan!.id, formData)
      : await createPlan(formData);

    if (!result.success) {
      toast.error(result.error);
      return { success: false };
    }

    toast.success(isEditing ? "计划已更新" : "计划已创建");
    router.push("/plans");
    router.refresh();
    return { success: true };
  }

  const [, formAction, pending] = useActionState(handleAction, null);

  return (
    <Card className="surface overflow-hidden">
      <CardHeader className="border-b border-white/8 px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-5 w-5 text-[#d7ef83]" weight="duotone" />
          {isEditing ? "编辑计划" : "新建计划"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 md:p-7">
        <form action={formAction} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">计划名称 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              name="name"
              placeholder="例如：暑假前端进阶计划"
              defaultValue={plan?.name}
              required
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="description">计划描述</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="你想达成什么目标？"
              defaultValue={plan?.description ?? ""}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">具体目标</Label>
            <Input
              id="goal"
              name="goal"
              placeholder="例如：掌握 Next.js App Router，完成 3 个项目"
              defaultValue={plan?.goal ?? ""}
            />
          </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate">开始日期</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={
                plan?.startDate
                  ? new Date(plan.startDate).toISOString().split("T")[0]
                  : ""
              }
            />
          </div>

          <div className="flex justify-end border-t border-white/8 pt-5"><Button type="submit" disabled={pending} size="lg">
            {pending ? "保存中..." : isEditing ? "更新计划" : "创建计划"}
          </Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
