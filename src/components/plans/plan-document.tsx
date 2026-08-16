"use client";

import { useState } from "react";
import { CalendarBlank, CheckCircle, Circle, CircleDashed, Eye, PencilSimple } from "@phosphor-icons/react";
import { format } from "date-fns";
import { toast } from "sonner";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import type { PlanWithProgress, PlanTaskInfo, TaskCategory } from "@/types";

const categoryLabel: Record<TaskCategory, string> = {
  study: "学习", project: "项目", review: "复习", exercise: "练习",
};

interface Props {
  plan: PlanWithProgress;
  tasks: PlanTaskInfo[];
  tasksStats: { total: number; done: number; inProgress: number };
  initialDocument: string;
}

export function PlanDocument({ plan, tasks, tasksStats, initialDocument }: Props) {
  const [content, setContent] = useState(initialDocument);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: content }),
      });
      if (!res.ok) throw new Error();
      toast.success("文档已保存");
      setEditing(false);
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }

  const tasksByWeek = groupBy(tasks, (t) => t.weekNumber ?? 0);

  return (
    <div className="flex gap-6">
      {/* ── 侧边栏：状态 / 进度 / 任务 ── */}
      <aside className="w-72 shrink-0 space-y-4">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            {plan.status === "active" ? "进行中" : plan.status === "completed" ? "已完成" : "已暂停"}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarBlank className="size-3.5" />
            {plan.startDate ? format(plan.startDate, "M月d日") : "未定"}
            {plan.endDate ? ` — ${format(plan.endDate, "M月d日")}` : ""}
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">任务进度</span>
              <span className="tabular-nums text-foreground">{tasksStats.done}/{tasksStats.total} · {plan.progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-primary" style={{ width: `${plan.progress}%` }} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">任务清单</p>
          {tasks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60">还没有任务</p>
          ) : (
            <div className="max-h-[50vh] space-y-3 overflow-y-auto">
              {Object.entries(tasksByWeek).map(([week, weekTasks]) => (
                <div key={week}>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">第 {week} 周</p>
                  <div className="space-y-1">
                    {weekTasks.map((task) => (
                      <div key={task.id} className="flex items-start gap-1.5">
                        {task.status === "done" ? (
                          <CheckCircle className="mt-0.5 size-3.5 shrink-0 text-primary" weight="fill" />
                        ) : task.status === "in_progress" ? (
                          <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-primary/70" weight="fill" />
                        ) : (
                          <Circle className="mt-0.5 size-3.5 shrink-0 text-white/15" />
                        )}
                        <div className="min-w-0">
                          <p className={`text-[11px] leading-snug ${task.status === "done" ? "text-muted-foreground/60 line-through" : "text-foreground/85"}`}>
                            {task.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground/50">
                            {categoryLabel[task.category]}{task.dayNumber ? ` · Day ${task.dayNumber}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── 主文档：居中 markdown，预览/编辑切换 ── */}
      <section className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
            <button
              onClick={() => setEditing(false)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${!editing ? "bg-white/[0.1] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Eye className="size-3.5" />预览
            </button>
            <button
              onClick={() => setEditing(true)}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${editing ? "bg-white/[0.1] text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <PencilSimple className="size-3.5" />编辑
            </button>
          </div>
          {editing && (
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          )}
        </div>

        <div className="mx-auto max-w-3xl rounded-xl border border-white/[0.08] bg-[#0a1a15]/70 p-8">
          {editing ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[60vh] w-full resize-none bg-transparent font-mono text-[13px] leading-7 text-foreground outline-none"
            />
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>
      </section>
    </div>
  );
}

function groupBy<T>(items: T[], keyFn: (item: T) => number): Record<number, T[]> {
  const result: Record<number, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    (result[key] ??= []).push(item);
  }
  return result;
}
