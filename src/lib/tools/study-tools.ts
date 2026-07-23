// ============================================================
// Day 7 学习要点：Tool Calling — 让 AI 操作项目已有功能
//
// ① tool()         — AI SDK v7 定义工具的工厂函数
// ② inputSchema    — Zod schema，LLM 据此生成调用参数
// ③ execute        — 实际执行，操作数据库（Prisma）
// ④ 工厂函数模式    — createStudyTools(userId) 闭包注入用户身份
//
// 流程示例：
//   用户："帮我制定React学习计划"
//     ↓
//   LLM 判断 → 调用 createPlan({ name: "React学习", ... })
//     ↓
//   execute() → prisma.plan.create()
//     ↓
//   返回结果 → LLM 生成确认回复："已为你创建React学习计划 ✅"
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Day 7 核心：创建针对特定用户的学习助手工具集
 *
 * 为什么用工厂函数？
 * — tool 的 execute 中需要 userId 来操作数据库
 * — 工厂函数在 API Route 中调用，通过闭包注入当前登录用户
 * — 每个请求都会创建新的 tool 实例，用户之间不会串数据
 */
export function createStudyTools(userId: string) {
  // ============================================================
  // Tool 1: 创建学习计划
  // 示例触发："帮我制定一个React学习计划"
  // ============================================================
  const createPlan = tool({
    description:
      "为用户创建一个新的学习计划。当用户请求制定学习计划、安排学习任务时使用。" +
      "你需要从对话中提取计划名称、描述、目标和预计时长。",

    inputSchema: z.object({
      name: z.string().describe("计划名称，例如：'30天React学习计划'"),
      description: z
        .string()
        .optional()
        .describe("计划的详细描述，例如每天学什么"),
      goal: z.string().optional().describe("最终目标，例如：'掌握React核心概念'"),
      targetHours: z
        .number()
        .optional()
        .describe("目标总时长（小时），例如：60"),
    }),

    execute: async ({ name, description, goal, targetHours }) => {
      console.log(`[createPlan] 为用户 ${userId} 创建计划: ${name}`);

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

      return {
        success: true,
        message: `学习计划「${name}」创建成功`,
        plan: {
          id: plan.id,
          name: plan.name,
          goal: plan.goal,
          targetHours: plan.targetHours,
        },
      };
    },
  });

  // ============================================================
  // Tool 2: 查询学习计划
  // 示例触发："我有哪些学习计划？"
  // ============================================================
  const getMyPlans = tool({
    description:
      "查询用户的所有学习计划。当用户询问自己的学习计划、查看计划进度时使用。",

    inputSchema: z.object({
      status: z
        .string()
        .optional()
        .describe("筛选计划状态：'active'（进行中）、'completed'（已完成），不传则查全部"),
    }),

    execute: async ({ status }) => {
      console.log(`[getMyPlans] 查询用户 ${userId} 的计划`);

      const where: Record<string, unknown> = { userId };
      if (status) where.status = status;

      const plans = await prisma.plan.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: {
          checkins: {
            select: { hours: true },
          },
        },
      });

      if (plans.length === 0) {
        return {
          success: true,
          count: 0,
          message: "你还没有学习计划，需要我帮你创建一个吗？",
          plans: [],
        };
      }

      // 计算每个计划的完成进度
      const plansWithProgress = plans.map((plan) => {
        const completedHours = plan.checkins.reduce(
          (sum, c) => sum + c.hours,
          0
        );
        const progress =
          plan.targetHours > 0
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
          createdAt: plan.createdAt.toISOString(),
        };
      });

      return {
        success: true,
        count: plansWithProgress.length,
        plans: plansWithProgress,
      };
    },
  });

  // ============================================================
  // Tool 3: 查询近期打卡记录
  // 示例触发："我今天学完了吗？"、"最近学了什么？"
  // ============================================================
  const getRecentCheckins = tool({
    description:
      "查询用户最近的打卡记录。当用户询问今天/最近的学习情况、是否打卡时使用。" +
      "可以查询指定天数的记录，默认查询最近 7 天。",

    inputSchema: z.object({
      days: z
        .number()
        .optional()
        .describe("查询最近多少天的记录，默认 7 天，最大 30 天"),
    }),

    execute: async ({ days = 7 }) => {
      const limit = Math.min(days ?? 7, 30);
      console.log(`[getRecentCheckins] 查询用户 ${userId} 最近 ${limit} 天打卡`);

      const since = new Date();
      since.setDate(since.getDate() - limit);

      const checkins = await prisma.checkin.findMany({
        where: {
          userId,
          checkinDate: { gte: since },
        },
        orderBy: { checkinDate: "desc" },
        include: {
          plan: { select: { name: true } },
        },
      });

      if (checkins.length === 0) {
        return {
          success: true,
          count: 0,
          message: `最近 ${limit} 天还没有打卡记录，今天记得打卡哦 💪`,
          checkins: [],
        };
      }

      const totalHours = checkins.reduce((sum, c) => sum + c.hours, 0);
      const subjects = [
        ...new Set(checkins.map((c) => c.subject).filter(Boolean)),
      ];

      return {
        success: true,
        count: checkins.length,
        totalHours: Math.round(totalHours * 10) / 10,
        subjects,
        checkins: checkins.map((c) => ({
          id: c.id,
          content: c.content,
          hours: c.hours,
          subject: c.subject,
          mood: c.mood,
          planName: c.plan?.name ?? null,
          date: c.checkinDate.toISOString(),
        })),
      };
    },
  });

  // ============================================================
  // 返回工具集 — 传给 streamText({ tools: {...} })
  // ============================================================
  return {
    createPlan,
    getMyPlans,
    getRecentCheckins,
  };
}
