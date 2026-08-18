"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  ListChecks,
  Trash,
  Target,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { deletePlan } from "@/app/(dashboard)/plans/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PlanWithProgress } from "@/types";

export function PlanCard({ plan, onProgress }: { plan: PlanWithProgress; onProgress?: (plan: PlanWithProgress) => void }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePlan(plan.id);
    if (!result.success) toast.error(result.error);
    else {
      toast.success("计划已删除");
      router.refresh();
    }
    setDeleting(false);
    setDeleteOpen(false);
  }

  return (
    <>
      <article onClick={() => router.push(`/plans/${plan.id}/studio`)} className="product-row group relative flex min-h-60 cursor-pointer flex-col overflow-hidden rounded-lg border border-white/9 bg-[var(--surface-panel-bg)] p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_color-mix(in_srgb,var(--theme-primary)_55%,transparent)]" />
            {plan.progress >= 100 ? "已完成" : "进行中"}
          </span>
          <button
            type="button"
            aria-label="删除计划"
            onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground/60 transition hover:bg-red-500/12 hover:text-red-400"
          >
            <Trash className="size-4" />
          </button>
        </div>

        <h3 className="mt-3 pr-8 text-lg font-semibold leading-7 text-foreground">{plan.name}</h3>
        <div className="mt-2 flex min-h-10 items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Target className="mt-0.5 size-3.5 shrink-0 text-primary" weight="duotone" />
          <p className="line-clamp-2">{plan.goal || plan.description || "还没有填写具体目标，打开计划继续完善。"}</p>
        </div>

        <div className="mt-5 flex-1 border-t border-white/8 pt-4">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[10px] uppercase text-muted-foreground/60">Progress</p><p className="mt-0.5 text-3xl font-semibold tabular-nums text-foreground">{plan.progress}<span className="ml-0.5 text-sm font-normal text-muted-foreground/60">%</span></p></div>
            <p className="pb-1 text-xs tabular-nums text-muted-foreground/70">{plan.completedTasks} / {plan.totalTasks} 项任务</p>
          </div>
          <div className="mt-3 h-px overflow-hidden bg-white/10"><div className="h-full bg-primary transition-[width] duration-700" style={{ width: `${plan.progress}%` }} /></div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-3">
          <button
            onClick={(e) => { e.stopPropagation(); onProgress?.(plan); }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-white/6 hover:text-foreground"
          >
            <ListChecks className="size-4 text-primary" weight="bold" />
            任务清单
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/plans/${plan.id}/studio`); }}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary transition group-hover:gap-2.5"
          >
            打开计划
            <ArrowUpRight className="size-4" weight="bold" />
          </button>
        </div>
      </article>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border border-white/12 bg-background/95 text-foreground backdrop-blur-xl">
          <DialogHeader><DialogTitle>删除这个计划？</DialogTitle><DialogDescription>“{plan.name}”删除后无法恢复，关联打卡记录会保留。</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button><Button onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "确认删除"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
