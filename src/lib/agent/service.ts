import { completionsWithFallback } from "@/lib/model-pool";
import { prisma } from "@/lib/prisma";
import {
  planDraftSchema,
  type AgentContextSnapshot,
  type PlanDraft,
} from "./types";
import { planDraftToMarkdown } from "@/lib/studio/plan-serialize";

const MAX_TASKS = 40;

function fallbackDraft(goal: string): PlanDraft {
  const shortGoal = goal.trim().slice(0, 72);
  return {
    name: `${shortGoal}学习计划`,
    description: `围绕“${shortGoal}”建立一个可执行的 7 天学习闭环。`,
    goal: shortGoal,
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
  const [totalCheckins, plans, memoryCount] = await Promise.all([
    prisma.checkin.count({ where: { userId } }),
    prisma.plan.findMany({
      where: { userId, status: "active" },
      select: {
        id: true,
        name: true,
        tasks: { select: { status: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.userMemory.count({ where: { userId } }),
  ]);

  return {
    totalCheckins,
    activePlans: plans.map((plan) => {
      const total = plan.tasks.length;
      const done = plan.tasks.filter((t) => t.status === "done").length;
      return {
        id: plan.id,
        name: plan.name,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
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

interface GenerateDraftExtras {
  description?: string | null;
  /** 最近对话摘要（createPlan 场景传入，保留个性化） */
  conversation?: string;
  /** 长期记忆正文（createPlan 场景传入） */
  memories?: string;
}

async function generateDraft(
  goal: string,
  context: AgentContextSnapshot,
  userId: string,
  extras?: GenerateDraftExtras
): Promise<{ draft: PlanDraft; source: "model" | "fallback" }> {
  try {
    // 模型偶尔输出损坏/截断的 JSON（如未加引号的属性名），解析失败时重试一次
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: response } = await completionsWithFallback(
        "high",
        (entry, client, extraBody) =>
          client.chat.completions.create({
            model: entry.modelName,
            temperature: 0.3,
            max_tokens: 8192,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "你是学习计划规划 Agent。只返回 JSON，不要 Markdown。计划必须可执行，最多 40 个任务。字段为 name、description、goal、assumptions、tasks；tasks 每项包含 title、description、dayNumber、weekNumber、category(study/project/review/exercise)、priority(high/normal/low)。任务 description 用一两句话写清要做什么和完成标准，简明扼要。",
              },
              {
                role: "user",
                content: JSON.stringify({
                  goal,
                  context,
                  ...(extras?.description ? { description: extras.description } : {}),
                  ...(extras?.conversation ? { conversation: extras.conversation } : {}),
                  ...(extras?.memories ? { memories: extras.memories } : {}),
                  instruction: "根据用户目标和真实学习数据生成 7-30 天的计划草案，优先给出清晰的阶段产出。",
                }),
              },
            ],
            ...extraBody,
          }),
        { userId, surface: "agent-bg" }
      );
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

export interface GeneratePlanInput {
  goal?: string | null;
  description?: string | null;
  /** 最近对话摘要，保留聊天上下文里的个性化 */
  conversation?: string;
  /** 长期记忆正文 */
  memories?: string;
}

/**
 * 为已创建的计划生成完整内容：详细文档（Markdown）+ 每日任务。
 * 供聊天 createPlan 工具使用；模型不可用时自动回落基础草案（fallbackDraft），不会失败。
 */
export async function generatePlanForPlan(
  planId: string,
  userId: string,
  input: GeneratePlanInput
): Promise<{ planId: string; name: string; tasksCreated: number }> {
  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) throw new Error(`计划不存在: ${planId}`);

  const goal = input.goal?.trim() || plan.goal || plan.name || "学习计划";
  const context = await collectContext(userId);
  const { draft } = await generateDraft(goal, context, userId, {
    description: input.description,
    conversation: input.conversation,
    memories: input.memories,
  });

  // 文档标题与计划名保持一致；任务直接来自 draft（结构化，比解析文档更可靠）
  const document = planDraftToMarkdown({ ...draft, name: plan.name });
  await prisma.plan.update({ where: { id: planId }, data: { document } });

  const tasksToCreate = draft.tasks.slice(0, MAX_TASKS);
  await Promise.all(
    tasksToCreate.map((task) =>
      prisma.planTask.create({
        data: {
          userId,
          planId,
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

  return { planId, name: plan.name, tasksCreated: tasksToCreate.length };
}
