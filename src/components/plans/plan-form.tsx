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
    targetHours: number;
    startDate: Date | null;
    endDate: Date | null;
  } | null;
}

export function PlanForm({ plan }: PlanFormProps) {
  const router = useRouter();
  const isEditing = !!plan;

  async function handleAction(_prev: unknown, formData: FormData) {
    try {
      if (isEditing) {
        await updatePlan(plan!.id, formData);
        toast.success("计划已更新");
      } else {
        await createPlan(formData);
        toast.success("计划已创建");
      }
      router.push("/plans");
      router.refresh();
      return { success: true };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
      return { success: false };
    }
  }

  const [, formAction, pending] = useActionState(handleAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <ListChecks className="h-6 w-6 text-primary" weight="fill" />
          {isEditing ? "编辑计划" : "新建计划"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetHours">目标时长（小时）</Label>
              <Input
                id="targetHours"
                name="targetHours"
                type="number"
                min="0"
                defaultValue={plan?.targetHours || ""}
              />
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
            <div className="space-y-2">
              <Label htmlFor="endDate">结束日期</Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={
                  plan?.endDate
                    ? new Date(plan.endDate).toISOString().split("T")[0]
                    : ""
                }
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={pending} size="lg">
            {pending ? "保存中..." : isEditing ? "更新计划" : "创建计划"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
