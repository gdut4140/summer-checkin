"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { format } from "date-fns";
import {
  CalendarBlank,
  CheckCircle,
  DotsThree,
  PauseCircle,
  PencilSimple,
  Target,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { deletePlan } from "@/app/(dashboard)/plans/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PlanWithProgress } from "@/types";

const statusMeta: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  active: { label: "进行中", icon: Target, color: "text-[#d7ef83]" },
  completed: { label: "已完成", icon: CheckCircle, color: "text-[#d7ef83]" },
  paused: { label: "已暂停", icon: PauseCircle, color: "text-amber-300" },
};

export function PlanCard({ plan }: { plan: PlanWithProgress }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status = statusMeta[plan.status] ?? statusMeta.active;
  const StatusIcon = status.icon;

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
      <article onClick={() => router.push(`/plans/${plan.id}`)} className="group relative flex min-h-72 cursor-pointer flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0a2119]/72 p-5 shadow-[0_14px_35px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#0c281f]/80">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex items-center gap-1.5 text-[11px] font-medium ${status.color}`}><StatusIcon className="size-3.5" weight="fill" />{status.label}</div>
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger render={<button type="button" aria-label="计划操作" className="flex size-8 items-center justify-center rounded-md text-white/36 transition hover:bg-white/8 hover:text-white" />}>
                <DotsThree className="size-5" weight="bold" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/plans/${plan.id}/edit`)}><PencilSimple className="size-4" />编辑</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}><Trash className="size-4" />删除</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <p className="mt-3 pr-4 text-lg font-semibold leading-7 text-white">{plan.name}</p>

        <div className="mt-5 flex-1">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[11px] text-white/36">任务进度</p><p className="mt-0.5 text-2xl font-semibold tabular-nums text-white">{plan.progress}<span className="text-sm text-white/36">%</span></p></div>
            <p className="pb-1 text-xs tabular-nums text-white/42">{plan.completedTasks} / {plan.totalTasks} 项</p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8"><div className="h-full rounded-full bg-[#d7ef83] transition-[width] duration-500" style={{ width: `${plan.progress}%` }} /></div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-white/8 pt-4">
          <div className="flex items-center gap-1.5 text-[11px] text-white/38">
            <CalendarBlank className="size-3.5" />{plan.endDate ? `${format(plan.endDate, "M月d日")} 截止` : "未设截止"}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/plans/${plan.id}`); }}
            className="rounded-md bg-[#d7ef83]/10 px-2.5 py-1 text-[11px] font-medium text-[#d7ef83] transition hover:bg-[#d7ef83]/20"
          >
            查看计划
          </button>
        </div>
      </article>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>删除这个计划？</DialogTitle><DialogDescription>“{plan.name}”删除后无法恢复，关联打卡记录会保留。</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button><Button variant="destructive" onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "确认删除"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
