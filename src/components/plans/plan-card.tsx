"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deletePlan } from "@/app/(dashboard)/plans/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import type { PlanWithProgress } from "@/types";

/* 内联 SVG（避免 SSR createContext 报错）*/
function IconDotsThree({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M140 128a12 12 0 1 1-12-12 12 12 0 0 1 12 12Zm56-12a12 12 0 1 0 12 12 12 12 0 0 0-12-12Zm-136 0a12 12 0 1 0 12 12 12 12 0 0 0-12-12Z"/></svg>;
}
function IconPencil({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M227.31 73.37 182.63 28.68a16 16 0 0 0-22.63 0L36.69 152A15.86 15.86 0 0 0 32 163.31V208a16 16 0 0 0 16 16h44.69a15.86 15.86 0 0 0 11.31-4.69L227.31 96a16 16 0 0 0 0-22.63ZM51.31 160 136 75.31 152.69 92 68 176.68ZM48 179.31 76.69 208H48Zm48 15.38L79.31 178 164 93.31 180.69 110Zm96-96L147.31 64l24-24L216 84.68Z"/></svg>;
}
function IconTrash({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M216 48h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a8 8 0 0 0 0 16h8v144a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V64h8a8 8 0 0 0 0-16ZM96 40a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H96Zm96 168H64V64h128Z"/></svg>;
}
function IconCalendar({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M208 32h-24v-8a8 8 0 0 0-16 0v8H88v-8a8 8 0 0 0-16 0v8H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16ZM48 48h24v8a8 8 0 0 0 16 0v-8h80v8a8 8 0 0 0 16 0v-8h24v32H48Zm160 160H48V96h160v112Z"/></svg>;
}
function IconArrowRight({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M221.66 133.66a8 8 0 0 1 0 11.32l-72 72a8 8 0 0 1-11.32-11.32L196.69 136H40a8 8 0 0 1 0-16h156.69l-58.35-58.34a8 8 0 1 1 11.32-11.32l72 72Z"/></svg>;
}
function IconClock({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M128 24a104 104 0 1 0 104 104A104.12 104.12 0 0 0 128 24Zm0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88Zm64-88a8 8 0 0 1-8 8h-56a8 8 0 0 1-8-8V72a8 8 0 0 1 16 0v48h48a8 8 0 0 1 8 8Z"/></svg>;
}

const statusLabel: Record<string, string> = {
  active: "进行中", completed: "已完成", paused: "已暂停",
};

export function PlanCard({ plan }: { plan: PlanWithProgress }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePlan(plan.id);
    if (!result.success) {
      toast.error(result.error);
    } else {
      toast.success("计划已删除");
      router.refresh();
    }
    setDeleting(false);
    setDeleteOpen(false);
  }

  const isCompleted = plan.progress >= 100;

  return (
    <>
      <div className="group relative rounded-xl border border-border/60 bg-card overflow-hidden transition-all duration-200 hover:shadow-md hover:border-white/20">
        {/* 左侧黄色装饰条 */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${isCompleted ? "bg-emerald-500" : "bg-emerald-400"}`} />

        {/* 右上角操作菜单 */}
        <div className="absolute top-3 right-3 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-muted hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
                <IconDotsThree className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/plans/${plan.id}/edit`)}>
                <IconPencil className="h-4 w-4 mr-2" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <IconTrash className="h-4 w-4 mr-2" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 内容区 */}
        <div className="p-5 pl-6">
          {/* 状态 + 日期 */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-400/10 text-emerald-300">
              {statusLabel[plan.status] ?? statusLabel.active}
            </span>
            {plan.startDate && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <IconCalendar className="h-3 w-3" />
                {format(plan.startDate, "M月d日")}
                {plan.endDate && ` - ${format(plan.endDate, "M月d日")}`}
              </span>
            )}
          </div>

          {/* 标题 */}
          <Link
            href={`/plans/${plan.id}`}
            className="text-base font-semibold text-foreground hover:text-emerald-400 transition-colors leading-snug"
          >
            {plan.name}
          </Link>

          {/* 描述 */}
          {plan.description && (
            <p className="text-[13px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
              {plan.description}
            </p>
          )}

          {/* 进度 */}
          <div className="mt-5 space-y-1.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground flex items-center gap-1">
                <IconClock className="h-3 w-3" />
                进度
              </span>
              <span className="font-mono font-medium text-foreground/80">
                {plan.totalHours.toFixed(1)}
                <span className="text-muted-foreground font-normal"> / {plan.targetHours}h</span>
              </span>
            </div>

            <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${isCompleted ? "bg-emerald-500" : "bg-emerald-400"}`}
                style={{ width: `${plan.progress}%` }}
              />
            </div>
          </div>

          {/* 查看详情 */}
          <Link
            href={`/plans/${plan.id}`}
            className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-emerald-400 transition-colors"
          >
            查看详情
            <IconArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除？</DialogTitle>
            <DialogDescription>
              删除"{plan.name}"后不可恢复，确定继续？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
