import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { StudioClient } from "./studio-client";
import {
  ensureTaskSectionInDocument,
  planWithTasksToMarkdown,
} from "@/lib/studio/plan-serialize";

export const dynamic = "force-dynamic";

export default async function PlanStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focusAi?: string }>;
}) {
  const user = await requireAuth();
  const { id } = await params;
  const { focusAi } = await searchParams;

  const plan = await prisma.plan.findUnique({
    where: { id },
  });
  if (!plan || plan.userId !== user.id) notFound();

  // 读取计划已拆分的任务：既有文档时用于补齐任务段落；无文档时生成详细计划文档（学习指导 + 任务安排）
  const tasks = await prisma.planTask.findMany({
    where: { planId: plan.id },
    orderBy: [{ weekNumber: "asc" }, { dayNumber: "asc" }, { id: "asc" }],
    select: {
      title: true,
      description: true,
      status: true,
      dayNumber: true,
      weekNumber: true,
      category: true,
      priority: true,
    },
  });

  // 优先使用已保存的文档；没有文档时用结构化字段 + 任务生成详细文档（含学习指导）
  const hasDocument = !!plan.document && plan.document.trim().length > 0;
  const content = ensureTaskSectionInDocument(
    hasDocument
      ? (plan.document as string)
      : planWithTasksToMarkdown(
          {
            name: plan.name,
            description: plan.description,
            goal: plan.goal,
          },
          tasks
        ),
    tasks
  );

  return (
    <StudioClient
      planId={plan.id}
      title={plan.name}
      initialContent={content}
      autoFocusAi={focusAi === "1"}
    />
  );
}
