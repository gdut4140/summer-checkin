// ============================================================
// Phase 1: Agent Runtime — 自主学习循环的核心引擎
//
// 架构设计：
//
//   runLearningAgent(userId)
//         │
//         ├── Step 1: observe(userId)
//         │   └── 收集全部用户上下文（统计/计划/任务/记忆）
//         │
//         ├── Step 2: analyze(context)
//         │   └── 调用 LLM + analyzeStudyPattern 工具进行诊断
//         │
//         ├── Step 3: plan(analysis)
//         │   └── LLM 生成具体行动列表（JSON 结构化输出）
//         │
//         └── Step 4: execute(plan)
//             └── 根据 action type 调用对应工具
//
// 设计原则：
// ① 每个 Step 是独立函数，可单独测试和复用
// ② LLM 调用带 fallback：模型不可用时返回基于规则的分析
// ③ 所有决策记录到 AgentRun + AgentDecision（可追溯）
// ④ 不依赖数据库迁移 — 使用已有 AgentRun/AgentStep/AgentApproval 模型
// ============================================================

import { prisma } from "@/lib/prisma";
import { createAIClient } from "@/lib/deepseek";
import { AGENT_COACH_PROMPT } from "./prompts";
import { createDecision } from "./decisions";
import { getRelevantMemories, formatMemoriesForPrompt, touchMemories } from "@/lib/memory";
import { createNotification } from "@/lib/notification";
import { generateDailyReport, formatReportAsMarkdown } from "./report";
import type { Prisma } from "@/lib/generated/prisma/client";

// ---- 类型定义 ----

/** 学习上下文（Observe 阶段的输出） */
export interface LearningContext {
  userId: string;
  collectedAt: string;

  /** 用户画像 */
  profile: {
    goalMemories: string[]; // 目标类长期记忆
    activePlanCount: number;
    activePlanNames: string[];
  };

  /** 学习统计 */
  stats: {
    totalHours: number;
    dailyAvg: number;
    weekHours: number;
    todayHours: number;
    streak: number;
    totalCheckins: number;
    topSubjects: { subject: string; hours: number }[];
  };

  /** 计划进度 */
  plans: {
    id: string;
    name: string;
    progress: number; // 0-100
    taskStats: {
      total: number;
      done: number;
      inProgress: number;
      pending: number;
      skipped: number;
    };
  }[];

  /** 待办任务 */
  pendingTasks: {
    id: string;
    title: string;
    planName: string;
    priority: string;
    category: string;
    dayNumber: number | null;
  }[];

  /** 近期打卡（最近 7 天） */
  recentCheckins: {
    date: string;
    hours: number;
    subject: string | null;
    mood: string | null;
  }[];
}

/** 分析发现（Analyze 阶段的输出） */
export interface AnalysisFinding {
  category: "progress" | "weakness" | "deviation" | "streak" | "habit";
  severity: "info" | "warning" | "critical";
  detail: string;
  evidence: Record<string, unknown>;
}

/** 行动项（Plan 阶段的输出） */
export interface AgentAction {
  type: "ADJUST_PLAN" | "CREATE_TASK" | "SEND_REMINDER" | "GENERATE_REPORT" | "ENCOURAGE";
  priority: "high" | "normal" | "low";
  reason: string;
  detail: string;
}

/** LLM 分析结果 */
export interface AgentAnalysis {
  status: "on_track" | "need_attention" | "need_adjustment" | "at_risk";
  summary: string;
  findings: AnalysisFinding[];
  actions: AgentAction[];
}

/** Agent 运行结果 */
export interface AgentRunResult {
  runId: string;
  status: string;
  context: LearningContext;
  analysis: AgentAnalysis | null;
  executedActions: { type: string; success: boolean; message: string }[];
  error?: string;
}

// ---- Helper ----

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

// ============================================================
// Step 1: Observe — 收集用户全部学习上下文
// ============================================================

export async function observe(userId: string): Promise<LearningContext> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // 并行收集所有数据
  const [
    allCheckins,
    weekCheckins,
    todayCheckins,
    activePlans,
    pendingTasks,
    goalMemories,
  ] = await Promise.all([
    // 全部打卡
    prisma.checkin.findMany({
      where: { userId },
      orderBy: { checkinDate: "desc" },
    }),
    // 本周打卡
    prisma.checkin.findMany({
      where: { userId, checkinDate: { gte: weekStart } },
    }),
    // 今日打卡
    prisma.checkin.findMany({
      where: { userId, checkinDate: { gte: todayStart } },
    }),
    // 活跃计划（含打卡和任务统计）
    prisma.plan.findMany({
      where: { userId, status: "active" },
      include: {
        checkins: { select: { hours: true } },
        tasks: {
          select: { status: true },
        },
      },
    }),
    // 待办任务
    prisma.planTask.findMany({
      where: { userId, status: { in: ["pending", "in_progress"] } },
      include: { plan: { select: { name: true } } },
      orderBy: [{ priority: "desc" }, { dayNumber: "asc" }],
      take: 20,
    }),
    // 目标类记忆
    prisma.userMemory.findMany({
      where: { userId, type: "goal" },
      select: { content: true },
    }),
  ]);

  // ---- 统计 ----
  const totalHours = allCheckins.reduce((s, c) => s + c.hours, 0);
  const weekHours = weekCheckins.reduce((s, c) => s + c.hours, 0);
  const todayHours = todayCheckins.reduce((s, c) => s + c.hours, 0);

  // 日均
  const firstCheckin = allCheckins[allCheckins.length - 1];
  const totalDays =
    allCheckins.length > 0 && firstCheckin
      ? Math.max(
          1,
          Math.ceil(
            (now.getTime() - firstCheckin.checkinDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 1;
  const dailyAvg = Math.round((totalHours / totalDays) * 100) / 100;

  // 科目分布
  const subjectMap = new Map<string, number>();
  for (const c of allCheckins) {
    const s = c.subject || "未分类";
    subjectMap.set(s, (subjectMap.get(s) || 0) + c.hours);
  }
  const topSubjects = [...subjectMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([subject, hours]) => ({ subject, hours: Math.round(hours * 10) / 10 }));

  // 连续打卡
  const checkDates = new Set(
    allCheckins.map((c) => c.checkinDate.toISOString().slice(0, 10))
  );
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (checkDates.has(d.toISOString().slice(0, 10))) {
      streak++;
    } else if (i > 0) break;
  }

  // ---- 计划进度（任务完成度） ----
  const plans = activePlans.map((plan) => {
    const taskStats = {
      total: plan.tasks.length,
      done: plan.tasks.filter((t) => t.status === "done").length,
      inProgress: plan.tasks.filter((t) => t.status === "in_progress").length,
      pending: plan.tasks.filter((t) => t.status === "pending").length,
      skipped: plan.tasks.filter((t) => t.status === "skipped").length,
    };
    return {
      id: plan.id,
      name: plan.name,
      progress:
        taskStats.total > 0
          ? Math.round((taskStats.done / taskStats.total) * 100)
          : 0,
      taskStats,
    };
  });

  // ---- 近期打卡 ----
  const recentCheckins = weekCheckins.map((c) => ({
    date: c.checkinDate.toISOString().slice(0, 10),
    hours: c.hours,
    subject: c.subject,
    mood: c.mood,
  }));

  return {
    userId,
    collectedAt: now.toISOString(),
    profile: {
      goalMemories: goalMemories.map((m) => m.content),
      activePlanCount: activePlans.length,
      activePlanNames: activePlans.map((p) => p.name),
    },
    stats: {
      totalHours: Math.round(totalHours * 10) / 10,
      dailyAvg,
      weekHours: Math.round(weekHours * 10) / 10,
      todayHours: Math.round(todayHours * 10) / 10,
      streak,
      totalCheckins: allCheckins.length,
      topSubjects,
    },
    plans,
    pendingTasks: pendingTasks.map((t) => ({
      id: t.id,
      title: t.title,
      planName: t.plan.name,
      priority: t.priority,
      category: t.category,
      dayNumber: t.dayNumber,
    })),
    recentCheckins,
  };
}

// ============================================================
// Step 2: Analyze — LLM 分析学习状态
// ============================================================

export async function analyze(
  context: LearningContext,
  memories: { content: string; type: string }[]
): Promise<AgentAnalysis> {
  const client = createAIClient();

  // 构建分析 prompt
  const memoryText = memories.length > 0
    ? memories.map((m) => `- [${m.type}] ${m.content}`).join("\n")
    : "暂无长期记忆";

  // 精简输入，输出空间留给分析 JSON
  const planSummary = context.plans.map((p) => ({
    name: p.name,
    progress: `${p.progress}%`,
    tasks: `${p.taskStats.done}/${p.taskStats.total} done`,
  }));
  const recentActivity = context.recentCheckins.slice(0, 7).map((c) =>
    `${c.date}: ${c.subject ?? "?"} ${c.hours}h`
  );

  const userMessage = JSON.stringify({
    instruction: "分析用户学习数据，输出 JSON。简明扼要，findings 不超过 5 条，actions 不超过 3 条。",
    profile: context.profile,
    stats: {
      totalHours: context.stats.totalHours,
      dailyAvg: context.stats.dailyAvg,
      weekHours: context.stats.weekHours,
      todayHours: context.stats.todayHours,
      streak: context.stats.streak,
      topSubjects: context.stats.topSubjects.slice(0, 3).map((s) => `${s.subject}:${s.hours}h`),
    },
    plans: planSummary,
    pendingCount: context.pendingTasks.length,
    recentActivity,
    memories: memoryText,
  });

  try {
    const response = await client.chat.completions.create({
      model: process.env.DASHSCOPE_MODEL ?? "agnes-2.5-flash",
      temperature: 0.3,
      max_tokens: 16384,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${AGENT_COACH_PROMPT}\n\n请严格按照输出格式返回 JSON。不要包含 Markdown 代码块标记。`,
        },
        { role: "user", content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      console.warn("[Agent Runtime] LLM 返回空内容，finish_reason:", response.choices[0]?.finish_reason);
      throw new Error("LLM 返回空内容");
    }

    console.log(`[Agent Runtime] LLM 分析结果: ${text.slice(0, 200)}...`);
    const parsed = JSON.parse(text);
    return {
      status: parsed.status ?? "on_track",
      summary: parsed.summary ?? "分析完成",
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    };
  } catch (error) {
    console.warn("[Agent Runtime] LLM 分析失败，使用规则兜底:", error);
    return fallbackAnalysis(context);
  }
}

/**
 * 规则兜底分析 — 当 LLM 不可用时，基于数据阈值做判断
 */
export function fallbackAnalysis(context: LearningContext): AgentAnalysis {
  const findings: AnalysisFinding[] = [];
  const actions: AgentAction[] = [];

  // 1. 检查是否有计划
  if (context.plans.length === 0) {
    findings.push({
      category: "progress",
      severity: "warning",
      detail: "你还没有创建学习计划哦，有个明确的学习路线会让效率高很多",
      evidence: {},
    });
    actions.push({
      type: "ENCOURAGE",
      priority: "high",
      reason: "还没有学习计划",
      detail: "要不要创建一个学习计划？我可以帮你把大目标拆成每天的小任务",
    });
  }

  // 2. 检查计划进度
  for (const plan of context.plans) {
    if (plan.progress < 30 && plan.taskStats.total > 5) {
      findings.push({
        category: "progress",
        severity: "warning",
        detail: `「${plan.name}」完成了 ${plan.progress}%，进度有点慢，不过没关系，我们一起看看怎么调整`,
        evidence: { progress: plan.progress, taskTotal: plan.taskStats.total },
      });
    }
    if (plan.taskStats.pending > 5) {
      actions.push({
        type: "ADJUST_PLAN",
        priority: "normal",
        reason: `「${plan.name}」堆了 ${plan.taskStats.pending} 个待办`,
        detail: `「${plan.name}」攒了不少任务，要不要筛一下哪些是真正重要的，先做那些？`,
      });
    }
  }

  // 3. 检查连续打卡
  if (context.stats.streak === 0 && context.stats.totalCheckins > 5) {
    findings.push({
      category: "streak",
      severity: "info",
      detail: "今天还没打卡呢，别忘了记录你今天学了什么～",
      evidence: { streak: 0 },
    });
  }

  // 4. 检查学习时长
  if (context.stats.dailyAvg < 0.5 && context.stats.totalCheckins > 3) {
    findings.push({
      category: "habit",
      severity: "info",
      detail: `最近每天平均只学了 ${context.stats.dailyAvg} 小时，要不要试试每天至少挤出 1 小时的整块时间？`,
      evidence: { dailyAvg: context.stats.dailyAvg },
    });
  }

  // 生成状态
  const hasWarnings = findings.some((f) => f.severity === "warning");
  const hasCritical = findings.some((f) => f.severity === "critical");

  return {
    status: hasCritical
      ? "at_risk"
      : hasWarnings
        ? "need_attention"
        : "on_track",
    summary: context.plans.length > 0
      ? `今天已经连续打卡 ${context.stats.streak} 天了，${context.plans.length} 个计划在进行中，继续保持！`
      : "还没有学习计划，要不要我帮你定一个？",
    findings,
    actions,
  };
}

// ============================================================
// Step 3: Plan — 生成行动计划（由 analyze 的 LLM 调用完成，
//          这里提供工具函数用于将 actions 写入 AgentApproval）
// ============================================================

export function formatPlanForApproval(
  analysis: AgentAnalysis
): { action: string; payload: AgentAction }[] {
  return analysis.actions
    .filter((a) => a.priority === "high" || a.priority === "normal")
    .map((a) => ({
      action: a.type,
      payload: a,
    }));
}

// ============================================================
// Step 4: Execute — 执行 Agent 行动计划
// ============================================================

export interface ExecutionResult {
  type: string;
  success: boolean;
  message: string;
}

/**
 * 执行一条 Agent 行动
 *
 * Phase 3 升级：
 * - SEND_REMINDER → 创建真实的 Notification 记录
 * - GENERATE_REPORT → 生成结构化日报并保存为 Notification
 * - CREATE_TASK → 尝试自动创建任务（查找活跃计划）
 * - ADJUST_PLAN → 创建通知提醒用户确认调整
 */
export async function executeAction(
  userId: string,
  action: AgentAction,
  context?: LearningContext,
  analysis?: AgentAnalysis
): Promise<ExecutionResult> {
  switch (action.type) {
    case "ENCOURAGE":
      try {
        await createNotification({
          userId,
          type: "encouragement",
          title: "想跟你说",
          content: action.detail,
        });
      } catch {
        // 通知失败不影响主流程
      }
      return {
        type: action.type,
        success: true,
        message: action.detail,
      };

    case "CREATE_TASK":
      // 尝试自动创建任务：查找用户的活跃计划，添加到第一个计划
      try {
        const activePlan = await prisma.plan.findFirst({
          where: { userId, status: "active" },
          orderBy: { createdAt: "desc" },
        });

        if (!activePlan) {
          return {
            type: action.type,
            success: false,
            message: `无法自动创建任务（用户无活跃计划）：${action.detail}`,
          };
        }

        const task = await prisma.planTask.create({
          data: {
            planId: activePlan.id,
            userId,
            title: action.detail.slice(0, 160),
            description: `系统自动创建 — ${action.reason}`,
            category: "study",
            priority: action.priority,
          },
        });

        return {
          type: action.type,
          success: true,
          message: `已在计划「${activePlan.name}」中自动创建任务「${task.title}」`,
        };
      } catch (error) {
        return {
          type: action.type,
          success: false,
          message: `创建任务失败：${error instanceof Error ? error.message : "未知错误"}`,
        };
      }

    case "ADJUST_PLAN":
      try {
        await createNotification({
          userId,
          type: "analysis",
          title: "关于你的学习计划",
          content: action.detail,
          actionUrl: "/agent",
        });
        return {
          type: action.type,
          success: true,
          message: `已生成计划调整通知：${action.detail}`,
        };
      } catch {
        return {
          type: action.type,
          success: false,
          message: `计划调整通知生成失败：${action.detail}`,
        };
      }

    case "SEND_REMINDER":
      try {
        const notification = await createNotification({
          userId,
          type: "reminder",
          title: "别忘了哦",
          content: action.detail,
          actionUrl: "/checkin",
        });
        if (notification) {
          return {
            type: action.type,
            success: true,
            message: `已生成提醒通知：${action.detail}`,
          };
        }
        return {
          type: action.type,
          success: false,
          message: `提醒生成失败：通知创建返回空`,
        };
      } catch {
        return {
          type: action.type,
          success: false,
          message: `提醒生成失败：${action.detail}`,
        };
      }

    case "GENERATE_REPORT":
      // Phase 3: 生成结构化的每日学习报告
      try {
        if (context && analysis) {
          const report = generateDailyReport({
            userId,
            context,
            analysis,
          });

          // 将报告保存为通知
          const markdown = formatReportAsMarkdown(report);
          await createNotification({
            userId,
            type: "report",
            title: `${report.date} 学习小结`,
            content: markdown,
            actionUrl: "/agent",
          });

          console.log(
            `[Agent Runtime] 已生成学习报告: status=${report.status}, summary=${report.summary.slice(0, 60)}`
          );

          return {
            type: action.type,
            success: true,
            message: `学习报告已生成：${report.summary}`,
          };
        }
        // 无 context/analysis 时降级为简单通知
        await createNotification({
          userId,
          type: "report",
          title: "学习小结",
          content: action.detail,
          actionUrl: "/agent",
        });
        return {
          type: action.type,
          success: true,
          message: `学习报告摘要：${action.detail}`,
        };
      } catch {
        return {
          type: action.type,
          success: false,
          message: `报告生成失败：${action.detail}`,
        };
      }

    default:
      return {
        type: action.type,
        success: false,
        message: `未知 action 类型：${(action as { type: string }).type}`,
      };
  }
}

// ============================================================
// 完整 Agent 循环：Observe → Analyze → Plan → Execute → Record
// ============================================================

export interface RunAgentOptions {
  /** 是否保存到 AgentRun（默认 true） */
  persist?: boolean;
  /** 运行模式 */
  mode?: "coach" | "review" | "daily";
}

export async function runLearningAgent(
  userId: string,
  options: RunAgentOptions = {}
): Promise<AgentRunResult> {
  const { persist = true, mode = "coach" } = options;
  const startedAt = new Date();

  console.log(`[Agent Runtime] ====== 开始运行 (mode: ${mode}) ======`);

  // 创建 AgentRun 记录
  let run: { id: string } | null = null;
  if (persist) {
    run = await prisma.agentRun.create({
      data: {
        userId,
        mode,
        goal: mode === "daily" ? "每日学习状态自动分析" : `自主${mode}分析`,
        status: "running",
        startedAt,
        currentStep: 1,
        steps: {
          create: {
            stepNumber: 1,
            kind: "context",
            status: "running",
            title: "Observe: 收集学习上下文",
            detail: "正在汇总学习统计、计划进度、待办任务和长期记忆。",
            startedAt,
          },
        },
      },
    });
  }

  try {
    // ---- Step 1: Observe ----
    console.log("[Agent Runtime] Step 1/4: Observe");
    const context = await observe(userId);

    // 获取长期记忆
    const memories = await getRelevantMemories(userId, 20);

    // 标记记忆被检索使用（用于冷淘汰）
    touchMemories(memories.map((m) => m.id)).catch(() => {});

    // 更新 Step 1
    if (run) {
      const step1 = await prisma.agentStep.findFirstOrThrow({
        where: { runId: run.id, stepNumber: 1 },
      });
      await prisma.agentStep.update({
        where: { id: step1.id },
        data: {
          status: "completed",
          output: asJson({
            stats: context.stats,
            plansCount: context.plans.length,
            pendingTasks: context.pendingTasks.length,
            memoriesCount: memories.length,
          }),
          completedAt: new Date(),
        },
      });
    }

    // ---- Step 2-3: Analyze + Plan (LLM 一次调用完成两步) ----
    console.log("[Agent Runtime] Step 2-3/4: Analyze + Plan");
    const analysisStepNum = 2;

    if (run) {
      await prisma.agentStep.create({
        data: {
          runId: run.id,
          stepNumber: analysisStepNum,
          kind: "analysis",
          status: "running",
          title: "Analyze + Plan: LLM 分析与规划",
          detail: "正在用 LLM 分析学习状态并生成行动建议。",
          input: asJson({
            statsSummary: `${context.stats.totalHours}h total, ${context.stats.dailyAvg}h/day avg`,
            plansCount: context.plans.length,
            pendingTasks: context.pendingTasks.length,
          }),
          startedAt: new Date(),
        },
      });
    }

    const analysis = await analyze(context, memories);

    // 更新分析步骤
    if (run) {
      const analysisStep = await prisma.agentStep.findFirstOrThrow({
        where: { runId: run.id, stepNumber: analysisStepNum },
      });
      await prisma.agentStep.update({
        where: { id: analysisStep.id },
        data: {
          status: "completed",
          output: asJson({
            status: analysis.status,
            summary: analysis.summary,
            findingsCount: analysis.findings.length,
            actionsCount: analysis.actions.length,
          }),
          detail: analysis.summary,
          completedAt: new Date(),
        },
      });

      // 分析发现 + 行动建议 → 写入 AgentApproval（UI 可展示）
      for (const finding of analysis.findings) {
        await prisma.agentApproval.create({
          data: {
            runId: run.id,
            stepId: analysisStep.id,
            action: "daily_analysis",
            status: "pending",
            payload: asJson({ type: "finding", ...finding }),
          },
        });
      }
      for (const action of analysis.actions) {
        await prisma.agentApproval.create({
          data: {
            runId: run.id,
            stepId: analysisStep.id,
            action: "daily_action",
            status: "pending",
            payload: asJson({ ...action, type: "action" }),
          },
        });
      }
    }

    // ---- Step 4: Execute ----
    console.log("[Agent Runtime] Step 4/4: Execute");
    const executeStepNum = 3;
    const executedActions: AgentRunResult["executedActions"] = [];

    if (run) {
      await prisma.agentStep.create({
        data: {
          runId: run.id,
          stepNumber: executeStepNum,
          kind: "execution",
          status: "running",
          title: "Execute: 执行行动建议",
          detail: `正在执行 ${analysis.actions.length} 条建议。`,
          input: asJson({ actions: analysis.actions }),
          startedAt: new Date(),
        },
      });
    }

    for (const action of analysis.actions) {
      const result = await executeAction(userId, action, context, analysis);
      executedActions.push(result);
      console.log(
        `[Agent Runtime]   action=${result.type} success=${result.success}: ${result.message.slice(0, 80)}`
      );

      // Phase 2: 记录 Agent 决策到 AgentDecision 表
      if (run) {
        const decisionType =
          action.type === "ADJUST_PLAN" ? "PLAN_ADJUST" :
          action.type === "SEND_REMINDER" ? "REMINDER" :
          action.type === "CREATE_TASK" ? "TASK_CREATE" :
          "ANALYSIS";
        await createDecision({
          userId,
          runId: run.id,
          type: decisionType,
          reason: action.reason,
          action: {
            detail: action.detail,
            priority: action.priority,
            executed: result.success,
            message: result.message,
          },
          status: "pending", // 等用户确认后才算 executed
        });
      }
    }

    // 更新执行步骤
    if (run) {
      const execStep = await prisma.agentStep.findFirstOrThrow({
        where: { runId: run.id, stepNumber: executeStepNum },
      });
      await prisma.agentStep.update({
        where: { id: execStep.id },
        data: {
          status: "completed",
          output: asJson({ executedActions }),
          detail: `执行了 ${executedActions.length} 条建议，${executedActions.filter((a) => a.success).length} 条成功`,
          completedAt: new Date(),
        },
      });
    }

    // ---- 完成 ----
    const completedAt = new Date();

    if (run) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          currentStep: executeStepNum,
          summary: analysis.summary,
          completedAt,
        },
      });
    }

    console.log(
      `[Agent Runtime] ====== 完成: ${analysis.status} | ${executedActions.length} actions ======`
    );

    return {
      runId: run?.id ?? "no-persist",
      status: analysis.status,
      context,
      analysis,
      executedActions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent Runtime 异常";
    console.error("[Agent Runtime] 执行失败:", message);

    if (run) {
      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          error: message,
          completedAt: new Date(),
        },
      }).catch(() => {});
      await prisma.agentStep.updateMany({
        where: { runId: run.id, status: "running" },
        data: { status: "failed", error: message, completedAt: new Date() },
      }).catch(() => {});
    }

    return {
      runId: run?.id ?? "no-persist",
      status: "at_risk",
      context: null as unknown as LearningContext,
      analysis: null,
      executedActions: [],
      error: message,
    };
  }
}
