"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deletePlan } from "@/app/(dashboard)/plans/actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Progress } from "@/components/ui/progress";
import { DotsThree, Pencil, Trash, CalendarCheck } from "@phosphor-icons/react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { PlanWithProgress } from "@/types";

export function PlanCard({ plan }: { plan: PlanWithProgress }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deletePlan(plan.id);
      toast.success("计划已删除");
      router.refresh();
    } catch {
      toast.error("删除失败");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <Card className="hover:shadow-sm transition-shadow duration-200 group">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <Link
                href={`/plans/${plan.id}`}
                className="text-lg font-semibold hover:text-primary transition-colors"
              >
                {plan.name}
              </Link>
              {plan.description && (
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {plan.description}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <DotsThree className="h-4 w-4" weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/plans/${plan.id}`)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash className="h-4 w-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">完成进度</span>
              <span className="font-medium">
                {plan.totalHours.toFixed(1)} / {plan.targetHours}h
              </span>
            </div>
            <Progress value={plan.progress} className="h-2" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs">
              {plan.status === "active" ? "进行中" : plan.status}
            </Badge>
            {plan.startDate && (
              <Badge variant="outline" className="text-xs gap-1">
                <CalendarCheck className="h-3 w-3" />
                {format(plan.startDate, "M月d日")}
                {plan.endDate && ` - ${format(plan.endDate, "M月d日")}`}
              </Badge>
            )}
          </div>
          {plan.goal && (
            <p className="text-xs text-muted-foreground">{plan.goal}</p>
          )}
        </CardContent>
      </Card>

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
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
