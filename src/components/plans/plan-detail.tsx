import type { JSX } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type { PlanWithProgress, PlanTaskInfo, TaskStatus, TaskCategory } from "@/types";

const statusLabel: Record<string, string> = {
  active: "进行中", completed: "已完成", paused: "已暂停",
};

const taskStatusMeta: Record<TaskStatus, { cls: string }> = {
  done:        { cls: "text-primary" },
  in_progress: { cls: "text-primary" },
  pending:     { cls: "text-muted-foreground/40" },
  skipped:     { cls: "text-muted-foreground/30" },
};

const categoryLabel: Record<TaskCategory, string> = {
  study: "学习", project: "项目", review: "复习", exercise: "练习",
};

const priorityBorder: Record<string, string> = {
  high:   "border-l-primary",
  normal: "border-l-primary",
  low:    "border-l-muted",
};

/* 内联 SVG 图标（避免 @phosphor-icons/react SSR 时 createContext 报错）*/

function IconClock({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M128 24a104 104 0 1 0 104 104A104.12 104.12 0 0 0 128 24Zm0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88Zm64-88a8 8 0 0 1-8 8h-56a8 8 0 0 1-8-8V72a8 8 0 0 1 16 0v48h48a8 8 0 0 1 8 8Z"/></svg>;
}

function IconTarget({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M221.87 83.16A104.1 104.1 0 1 1 195.67 49l22.36-22.37a8 8 0 0 1 11.32 11.32l-96 96a8 8 0 0 1-11.32-11.32l28.69-28.69A88 88 0 1 0 200 111.38l-28.69 28.69a8 8 0 0 1-11.32-11.32Z"/></svg>;
}

function IconCalendar({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M208 32h-24v-8a8 8 0 0 0-16 0v8H88v-8a8 8 0 0 0-16 0v8H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16ZM48 48h24v8a8 8 0 0 0 16 0v-8h80v8a8 8 0 0 0 16 0v-8h24v32H48Zm160 160H48V96h160v112Z"/></svg>;
}

function IconCheckCircle({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M173.66 98.34a8 8 0 0 1 0 11.32l-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 0ZM232 128A104 104 0 1 1 128 24a104.11 104.11 0 0 1 104 104Zm-16 0a88 88 0 1 0-88 88 88.1 88.1 0 0 0 88-88Z"/></svg>;
}

function IconCircle({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><circle cx="128" cy="128" r="96" fill="none" stroke="currentColor" strokeWidth="16"/></svg>;
}

function IconCircleDashed({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M80.27 34.18a104 104 0 0 1 95.46 0 8 8 0 0 1-7.35 14.2 88 88 0 0 0-80.76 0 8 8 0 1 1-7.35-14.2ZM25.06 109.08a8 8 0 0 1 7.14-8.78A88.09 88.09 0 0 0 38 143.18a8 8 0 0 1-13.76 8.16 104.12 104.12 0 0 1-7.95-35.13 8 8 0 0 1 8.77-7.13Zm16.68 74.66a8 8 0 0 1 13.76-8.16 88.09 88.09 0 0 0 42.88 36.57 8 8 0 0 1-6 14.84 104.08 104.08 0 0 1-50.64-43.25Zm68.65 47.19a8 8 0 0 1 7.13-8.77 88.09 88.09 0 0 0 42.88-11.59 8 8 0 0 1 8.16 13.76 104.08 104.08 0 0 1-50.64 13.7 8 8 0 0 1-7.53-7.1Zm64.13-21.13a8 8 0 0 1 13.76 8.16 104.08 104.08 0 0 1-43.25 50.64 8 8 0 0 1-8.16-13.76 88.07 88.07 0 0 0 37.65-45.04Z"/></svg>;
}

function IconLightning({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M215.79 118.17a8 8 0 0 0-5-5.66L153.18 90.9l14.66-73.33a8 8 0 0 0-13.69-7l-112 120a8 8 0 0 0 3 13l57.63 21.61-14.67 73.33a8 8 0 0 0 13.69 7l112-120a8 8 0 0 0 1.99-8.34Z"/></svg>;
}


function IconPencil({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M227.31 73.37 182.63 28.68a16 16 0 0 0-22.63 0L36.69 152A15.86 15.86 0 0 0 32 163.31V208a16 16 0 0 0 16 16h44.69a15.86 15.86 0 0 0 11.31-4.69L227.31 96a16 16 0 0 0 0-22.63ZM51.31 160 136 75.31 152.69 92 68 176.68ZM48 179.31 76.69 208H48Zm48 15.38L79.31 178 164 93.31 180.69 110Zm96-96L147.31 64l24-24L216 84.68Z"/></svg>;
}

interface Props {
  plan: PlanWithProgress;
  tasks: PlanTaskInfo[];
  tasksStats: { total: number; done: number; inProgress: number };
}

export function PlanDetail({ plan, tasks, tasksStats }: Props) {
  const isCompleted = plan.progress >= 100;
  const tasksByWeek = groupBy(tasks, (t) => t.weekNumber ?? 0);

  return (
    <div className="space-y-6">
      {/* 头部卡片 */}
      <div className="surface relative overflow-hidden">
        <div className={`h-1 w-full ${isCompleted ? "bg-primary" : "bg-primary"}`} />

        <div className="p-6 space-y-5">
          {/* 标题行 */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                  <span className={`h-1.5 w-1.5 rounded-full ${isCompleted ? "bg-primary" : "bg-primary"}`} />
                  {statusLabel[plan.status] ?? statusLabel.active}
                </span>
                {plan.startDate && (
                  <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                    <IconCalendar className="h-3 w-3" />
                    {format(plan.startDate, "yyyy年M月d日")}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-foreground">{plan.name}</h1>
              {plan.description && (
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {plan.description}
                </p>
              )}
            </div>
            <Link
              href={`/plans/${plan.id}/edit`}
              className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
            >
              <IconPencil className="h-3.5 w-3.5" />
              编辑
            </Link>
          </div>

          {/* 目标 */}
          {plan.goal && (
            <div className="flex items-start gap-2 rounded-md border border-primary/12 bg-primary/5 px-3 py-2.5">
              <IconTarget className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-[13px] text-muted-foreground">{plan.goal}</p>
            </div>
          )}

          {/* 进度 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground flex items-center gap-1">
                <IconCheckCircle className="h-3.5 w-3.5" />
                任务进度
              </span>
              <span className="font-mono font-medium">
                {tasksStats.done}
                <span className="text-muted-foreground font-normal"> / {tasksStats.total} 项</span>
                <span className="ml-1.5 text-primary">{plan.progress}%</span>
              </span>
            </div>
            <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 bg-primary`}
                style={{ width: `${plan.progress}%` }}
              />
            </div>
          </div>

          {/* 统计小格 */}
          <div className="grid grid-cols-2 border-y border-white/8">
            <StatTile icon={IconCheckCircle} label="完成任务" value={`${tasksStats.done} / ${tasksStats.total}`} colorClass="bg-primary/10 text-primary" />
            <StatTile icon={IconLightning} label="进行中" value={`${tasksStats.inProgress}`} colorClass="bg-primary/10 text-primary" />
          </div>
        </div>
      </div>

      {/* 任务清单 */}
      {tasks.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <IconCheckCircle className="h-4 w-4" />
            任务清单
          </h2>

          <div className="space-y-5">
            {Object.entries(tasksByWeek).map(([week, weekTasks]) => (
              <div key={week} className="space-y-2">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  第 {week} 周
                </span>
                <div className="space-y-1.5">
                  {weekTasks.map((task) => {
                    const ts = taskStatusMeta[task.status];
                    return (
                      <div
                        key={task.id}
                        className={`flex items-start gap-3 rounded-md border border-white/7 border-l-2 bg-black/10 px-3 py-2.5 ${priorityBorder[task.priority] ?? "border-l-primary"} ${task.status === "skipped" ? "opacity-50" : ""}`}
                      >
                        {task.status === "done" ? (
                          <IconCheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                        ) : task.status === "in_progress" ? (
                          <IconCircleDashed className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                        ) : (
                          <IconCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${ts.cls}`} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] font-medium ${task.status === "skipped" ? "line-through" : ""}`}>
                              {task.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {categoryLabel[task.category] ?? "学习"}
                            </span>
                          </div>
                          {task.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              {task.description}
                            </p>
                          )}
                          {task.dayNumber && (
                            <span className="text-[10px] text-muted-foreground mt-0.5 inline-block">
                              Day {task.dayNumber}
                            </span>
                          )}
                        </div>
                        {task.status === "done" && task.completedAt && (
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {format(new Date(task.completedAt), "M/d")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空任务提示 */}
      {tasks.length === 0 && (
        <div className="text-center py-10 rounded-lg border border-dashed border-border/60">
          <p className="text-sm text-muted-foreground">还没有拆分任务</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            在 AI 对话中让助手帮你拆分这个计划的任务
          </p>
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: (props: { className?: string }) => JSX.Element;
  label: string;
  value: string;
  colorClass: string;
}) {
  return (
    <div className="flex items-center gap-2 border-l border-white/8 px-3 py-3 first:border-l-0">
      <div className={`flex h-7 w-7 items-center justify-center rounded-md ${colorClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="text-[13px] font-semibold">{value}</div>
      </div>
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
