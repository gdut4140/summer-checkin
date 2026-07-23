// ============================================================
// Day 7 学习要点：Tool Calling — 让 AI 操作项目已有功能
//
// ① tool()         — AI SDK v7 定义工具的工厂函数
// ② inputSchema    — Zod schema，LLM 据此生成调用参数
// ③ execute        — 实际执行，操作数据库（Prisma）
// ④ 工厂函数模式    — createStudyTools(userId) 闭包注入用户身份
//
// ⚠️ 关键容错：
//   所有 execute 必须 try-catch，tool 抛异常 → LLM 无法继续 → text 为空 → onEnd 不保存
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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
      console.log(`[createPlan] 用户 ${userId} 创建计划: ${name}`);

      // ⚠️ 不能抛异常！必须 catch 后返回 { success: false, error }
      try {
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
      } catch (error) {
        console.error(`[createPlan] ❌ 创建失败:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "数据库写入失败，请稍后重试",
        };
      }
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
      console.log(`[getMyPlans] 查询用户 ${userId} 的计划`);

      try {
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

        const plansWithProgress = plans.map((plan) => {
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
      } catch (error) {
        console.error(`[getMyPlans] ❌ 查询失败:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "数据库查询失败",
        };
      }
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
      const limit = Math.min(days ?? 7, 30);
      console.log(`[getRecentCheckins] 查询用户 ${userId} 最近 ${limit} 天`);

      try {
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
        const subjects = [...new Set(checkins.map((c) => c.subject).filter(Boolean))];

        console.log(`[getRecentCheckins] ✅ ${checkins.length} 条记录, ${totalHours}h`);
        return {
          success: true,
          count: checkins.length,
          totalHours: Math.round(totalHours * 10) / 10,
          subjects,
          checkins: checkins.map((c) => ({
            content: c.content,
            hours: c.hours,
            subject: c.subject,
            mood: c.mood,
            planName: c.plan?.name ?? null,
            date: c.checkinDate.toISOString(),
          })),
        };
      } catch (error) {
        console.error(`[getRecentCheckins] ❌ 查询失败:`, error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "数据库查询失败",
        };
      }
    },
  });

  return { createPlan, getMyPlans, getRecentCheckins };
}
