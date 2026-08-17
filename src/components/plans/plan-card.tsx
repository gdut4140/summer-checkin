"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  ListChecks,
  Trash,
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
      <article onClick={() => router.push(`/plans/${plan.id}/studio`)} className="group relative flex min-h-72 cursor-pointer flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0a2119]/72 p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#0c281f]/80">
        <div className="flex items-start justify-end">
          <button
            type="button"
            aria-label="删除计划"
            onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}
            className="flex size-8 items-center justify-center rounded-md text-white/36 transition hover:bg-red-500/15 hover:text-red-300"
          >
            <Trash className="size-4" />
          </button>
        </div>

        <p className="mt-3 pr-4 text-lg font-semibold leading-7 text-white">{plan.name}</p>

        <div className="mt-5 flex-1">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[11px] text-white/36">任务进度</p><p className="mt-0.5 text-2xl font-semibold tabular-nums text-white">{plan.progress}<span className="text-sm text-white/36">%</span></p></div>
            <p className="pb-1 text-xs tabular-nums text-white/42">{plan.completedTasks} / {plan.totalTasks} 项</p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-[#d7ef83] transition-[width] duration-500" style={{ width: `${plan.progress}%` }} /></div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-white/8 pt-4">
          <button
            onClick={(e) => { e.stopPropagation(); onProgress?.(plan); }}
            className="flex items-center justify-center gap-1.5 rounded-md bg-[#d7ef83] px-3 py-2 text-xs font-semibold text-[#051612] transition hover:bg-[#e5f6a6]"
          >
            <ListChecks className="size-4" weight="bold" />
            查看任务列表
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/plans/${plan.id}/studio`); }}
            className="flex items-center justify-center gap-1.5 rounded-md bg-[#d7ef83] px-3 py-2 text-xs font-semibold text-[#051612] transition hover:bg-[#e5f6a6]"
          >
            <ArrowUpRight className="size-4" weight="bold" />
            查看计划
          </button>
        </div>
      </article>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border border-white/12 bg-[#0d2a21]/95 text-white backdrop-blur-xl">
          <DialogHeader><DialogTitle>删除这个计划？</DialogTitle><DialogDescription>“{plan.name}”删除后无法恢复，关联打卡记录会保留。</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button><Button onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "确认删除"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
