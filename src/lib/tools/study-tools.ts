// ============================================================
// Day 7 学习要点：Tool Calling — 让 AI 操作项目已有功能
//
// ① tool()         — AI SDK v7 定义工具的工厂函数
// ② inputSchema    — Zod schema，LLM 据此生成调用参数
// ③ execute        — 实际执行，操作数据库（Prisma）
// ④ 工厂函数模式    — createStudyTools(userId) 闭包注入用户身份
//
// Day 10 优化：
// ⑤ safeExecute    — 抽取 try-catch 样板，减少重复代码
// ⑥ 共享类型       — 导入 Tool/Plan/Checkin 类型，替代 ad-hoc 对象
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { safeExecute } from "./utils";
import { getRelevantMemories } from "@/lib/memory";
import { generatePlanForPlan } from "@/lib/agent/service";
import { getStudyStatsData } from "@/lib/study-stats";
import type {
  PlanInfo,
  CheckinInfo,
  CreatePlanData,
  PlansListData,
  CheckinsListData,
} from "@/types";

/**
 * Day 7 核心：创建针对特定用户的学习助手工具集
 *
 * opts.conversation / opts.memories 是最近对话摘要和长期记忆正文，
 * 由调用方（聊天路由）传入，供 createPlan 后台生成个性化计划文档使用。
 */
export function createStudyTools(
  userId: string,
  opts?: { excludeCreatePlan?: boolean; conversation?: string; memories?: string }
) {
  // ============================================================
  // Tool 1: 创建学习计划
  //
  // 只收结构化小参数（name/goal/description），详细文档 + 每日任务
  // 由 generatePlanForPlan 单次生成（结构化输出 + fallback），
  // 避免在工具循环里传大 Markdown（贵 + 易截断）。阻塞等待，保证
  // 模型回复时计划已是完整状态。
  // ============================================================
  const createPlan = tool({
    description:
      "为用户创建一个新的学习计划。当用户请求制定学习计划、安排学习任务时使用。" +
      "只需传计划名称、具体目标和一两句说明；详细的阶段文档和每日任务由系统自动生成。",

    inputSchema: z.object({
      name: z.string().describe("计划名称，例如：'30天React学习计划'"),
      goal: z
        .string()
        .optional()
        .describe("具体明确的最终目标，如'2周内完成 React Router + 状态管理 + 3 个项目练习'"),
      description: z
        .string()
        .optional()
        .describe("一两句简要说明，可含每天可投入时间、想优先补的薄弱点"),
    }),

    execute: async ({ name, goal, description }) => {
      return safeExecute("createPlan", async (): Promise<CreatePlanData> => {
        console.log(`[createPlan] 用户 ${userId} 创建计划: ${name}`);

        const plan = await prisma.plan.create({
          data: {
            userId,
            name,
            description: description ?? null,
            goal: goal ?? null,
            document: null,
            status: "active",
          },
        });

        // 单次生成详细文档 + 任务（失败自动回落基础草案），保证计划创建即完整
        const { tasksCreated } = await generatePlanForPlan(plan.id, userId, {
          goal: goal ?? null,
          description: description ?? null,
          conversation: opts?.conversation,
          memories: opts?.memories,
        });

        console.log(`[createPlan] ✅ 计划创建成功: ${plan.id}（${tasksCreated} 个任务）`);
        return {
          success: true,
          message: `学习计划「${name}」创建成功，共 ${tasksCreated} 个任务`,
          plan: { id: plan.id, name: plan.name, goal: plan.goal },
        };
      });
    },
  });

  // ============================================================
  // Tool 2: 查询学习计划
  // ============================================================
  const getMyPlans = tool({
    description: "查询用户的所有学习计划及完成进度。用户询问计划、查看进度时用。",

    inputSchema: z.object({
      status: z.string().optional().describe("筛选：active/completed，不传查全部"),
    }),

    execute: async ({ status }) => {
      return safeExecute("getMyPlans", async (): Promise<PlansListData> => {
        console.log(`[getMyPlans] 查询用户 ${userId} 的计划`);

        const where: Record<string, unknown> = { userId };
        if (status) where.status = status;

        const plans = await prisma.plan.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          include: { tasks: { select: { status: true } } },
        });

        if (plans.length === 0) {
          return { success: true, count: 0, plans: [], message: "还没有学习计划" };
        }

        // 进度 = 完成任务数 / 总任务数（计划不再按时长计算）
        const plansWithProgress: PlanInfo[] = plans.map((plan) => {
          const total = plan.tasks.length;
          const done = plan.tasks.filter((t) => t.status === "done").length;
          const progress = total > 0 ? Math.round((done / total) * 100) : 0;
          return {
            id: plan.id,
            name: plan.name,
            goal: plan.goal,
            progress,
            status: plan.status,
          };
        });

        console.log(`[getMyPlans] ✅ 查询成功: ${plansWithProgress.length} 个计划`);
        return { success: true, count: plansWithProgress.length, plans: plansWithProgress };
      });
    },
  });

  // ============================================================
  // Tool 3: 查询近期打卡记录
  // ============================================================
  const getRecentCheckins = tool({
    description: "查询用户最近的打卡记录（内容、日期）。",

    inputSchema: z.object({
      days: z.number().optional().describe("最近多少天，默认 7，最大 30"),
    }),

    execute: async ({ days = 7 }) => {
      return safeExecute("getRecentCheckins", async (): Promise<CheckinsListData> => {
        const limit = Math.min(days ?? 7, 30);
        console.log(`[getRecentCheckins] 查询用户 ${userId} 最近 ${limit} 天`);

        const since = new Date();
        since.setDate(since.getDate() - limit);

        const checkins = await prisma.checkin.findMany({
          where: { userId, checkinDate: { gte: since } },
          orderBy: { checkinDate: "desc" },
          include: { plan: { select: { name: true } } },
        });

        if (checkins.length === 0) {
          return { success: true, count: 0, checkins: [] };
        }

        const checkinList: CheckinInfo[] = checkins.map((c) => ({
          content: c.content,
          planName: c.plan?.name ?? null,
          date: c.checkinDate.toISOString(),
        }));

        console.log(`[getRecentCheckins] ✅ ${checkinList.length} 条记录`);
        return {
          success: true,
          count: checkinList.length,
          checkins: checkinList,
        };
      });
    },
  });

  // ============================================================
  // Tool 4: 查询 AI 对用户的记忆
  // Day 13 新增：长期记忆工具
  // ============================================================
  const getMyMemories = tool({
    description:
      "查询 AI 对用户的长期记忆（偏好、目标等）。传 query 按语义搜索，不传返回最重要。",

    inputSchema: z.object({
      limit: z.number().optional().describe("返回条数，默认 10"),
      query: z.string().optional().describe("语义搜索关键词，如'React'"),
    }),

    execute: async ({ limit = 10, query }) => {
      return safeExecute("getMyMemories", async () => {
        console.log(`[getMyMemories] 查询用户 ${userId} 的记忆, query: ${query || "(无)"}`);
        const memories = await getRelevantMemories(userId, limit, query);

        if (memories.length === 0) {
          return {
            success: true,
            count: 0,
            memories: [],
            message: "我目前还没有关于你的长期记忆。多和我聊聊吧！",
          };
        }

        console.log(`[getMyMemories] ✅ 返回 ${memories.length} 条记忆`);
        return {
          success: true,
          count: memories.length,
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            category: m.type,
            createdAt: m.createdAt.toISOString(),
          })),
        };
      });
    },
  });

  // ============================================================
  // Tool 5: 综合学习统计
  // Day 14 新增：为 AI 制定个性化计划提供全面的数据基础
  // ============================================================
  const getStudyStats = tool({
    description:
      "获取用户学习统计（打卡天数、连续打卡、计划进度、任务完成）。制定计划/分析学情前先调用。",

    inputSchema: z.object({}),

    execute: async () => {
      return safeExecute("getStudyStats", async () => {
        const stats = await getStudyStatsData(userId);
        console.log(
          `[getStudyStats] ✅ 连续${stats.streak}天 | 打卡${stats.totalCheckins}次 | ${stats.activePlans.length}个计划`
        );
        return { success: true, stats };
      });
    },
  });

  return {
    // 在文档工作室编辑已有计划时，不提供 createPlan，避免 AI 既改当前计划又新建一个
    ...(opts?.excludeCreatePlan ? {} : { createPlan }),
    getMyPlans,
    getRecentCheckins,
    getMyMemories,
    getStudyStats,
  };
}
