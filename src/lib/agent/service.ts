import { createAIClient } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  planDraftSchema,
  type AgentContextSnapshot,
  type AgentRunResponse,
  type PlanDraft,
} from "./types";
import { planDraftToMarkdown } from "@/lib/studio/plan-serialize";

const MAX_TASKS = 40;

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function fallbackDraft(goal: string): PlanDraft {
  const shortGoal = goal.trim().slice(0, 72);
  return {
    name: `${shortGoal}学习计划`,
    description: `围绕“${shortGoal}”建立一个可执行的 7 天学习闭环。`,
    goal: shortGoal,
    targetHours: 14,
    assumptions: ["按每天约 2 小时安排", "先完成基础理解，再通过练习验证"],
    tasks: [
      {
        title: "Day 1：拆解目标并准备学习环境",
        description: "明确本周产出，整理资料，完成必要的环境准备。",
        dayNumber: 1,
        weekNumber: 1,
        category: "study",
        priority: "high",
      },
      {
        title: "Day 2：学习核心概念",
        description: "阅读主线资料，记录三个关键概念和一个待解决问题。",
        dayNumber: 2,
        weekNumber: 1,
        category: "study",
        priority: "high",
      },
      {
        title: "Day 3：完成一个小练习",
        description: "把核心概念应用到一个小练习中，保留结果和遇到的问题。",
        dayNumber: 3,
        weekNumber: 1,
        category: "exercise",
        priority: "normal",
      },
      {
        title: "Day 4：做一次项目实践",
        description: "围绕目标完成一个可展示的小功能或小作品。",
        dayNumber: 4,
        weekNumber: 1,
        category: "project",
        priority: "high",
      },
      {
        title: "Day 5：复盘并查漏补缺",
        description: "回顾练习结果，补齐最薄弱的一个知识点。",
        dayNumber: 5,
        weekNumber: 1,
        category: "review",
        priority: "normal",
      },
      {
        title: "Day 6：综合练习",
        description: "不看答案完成一次综合任务，记录完成耗时和卡点。",
        dayNumber: 6,
        weekNumber: 1,
        category: "exercise",
        priority: "normal",
      },
      {
        title: "Day 7：阶段总结与下一步计划",
        description: "整理本周成果、问题和下一阶段要继续推进的事项。",
        dayNumber: 7,
        weekNumber: 1,
        category: "review",
        priority: "high",
      },
    ],
  };
}

async function collectContext(userId: string): Promise<AgentContextSnapshot> {
  const now = new Date();
  const recentSince = new Date(now);
  recentSince.setDate(recentSince.getDate() - 7);

  const [allCheckins, recentCheckins, plans, memoryCount] = await Promise.all([
    prisma.checkin.findMany({
      where: { userId },
      select: { hours: true },
    }),
    prisma.checkin.findMany({
      where: { userId, checkinDate: { gte: recentSince } },
      select: { hours: true },
    }),
    prisma.plan.findMany({
      where: { userId, status: "active" },
      select: {
        id: true,
        name: true,
        targetHours: true,
        checkins: { select: { hours: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.userMemory.count({ where: { userId } }),
  ]);

  return {
    totalCheckins: allCheckins.length,
    totalHours: Math.round(allCheckins.reduce((sum, item) => sum + item.hours, 0) * 10) / 10,
    recentHours: Math.round(recentCheckins.reduce((sum, item) => sum + item.hours, 0) * 10) / 10,
    activePlans: plans.map((plan) => {
      const completedHours = plan.checkins.reduce((sum, item) => sum + item.hours, 0);
      return {
        id: plan.id,
        name: plan.name,
        progress:
          plan.targetHours > 0
            ? Math.min(100, Math.round((completedHours / plan.targetHours) * 100))
            : 0,
      };
    }),
    memoryCount,
  };
}

// 提取模型输出中的 JSON 主体（兼容可能的 markdown 代码围栏）
function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

function parseDraft(value: unknown): PlanDraft | null {
  const candidate =
    value && typeof value === "object" && "plan" in value
      ? (value as { plan?: unknown }).plan
      : value;
  const result = planDraftSchema.safeParse(candidate);
  if (!result.success) return null;
  // 模型没给出任务安排（tasks 缺失或为空，schema 的 .default([]) 会静默通过）→ 视为无效，
  // 交给 fallback（自带任务），避免创建出没有任务的计划
  if (result.data.tasks.length === 0) return null;
  return {
    ...result.data,
    tasks: result.data.tasks.slice(0, MAX_TASKS),
  };
}

async function generateDraft(
  goal: string,
  context: AgentContextSnapshot
): Promise<{ draft: PlanDraft; source: "model" | "fallback" }> {
  try {
    const client = createAIClient();
    // 模型偶尔输出损坏/截断的 JSON（如未加引号的属性名），解析失败时重试一次
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await client.chat.completions.create({
        model: process.env.DASHSCOPE_MODEL ?? "agnes-2.5-flash",
        temperature: 0.3,
        max_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是学习计划规划 Agent。只返回 JSON，不要 Markdown。计划必须可执行，最多 40 个任务。字段为 name、description、goal、targetHours、assumptions、tasks；tasks 每项包含 title、description、dayNumber、weekNumber、category(study/project/review/exercise)、priority(high/normal/low)。",
          },
          {
            role: "user",
            content: JSON.stringify({
              goal,
              context,
              instruction: "根据用户目标和真实学习数据生成 7-30 天的计划草案，优先给出清晰的阶段产出。",
            }),
          },
        ],
      });
      const text = response.choices[0]?.message?.content?.trim();
      if (!text) continue;
      try {
        const parsed = parseDraft(JSON.parse(extractJsonText(text)));
        if (parsed) return { draft: parsed, source: "model" };
      } catch (parseError) {
        console.warn(
          `[Agent] 第 ${attempt + 1} 次 draft JSON 解析失败:`,
          parseError instanceof Error ? parseError.message : parseError
        );
      }
    }
  } catch (error) {
    console.warn("[Agent] plan draft generation failed, using fallback:", error);
  }

  return { draft: fallbackDraft(goal), source: "fallback" };
}

const runDetails = {
  steps: { orderBy: { stepNumber: "asc" as const } },
  approvals: { orderBy: { createdAt: "desc" as const } },
};

export async function getAgentRunForUser(runId: string, userId: string) {
  return prisma.agentRun.findFirst({
    where: { id: runId, userId },
    include: runDetails,
  });
}

export async function listAgentRuns(userId: string) {
  return prisma.agentRun.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      steps: { orderBy: { stepNumber: "desc" }, take: 1 },
      approvals: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function createAgentRun(
  userId: string,
  goal: string,
  mode = "planner"
) {
  const run = await prisma.agentRun.create({
    data: {
      userId,
      mode,
      goal,
      status: "running",
      startedAt: new Date(),
      currentStep: 1,
      steps: {
        create: {
          stepNumber: 1,
          kind: "context",
          status: "running",
          title: "读取学习上下文",
          detail: "正在汇总近期学习记录、活跃计划和长期记忆。",
          startedAt: new Date(),
        },
      },
    },
  });

  try {
    const context = await collectContext(userId);
    const contextStep = await prisma.agentStep.findFirstOrThrow({
      where: { runId: run.id, stepNumber: 1 },
    });
    await prisma.agentStep.update({
      where: { id: contextStep.id },
      data: {
        status: "completed",
        output: asJson(context),
        completedAt: new Date(),
      },
    });

    const planningStep = await prisma.agentStep.create({
      data: {
        runId: run.id,
        stepNumber: 2,
        kind: "planning",
        status: "running",
        title: "生成计划草案",
        detail: "根据目标和学习数据生成可执行的阶段任务。",
        input: asJson({ goal, context }),
        startedAt: new Date(),
      },
    });
    const { draft, source } = await generateDraft(goal, context);

    await prisma.$transaction([
      prisma.agentStep.update({
        where: { id: planningStep.id },
        data: {
          status: "completed",
          output: asJson({ draft, source }),
          detail:
            source === "model"
              ? "计划草案已生成，等待确认后写入学习计划。"
              : "模型暂不可用，已生成可编辑的基础草案。",
          completedAt: new Date(),
        },
      }),
      prisma.agentApproval.create({
        data: {
          runId: run.id,
          stepId: planningStep.id,
          action: "create_plan",
          status: "pending",
          payload: asJson(draft),
        },
      }),
      prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "awaiting_approval",
          currentStep: 2,
          summary: "计划草案已生成，等待你确认后写入学习计划。",
        },
      }),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "failed", error: message, completedAt: new Date() },
    });
    await prisma.agentStep.updateMany({
      where: { runId: run.id, status: "running" },
      data: { status: "failed", error: message, completedAt: new Date() },
    });
  }

  return getAgentRunForUser(run.id, userId);
}

export async function decideAgentApproval(
  userId: string,
  runId: string,
  approvalId: string,
  decision: "approve" | "reject",
  reason?: string
) {
  const run = await getAgentRunForUser(runId, userId);
  if (!run) return null;

  const approval = run.approvals.find(
    (item) => item.id === approvalId && item.status === "pending"
  );
  if (!approval) {
    throw new Error("This approval is no longer pending");
  }

  if (decision === "reject") {
    await prisma.$transaction([
      prisma.agentApproval.update({
        where: { id: approval.id },
        data: {
          status: "rejected",
          decisionReason: reason?.trim() || null,
          decidedAt: new Date(),
        },
      }),
      prisma.agentStep.create({
        data: {
          runId,
          stepNumber: run.currentStep + 1,
          kind: "approval",
          status: "completed",
          title: "用户拒绝计划草案",
          detail: reason?.trim() || "用户暂不接受这份计划草案。",
          completedAt: new Date(),
        },
      }),
      prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: "rejected",
          currentStep: run.currentStep + 1,
          summary: "计划草案已拒绝，可以重新提交一个目标。",
          completedAt: new Date(),
        },
      }),
    ]);
    return getAgentRunForUser(runId, userId);
  }

  const draft = parseDraft(approval.payload);
  if (!draft) throw new Error("The plan draft is invalid");

  await prisma.$transaction(async (tx) => {
    const pending = await tx.agentApproval.findFirst({
      where: { id: approval.id, runId, status: "pending" },
    });
    if (!pending) throw new Error("This approval is no longer pending");

    const approvalStep = await tx.agentStep.create({
      data: {
        runId,
        stepNumber: run.currentStep + 1,
        kind: "approval",
        status: "completed",
        title: "确认计划草案",
        detail: "用户已确认，开始写入计划和任务。",
        completedAt: new Date(),
      },
    });
    const executionStep = await tx.agentStep.create({
      data: {
        runId,
        stepNumber: run.currentStep + 2,
        kind: "execution",
        status: "running",
        title: "写入学习计划",
        detail: "正在创建计划和每日任务。",
        startedAt: new Date(),
      },
    });

    const plan = await tx.plan.create({
      data: {
        userId,
        name: draft.name,
        description: draft.description ?? null,
        goal: draft.goal,
        targetHours: draft.targetHours,
        status: "active",
        // 确认创建时直接生成详细计划文档（学习指导 + 任务安排），
        // 用户打开文档工作室即可看到详细的、有具体指导的计划
        document: planDraftToMarkdown(draft),
      },
    });

    await Promise.all(
      draft.tasks.slice(0, MAX_TASKS).map((task) =>
        tx.planTask.create({
          data: {
            userId,
            planId: plan.id,
            title: task.title,
            description: task.description ?? null,
            dayNumber: task.dayNumber ?? null,
            weekNumber: task.weekNumber ?? null,
            category: task.category,
            priority: task.priority,
          },
        })
      )
    );

    await tx.agentApproval.update({
      where: { id: approval.id },
      data: {
        status: "approved",
        decisionReason: reason?.trim() || null,
        decidedAt: new Date(),
      },
    });
    await tx.agentStep.update({
      where: { id: executionStep.id },
      data: {
        status: "completed",
        output: asJson({ planId: plan.id, tasksCreated: draft.tasks.length }),
        detail: `已创建计划和 ${draft.tasks.length} 个任务。`,
        completedAt: new Date(),
      },
    });
    await tx.agentRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        currentStep: executionStep.stepNumber,
        summary: `计划“${draft.name}”已创建，可从今天的第一个任务开始。`,
        completedAt: new Date(),
      },
    });

    void approvalStep;
  });

  return getAgentRunForUser(runId, userId);
}

export async function cancelAgentRun(userId: string, runId: string) {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId } });
  if (!run) return null;
  if (["completed", "failed", "cancelled", "rejected"].includes(run.status)) {
    return getAgentRunForUser(runId, userId);
  }

  await prisma.$transaction([
    prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "cancelled",
        summary: "Agent 运行已取消，未执行未确认的写入操作。",
        completedAt: new Date(),
      },
    }),
    prisma.agentStep.updateMany({
      where: { runId, status: { in: ["running", "pending"] } },
      data: { status: "cancelled", completedAt: new Date() },
    }),
  ]);

  return getAgentRunForUser(runId, userId);
}

export function serializeAgentRun(
  run: NonNullable<Awaited<ReturnType<typeof getAgentRunForUser>>>
): AgentRunResponse {
  return {
    id: run.id,
    mode: run.mode,
    goal: run.goal,
    status: run.status,
    currentStep: run.currentStep,
    maxSteps: run.maxSteps,
    summary: run.summary,
    error: run.error,
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    steps: run.steps.map((step) => ({
      id: step.id,
      stepNumber: step.stepNumber,
      kind: step.kind,
      status: step.status,
      title: step.title,
      detail: step.detail,
      input: step.input,
      output: step.output,
      error: step.error,
      startedAt: step.startedAt?.toISOString() ?? null,
      completedAt: step.completedAt?.toISOString() ?? null,
      createdAt: step.createdAt.toISOString(),
    })),
    approvals: run.approvals.map((approval) => ({
      id: approval.id,
      action: approval.action,
      status: approval.status,
      payload: approval.payload,
      decisionReason: approval.decisionReason,
      decidedAt: approval.decidedAt?.toISOString() ?? null,
      createdAt: approval.createdAt.toISOString(),
    })),
  };
}

