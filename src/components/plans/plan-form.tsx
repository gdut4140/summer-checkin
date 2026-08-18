"use client";

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { createPlan, updatePlan } from "@/app/(dashboard)/plans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarBlank, Flag, ListChecks } from "@phosphor-icons/react";

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
    <section className="product-panel overflow-hidden">
      <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b border-white/8 bg-black/10 p-5 md:border-b-0 md:border-r md:p-6">
          <span className="flex size-9 items-center justify-center rounded-md border border-primary/16 bg-primary/7 text-primary"><ListChecks className="size-[18px]" weight="duotone" /></span>
          <h2 className="mt-4 text-sm font-semibold text-foreground">{isEditing ? "编辑计划" : "新建计划"}</h2>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">名称保持简短，目标写成可以验证的结果，后续更容易拆成每天的任务。</p>
          <div className="mt-6 hidden space-y-3 border-t border-white/8 pt-5 text-xs text-muted-foreground md:block">
            <p className="flex items-center gap-2"><Flag className="size-4 text-primary" />明确结果</p>
            <p className="flex items-center gap-2"><CalendarBlank className="size-4 text-primary" />设定起点</p>
          </div>
        </aside>
        <form action={formAction} className="space-y-6 p-5 md:p-7">
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
            <Textarea
              id="goal"
              name="goal"
              placeholder="例如：掌握 Next.js App Router，完成 3 个项目"
              defaultValue={plan?.goal ?? ""}
              rows={3}
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

          <div className="flex justify-end border-t border-white/8 pt-5"><Button type="submit" disabled={pending} size="lg" className="min-w-28">
            {pending ? "保存中..." : isEditing ? "更新计划" : "创建计划"}
          </Button></div>
        </form>
      </div>
    </section>
  );
}
