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
// ③ 运行轨迹记录到 AgentRun + AgentStep（可追溯）
// ④ 不依赖数据库迁移 — 使用已有 AgentRun/AgentStep 模型
// ============================================================

import { prisma } from "@/lib/prisma";
import { checkinDayKeys, computeStreak } from "@/lib/checkin-streak";
import { completionsWithFallback } from "@/lib/model-pool";
import { AGENT_COACH_PROMPT } from "./prompts";
import { getRelevantMemories, touchMemories } from "@/lib/memory";
import { createNotification } from "@/lib/notification";
import { generateDailyReport, formatReportAsMarkdown } from "./report";
import { extractJsonText } from "@/lib/llm-json";
import {
  agentAnalysisSchema,
  type AgentAction,
  type AgentAnalysis,
  type AnalysisFinding,
} from "./types";
import type { Prisma } from "@prisma-generated/client";

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

  /**
   * 学习统计。
   * totalCheckins 是打卡记录**条数**（含 AI 标记完成任务写进来的），不是天数。
   * 学习时长不在这里——以番茄钟为准，见下面的 focus 字段。
   */
  stats: {
    streak: number;
    totalCheckins: number;
  };

  /** 今日专注（番茄钟，来自 StudyRecord） */
  focus: {
    todayMinutes: number;
    todaySessions: number;
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

  /** 近期打卡（最近 7 次，仅日期） */
  recentCheckins: {
    date: string;
  }[];
}

// AnalysisFinding / AgentAction / AgentAnalysis 现在由 types.ts 的 zod schema
// 推导（z.infer），在这里转发一下，让 `from "./runtime"` 的既有导入继续可用
// （report.ts 就是这么导入的）。
export type { AgentAction, AgentAnalysis, AnalysisFinding } from "./types";

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
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  // 并行收集所有数据
  const [
    allCheckins,
    activePlans,
    pendingTasks,
    goalMemories,
    todayFocusRecords,
  ] = await Promise.all([
    // 全部打卡
    prisma.checkin.findMany({
      where: { userId },
      orderBy: { checkinDate: "desc" },
    }),
    // 活跃计划（含任务统计）
    prisma.plan.findMany({
      where: { userId, status: "active" },
      include: {
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
    // 今日专注记录（番茄钟）
    prisma.studyRecord.findMany({
      where: { userId, date: { gte: todayStart } },
      select: { totalMinutes: true },
    }),
  ]);

  // ---- 统计（打卡含两类记录：一键到访 + AI 代报「完成任务」） ----
  // 连续打卡走共享口径（本地时区，今天没打卡不算断）。
  // 这里原先是一份 toISOString().slice(0,10) 的 UTC 键实现，与 study-stats.ts
  // 逐字重复，且同样会把今天的打卡挤出扫描窗口。
  const streak = computeStreak(checkinDayKeys(allCheckins));

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

  // ---- 近期打卡（最近 7 次，仅日期） ----
  const recentCheckins = allCheckins.slice(0, 7).map((c) => ({
    date: c.checkinDate.toISOString().slice(0, 10),
  }));

  // ---- 今日专注（番茄钟，来自 StudyRecord） ----
  const todayFocusMinutes = Math.round(
    todayFocusRecords.reduce((s, r) => s + r.totalMinutes, 0)
  );
  const todayFocusSessions = todayFocusRecords.length;

  return {
    userId,
    collectedAt: now.toISOString(),
    profile: {
      goalMemories: goalMemories.map((m) => m.content),
      activePlanCount: activePlans.length,
      activePlanNames: activePlans.map((p) => p.name),
    },
    stats: {
      streak,
      totalCheckins: allCheckins.length,
    },
    focus: {
      todayMinutes: todayFocusMinutes,
      todaySessions: todayFocusSessions,
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

/** analyze 的结果：这次分析是模型给的还是规则兜底的，以及兜底的具体原因 */
export interface AnalyzeResult {
  analysis: AgentAnalysis;
  /** model = 模型返回了合法结构；fallback = 走了规则兜底 */
  source: "model" | "fallback";
  /** 仅 source=fallback 时有值，用于区分「模型胡说」和「模型没响应」 */
  reason?: "empty_text" | "json_parse" | "schema_invalid" | "llm_error";
}

export async function analyze(
  context: LearningContext,
  memories: { content: string; type: string }[],
  userId: string
): Promise<AnalyzeResult> {
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
  const recentActivity = context.recentCheckins.slice(0, 7).map((c) => c.date);

  const userMessage = JSON.stringify({
    instruction: "分析用户学习数据，输出 JSON。简明扼要，findings 不超过 5 条，actions 不超过 3 条。",
    profile: context.profile,
    stats: {
      streak: context.stats.streak,
      totalCheckins: context.stats.totalCheckins,
    },
    focus: {
      todayMinutes: context.focus.todayMinutes,
      todaySessions: context.focus.todaySessions,
    },
    plans: planSummary,
    pendingCount: context.pendingTasks.length,
    recentActivity,
    memories: memoryText,
  });

  let reason: AnalyzeResult["reason"] = "llm_error";

  try {
    // 模型偶尔输出损坏/截断的 JSON，或结构对不上 prompt。
    // 失败重试一次，两次都不行才落到规则兜底（同 service.ts 的形状）。
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: response } = await completionsWithFallback(
        "high",
        (entry, client, extraBody) =>
          client.chat.completions.create({
            model: entry.modelName,
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
            ...extraBody,
          }),
        { userId, surface: "agent-bg" }
      );

      const text = response.choices[0]?.message?.content?.trim();
      if (!text) {
        console.warn(
          `[Agent Runtime] 第 ${attempt + 1} 次分析返回空内容，finish_reason:`,
          response.choices[0]?.finish_reason
        );
        reason = "empty_text";
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(extractJsonText(text));
      } catch (parseError) {
        console.warn(
          `[Agent Runtime] 第 ${attempt + 1} 次分析 JSON 解析失败:`,
          parseError instanceof Error ? parseError.message : parseError
        );
        reason = "json_parse";
        continue;
      }

      // ⚠️ 这层校验是本次修复的核心。此前只做 JSON.parse 就取字段，
      // 于是任何「能解析但结构不对」的输出（{"foo":1}、{}、{"status":"x"}）
      // 都会被读成 status=on_track + 空 findings —— 失败伪装成「一切正常」。
      const parsed = agentAnalysisSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn(
          `[Agent Runtime] 第 ${attempt + 1} 次分析结构校验失败:`,
          parsed.error.issues
            .map((i) => `${i.path.map(String).join(".") || "(根)"}: ${i.message}`)
            .join("; ")
        );
        reason = "schema_invalid";
        continue;
      }

      console.log(
        `[Agent Runtime] ✅ 模型分析 (第 ${attempt + 1} 次): status=${parsed.data.status} ` +
          `findings=${parsed.data.findings.length} actions=${parsed.data.actions.length}`
      );
      return { analysis: parsed.data, source: "model" };
    }
  } catch (error) {
    console.warn("[Agent Runtime] LLM 调用失败，使用规则兜底:", error);
    reason = "llm_error";
  }

  console.warn(`[Agent Runtime] ⚠️ 分析走规则兜底 (reason=${reason})`);
  return { analysis: fallbackAnalysis(context), source: "fallback", reason };
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
// Step 3: Plan — 生成行动计划（由 analyze 的 LLM 调用完成）
// ============================================================

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
 * 所有动作都只产生 Notification，不改动用户的计划 / 任务数据——
 * 要改什么由用户自己决定。
 * - SEND_REMINDER → 创建真实的 Notification 记录
 * - GENERATE_REPORT → 生成结构化日报并保存为 Notification
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
        // 今日提醒已发送过（每日节流去重），视为成功但不重复打扰
        return {
          type: action.type,
          success: true,
          message: `今日提醒已发送过，已跳过重复提醒`,
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

/**
 * AgentRun.goal 的取值（该字段必填非空）。
 *
 * 抽成函数是因为它现在有两个写入方：daily-run 路由先用唯一约束抢锁建行，
 * runtime 收到 runId 后复用该行。两处各写一份字符串迟早会漂移。
 */
export function agentRunGoal(mode: string): string {
  return mode === "daily" ? "每日学习状态自动分析" : `自主${mode}分析`;
}

export interface RunAgentOptions {
  /** 是否保存到 AgentRun（默认 true） */
  persist?: boolean;
  /** 运行模式 */
  mode?: "coach" | "review" | "daily";
  /**
   * 已存在的 AgentRun 行（daily-run 路由抢锁时创建）。
   * 给了就复用它，不再新建——否则会出现「锁行 + 真运行行」两行并存。
   */
  runId?: string;
}

export async function runLearningAgent(
  userId: string,
  options: RunAgentOptions = {}
): Promise<AgentRunResult> {
  const { persist = true, mode = "coach", runId } = options;
  const startedAt = new Date();

  console.log(`[Agent Runtime] ====== 开始运行 (mode: ${mode}) ======`);

  // 创建 / 接管 AgentRun 记录
  let run: { id: string } | null = null;
  if (persist) {
    if (runId) {
      // 复用路由抢到的锁行：转 running 并补上第 1 个 step
      run = { id: runId };
      await prisma.agentRun.update({
        where: { id: runId },
        data: { status: "running", startedAt, currentStep: 1 },
      });
      await prisma.agentStep.create({
        data: {
          runId,
          stepNumber: 1,
          kind: "context",
          status: "running",
          title: "Observe: 收集学习上下文",
          detail: "正在汇总学习统计、计划进度、待办任务和长期记忆。",
          startedAt,
        },
      });
    } else {
      run = await prisma.agentRun.create({
        data: {
          userId,
          mode,
          goal: agentRunGoal(mode),
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
            statsSummary: `连续打卡${context.stats.streak}天，共打卡${context.stats.totalCheckins}次`,
            plansCount: context.plans.length,
            pendingTasks: context.pendingTasks.length,
          }),
          startedAt: new Date(),
        },
      });
    }

    const { analysis, source: analysisSource, reason: analysisReason } =
      await analyze(context, memories, userId);

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
            // 落库后才回答得了「模型结构化输出成功率是多少」：
            //   SELECT output->>'source', COUNT(*) FROM agentstep
            //   WHERE kind='analysis' GROUP BY 1;
            source: analysisSource,
            ...(analysisReason ? { reason: analysisReason } : {}),
          }),
          detail: analysis.summary,
          completedAt: new Date(),
        },
      });
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
