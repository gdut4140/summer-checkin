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
import type {
  PlanInfo,
  CheckinInfo,
  CreatePlanData,
  PlansListData,
  CheckinsListData,
} from "@/types";

/**
 * Day 7 核心：创建针对特定用户的学习助手工具集
 */
export function createStudyTools(userId: string) {
  // ============================================================
  // Tool 1: 创建学习计划
  // ============================================================
  const createPlan = tool({
    description:
      "为用户创建一个新的学习计划。当用户请求制定学习计划、安排学习任务时使用。" +
      "你需要从对话中提取计划名称、描述、目标和预计时长。",

    inputSchema: z.object({
      name: z.string().describe("计划名称，例如：'30天React学习计划'"),
      description: z.string().optional().describe("计划的详细描述"),
      goal: z.string().optional().describe("最终目标"),
      targetHours: z.number().optional().describe("目标总时长（小时）"),
    }),

    execute: async ({ name, description, goal, targetHours }) => {
      return safeExecute("createPlan", async (): Promise<CreatePlanData> => {
        console.log(`[createPlan] 用户 ${userId} 创建计划: ${name}`);

        const plan = await prisma.plan.create({
          data: {
            userId,
            name,
            description: description ?? null,
            goal: goal ?? null,
            targetHours: targetHours ?? 0,
            status: "active",
          },
        });

        console.log(`[createPlan] ✅ 计划创建成功: ${plan.id}`);
        return {
          success: true,
          message: `学习计划「${name}」创建成功`,
          plan: { id: plan.id, name: plan.name, goal: plan.goal, targetHours: plan.targetHours },
        };
      });
    },
  });

  // ============================================================
  // Tool 2: 查询学习计划
  // ============================================================
  const getMyPlans = tool({
    description:
      "查询用户的所有学习计划。当用户询问自己的学习计划、查看计划进度时使用。",

    inputSchema: z.object({
      status: z.string().optional().describe("筛选：'active'、'completed'，不传查全部"),
    }),

    execute: async ({ status }) => {
      return safeExecute("getMyPlans", async (): Promise<PlansListData> => {
        console.log(`[getMyPlans] 查询用户 ${userId} 的计划`);

        const where: Record<string, unknown> = { userId };
        if (status) where.status = status;

        const plans = await prisma.plan.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          include: { checkins: { select: { hours: true } } },
        });

        if (plans.length === 0) {
          return { success: true, count: 0, plans: [], message: "还没有学习计划" };
        }

        const plansWithProgress: PlanInfo[] = plans.map((plan) => {
          const completedHours = plan.checkins.reduce((sum, c) => sum + c.hours, 0);
          const progress = plan.targetHours > 0
            ? Math.round((completedHours / plan.targetHours) * 100)
            : 0;
          return {
            id: plan.id,
            name: plan.name,
            goal: plan.goal,
            targetHours: plan.targetHours,
            completedHours: Math.round(completedHours * 10) / 10,
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
    description:
      "查询用户最近的打卡记录。当用户询问今天/最近的学习情况、是否打卡时使用。",

    inputSchema: z.object({
      days: z.number().optional().describe("查询最近多少天，默认 7，最大 30"),
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
          return { success: true, count: 0, checkins: [], totalHours: 0 };
        }

        const totalHours = checkins.reduce((sum, c) => sum + c.hours, 0);
        const subjects = [...new Set(checkins.map((c) => c.subject).filter((s): s is string => s !== null))];

        const checkinList: CheckinInfo[] = checkins.map((c) => ({
          content: c.content,
          hours: c.hours,
          subject: c.subject,
          mood: c.mood,
          planName: c.plan?.name ?? null,
          date: c.checkinDate.toISOString(),
        }));

        console.log(`[getRecentCheckins] ✅ ${checkinList.length} 条记录, ${totalHours}h`);
        return {
          success: true,
          count: checkinList.length,
          totalHours: Math.round(totalHours * 10) / 10,
          subjects,
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
      "查询 AI 对用户的长期记忆（偏好、目标、技能等）。" +
      "当用户问'你记得我什么？''对我了解多少？'或引用之前对话中提到过的个人信息时使用。",

    inputSchema: z.object({
      limit: z.number().optional().describe("返回几条记忆，默认 10"),
    }),

    execute: async ({ limit = 10 }) => {
      return safeExecute("getMyMemories", async () => {
        console.log(`[getMyMemories] 查询用户 ${userId} 的记忆`);
        const memories = await getRelevantMemories(userId, limit);

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
            category: m.category,
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
      "获取用户的综合学习统计数据，包括总时长、日均学习量、科目分布、计划完成率、" +
      "连续打卡天数等。当需要为用户制定学习计划、分析学习情况时必须先调用此工具获取数据基础。",

    inputSchema: z.object({}),

    execute: async () => {
      return safeExecute("getStudyStats", async () => {
        console.log(`[getStudyStats] 统计用户 ${userId} 的学习数据`);

        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);

        // 并行查询
        const [
          allCheckins,
          activePlans,
          todayCheckins,
        ] = await Promise.all([
          prisma.checkin.findMany({
            where: { userId },
            orderBy: { checkinDate: "desc" },
          }),
          prisma.plan.findMany({
            where: { userId, status: "active" },
            include: { checkins: { select: { hours: true } } },
          }),
          prisma.checkin.findMany({
            where: {
              userId,
              checkinDate: { gte: todayStart },
            },
          }),
        ]);

        // 总时长
        const totalHours = allCheckins.reduce((sum, c) => sum + c.hours, 0);
        const totalDays = allCheckins.length > 0
          ? Math.ceil(
              (allCheckins[0].checkinDate.getTime() -
                allCheckins[allCheckins.length - 1].checkinDate.getTime()) /
                (1000 * 60 * 60 * 24)
            ) + 1
          : 0;
        const dailyAvg = totalDays > 0
          ? Math.round((totalHours / totalDays) * 10) / 10
          : 0;

        // 本周时长
        const weekHours = allCheckins
          .filter((c) => c.checkinDate >= weekStart)
          .reduce((sum, c) => sum + c.hours, 0);

        // 今日
        const todayHours = todayCheckins.reduce((sum, c) => sum + c.hours, 0);
        const todayCount = todayCheckins.length;

        // 科目分布
        const subjectMap = new Map<string, number>();
        allCheckins.forEach((c) => {
          const s = c.subject || "未分类";
          subjectMap.set(s, (subjectMap.get(s) || 0) + c.hours);
        });
        const topSubjects = [...subjectMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([subject, hours]) => ({ subject, hours: Math.round(hours * 10) / 10 }));

        // 连续打卡天数
        let streak = 0;
        const checkDates = new Set(
          allCheckins.map((c) => c.checkinDate.toISOString().slice(0, 10))
        );
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 从今天往回数
        for (let i = 0; i < 365; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          if (checkDates.has(key)) {
            streak++;
          } else if (i > 0) {
            // 今天还没打卡不算断
            break;
          }
        }

        // 计划完成情况
        const plansSummary = activePlans.map((plan) => {
          const completed = plan.checkins.reduce((sum, c) => sum + c.hours, 0);
          const progress = plan.targetHours > 0
            ? Math.round((completed / plan.targetHours) * 100)
            : 0;
          return {
            name: plan.name,
            targetHours: plan.targetHours,
            completedHours: Math.round(completed * 10) / 10,
            progress,
          };
        });

        // 近期心情趋势
        const recentMoods = allCheckins
          .slice(0, 14)
          .map((c) => c.mood)
          .filter((m): m is string => m !== null);
        const moodCounts: Record<string, number> = {};
        recentMoods.forEach((m) => {
          moodCounts[m] = (moodCounts[m] || 0) + 1;
        });

        console.log(
          `[getStudyStats] ✅ 总${totalHours}h | 日均${dailyAvg}h | 连续${streak}天 | ${activePlans.length}个计划`
        );

        return {
          success: true,
          stats: {
            totalHours: Math.round(totalHours * 10) / 10,
            totalCheckins: allCheckins.length,
            dailyAvg,
            weekHours: Math.round(weekHours * 10) / 10,
            todayHours: Math.round(todayHours * 10) / 10,
            todayCount,
            streak,
            topSubjects,
            activePlans: plansSummary,
            recentMoods: moodCounts,
          },
        };
      });
    },
  });

  return {
    createPlan,
    getMyPlans,
    getRecentCheckins,
    getMyMemories,
    getStudyStats,
  };
}
