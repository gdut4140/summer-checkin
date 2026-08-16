import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PlanDocument } from "@/components/plans/plan-document";
import type { PlanTaskInfo } from "@/types";

function IconArrowLeft({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 256 256" fill="currentColor"><path d="M224 128a8 8 0 0 1-8 8H59.31l58.35 58.34a8 8 0 0 1-11.32 11.32l-72-72a8 8 0 0 1 0-11.32l72-72a8 8 0 0 1 11.32 11.32L59.31 120H216a8 8 0 0 1 8 8Z"/></svg>;
}

// 当计划还没有文档时，从计划数据生成一份默认 markdown
function generateDocument(
  plan: {
    name: string;
    goal: string | null;
    description: string | null;
    startDate: Date | null;
    endDate: Date | null;
  },
  tasks: { title: string; description: string | null; dayNumber: number | null; weekNumber: number | null }[]
): string {
  const lines: string[] = [`# ${plan.name}`, ""];

  if (plan.goal) lines.push("## 目标", "", plan.goal, "");
  if (plan.description) lines.push("## 计划说明", "", plan.description, "");
  if (plan.startDate || plan.endDate) {
    lines.push("## 周期", "");
    if (plan.startDate) lines.push(`- 开始：${format(plan.startDate, "yyyy年M月d日")}`);
    if (plan.endDate) lines.push(`- 截止：${format(plan.endDate, "yyyy年M月d日")}`);
    lines.push("");
  }

  if (tasks.length > 0) {
    lines.push("## 任务安排", "");
    const byWeek: Record<number, typeof tasks> = {};
    for (const t of tasks) (byWeek[t.weekNumber ?? 0] ??= []).push(t);
    for (const [week, weekTasks] of Object.entries(byWeek)) {
      lines.push(`### 第 ${week} 周`, "");
      for (const t of weekTasks) {
        const day = t.dayNumber ? `Day ${t.dayNumber}：` : "";
        lines.push(`- [ ] ${day}${t.title}`);
        if (t.description) lines.push(`  - ${t.description}`);
      }
      lines.push("");
    }
  }

  lines.push("## 学习笔记", "", "在这里记录学习内容、心得和遇到的问题…", "");
  return lines.join("\n");
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;

  if (id === "new") {
    return redirect("/plans/new");
  }

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ weekNumber: "asc" }, { dayNumber: "asc" }],
      },
    },
  });

  if (!plan || plan.userId !== user.id) {
    notFound();
  }

  const totalTasks = plan.tasks.length;
  const completedTasks = plan.tasks.filter((t) => t.status === "done").length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const tasksStats = {
    total: totalTasks,
    done: completedTasks,
    inProgress: plan.tasks.filter((t) => t.status === "in_progress").length,
  };

  const document = plan.document ?? generateDocument(plan, plan.tasks);

  return (
    <div className="product-page max-w-6xl">
      <Link
        href="/plans"
        className="mb-5 inline-flex items-center gap-1 text-xs text-white/44 transition-colors hover:text-white"
      >
        <IconArrowLeft className="h-4 w-4" />
        返回计划列表
      </Link>

      <PlanDocument
        plan={{
          id: plan.id,
          name: plan.name,
          description: plan.description,
          goal: plan.goal,
          startDate: plan.startDate,
          endDate: plan.endDate,
          status: plan.status,
          createdAt: plan.createdAt,
          totalTasks,
          completedTasks,
          progress,
        }}
        tasks={plan.tasks.map((t) => ({
          id: t.id,
          planId: plan.id,
          title: t.title,
          description: t.description,
          dayNumber: t.dayNumber,
          weekNumber: t.weekNumber,
          category: t.category as PlanTaskInfo["category"],
          status: t.status as PlanTaskInfo["status"],
          priority: t.priority as PlanTaskInfo["priority"],
          completedAt: t.completedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        }))}
        tasksStats={tasksStats}
        initialDocument={document}
      />
    </div>
  );
}
