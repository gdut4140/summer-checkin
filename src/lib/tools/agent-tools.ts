// ============================================================
// Day 22-25 Agent Workflow: 任务拆分 + 进度追踪 + 每日检查
//
// 核心概念（面试要点）：
// Agent 循环 = Plan → Execute → Observe → Replan
// AI SDK 的 maxSteps + Tool Calling 本质就是 Agent 循环：
//   LLM 判断 → 调用工具 → 观察结果 → 再判断 → 生成回答
//   和 LangGraph 理念相同，但更轻量，适合 TypeScript 全栈项目
//
// 工具清单：
// ① breakdownPlanTasks  — 将计划拆分为每日/每周具体任务（Agent 规划阶段）
// ② getPlanTasks        — 查询计划的所有任务及统计（Agent 观察阶段）
// ③ updateTaskStatus    — 更新任务状态（Agent 执行阶段）
// ④ getTodayTasks       — 获取今日应完成任务（每日检查 Agent）
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { safeExecute } from "./utils";
import type {
  PlanTaskInfo,
  TaskStatus,
  PlanTasksListData,
  TodayTasksData,
  BreakdownTasksResult,
} from "@/types";

/** PlanTask 数据库查询结果的原始类型 */
interface RawPlanTask {
  id: string;
  planId: string;
  title: string;
  description: string | null;
  dayNumber: number | null;
  weekNumber: number | null;
  category: string;
  status: string;
  priority: string;
  completedAt: Date | null;
  createdAt: Date;
}

/**
 * 将数据库 PlanTask 转为 PlanTaskInfo
 */
function formatTask(t: RawPlanTask): PlanTaskInfo {
  return {
    id: t.id,
    planId: t.planId,
    title: t.title,
    description: t.description ?? null,
    dayNumber: t.dayNumber ?? null,
    weekNumber: t.weekNumber ?? null,
    category: (t.category as PlanTaskInfo["category"]) ?? "study",
    status: (t.status as TaskStatus) ?? "pending",
    priority: (t.priority as PlanTaskInfo["priority"]) ?? "normal",
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * Day 22-23: 创建 Agent Workflow 工具集
 */
export function createAgentTools(userId: string) {
  // ============================================================
  // Tool 6: 拆分计划为任务
  //
  // Agent 工作流第 1 步：规划 (Plan)
  // AI 分析计划目标，将其拆分为结构化的每日/每周任务
  // 一次调用批量创建所有任务，避免多次 DB 写入
  // ============================================================
  const breakdownPlanTasks = tool({
    description:
      "把学习计划拆分为平铺的具体可执行任务。拆分前先通过 getMyPlans 拿到 planId。" +
      "任务要具体、可量化、有完成标准；不要按周/天分组。",

    inputSchema: z.object({
      planId: z.string().describe("计划ID"),
      tasks: z
        .array(
          z.object({
            title: z.string().describe("任务标题，简洁明确"),
            description: z.string().optional().describe("任务详情：内容、资源、完成标准"),
            category: z
              .enum(["study", "project", "review", "exercise"])
              .optional()
              .describe("study=学新/project=项目/review=复习/exercise=练习"),
            priority: z
              .enum(["high", "normal", "low"])
              .optional()
              .describe("high=核心/normal=常规/low=选做"),
          })
        )
        .describe("按计划目标拆分的平铺任务列表"),
    }),

    execute: async ({ planId, tasks }) => {
      return safeExecute("breakdownPlanTasks", async (): Promise<BreakdownTasksResult> => {
        console.log(
          `[breakdownPlanTasks] 为计划 ${planId} 创建 ${tasks.length} 个任务`
        );

        // 验证计划存在且属于当前用户
        const plan = await prisma.plan.findFirst({
          where: { id: planId, userId },
        });
        if (!plan) {
          throw new Error(`计划不存在: ${planId}`);
        }

        // 幂等创建：createPlan 已自动拆分过的任务（按归一化标题匹配）不再重复创建，
        // 避免 AI 在 createPlan 后仍调用 breakdownPlanTasks 造成任务重复。
        const existing = await prisma.planTask.findMany({
          where: { planId },
          select: { title: true },
        });
        const existingTitles = new Set(
          existing.map((t) => t.title.trim().toLowerCase().replace(/\s+/g, " "))
        );

        // 批量创建任务（跳过已存在的同名任务）
        const created = await Promise.all(
          tasks
            .filter(
              (t) =>
                !existingTitles.has(t.title.trim().toLowerCase().replace(/\s+/g, " "))
            )
            .map((t) =>
              prisma.planTask.create({
                data: {
                  planId,
                  userId,
                  title: t.title,
                  description: t.description ?? null,
                  category: t.category ?? "study",
                  priority: t.priority ?? "normal",
                },
              })
            )
        );

        console.log(`[breakdownPlanTasks] ✅ 创建了 ${created.length} 个任务（去重后）`);

        return {
          success: true,
          planId,
          planName: plan.name,
          tasksCreated: created.length,
          message: `已为「${plan.name}」创建 ${created.length} 个任务`,
          tasks: created.map(formatTask),
        };
      });
    },
  });

  // ============================================================
  // Tool 7: 查询计划任务
  //
  // Agent 工作流第 2 步：观察 (Observe)
  // 查看计划的任务列表和进度统计，判断是否需要调整
  // ============================================================
  const getPlanTasks = tool({
    description: "查询计划的任务列表和进度统计（总数/已完成/进行中/待开始）。",

    inputSchema: z.object({
      planId: z.string().describe("计划ID"),
      status: z
        .enum(["pending", "in_progress", "done", "skipped"])
        .optional()
        .describe("按状态筛选，不传查全部"),
    }),

    execute: async ({ planId, status }) => {
      return safeExecute("getPlanTasks", async (): Promise<PlanTasksListData> => {
        console.log(`[getPlanTasks] 查询计划 ${planId} 的任务`);

        const plan = await prisma.plan.findFirst({
          where: { id: planId, userId },
        });
        if (!plan) {
          throw new Error(`计划不存在: ${planId}`);
        }

        const where: Record<string, unknown> = { planId, userId };
        if (status) where.status = status;

        const tasks = await prisma.planTask.findMany({
          where,
          orderBy: [{ dayNumber: "asc" }, { weekNumber: "asc" }],
        });

        const stats = {
          total: tasks.length,
          done: tasks.filter((t) => t.status === "done").length,
          inProgress: tasks.filter((t) => t.status === "in_progress").length,
          pending: tasks.filter((t) => t.status === "pending").length,
          skipped: tasks.filter((t) => t.status === "skipped").length,
          progress:
            tasks.length > 0
              ? Math.round(
                  (tasks.filter((t) => t.status === "done").length /
                    tasks.length) *
                    100
                )
              : 0,
        };

        console.log(
          `[getPlanTasks] ✅ ${tasks.length} 个任务 | 进度 ${stats.progress}%`
        );

        return {
          success: true,
          planId,
          planName: plan.name,
          tasks: tasks.map(formatTask),
          stats,
        };
      });
    },
  });

  // ============================================================
  // Tool 8: 更新任务状态
  //
  // Agent 工作流第 3 步：执行 (Execute)
  // 标记任务为完成/进行中/跳过，驱动进度推进
  // ============================================================
  const updateTaskStatus = tool({
    description:
      "更新任务状态（pending/in_progress/done/skipped）。用户说完成/跳过/开始某任务时用；" +
      "done 时自动打卡并可用 hours 记录学习时长。",

    inputSchema: z.object({
      taskId: z.string().describe("任务ID"),
      status: z
        .enum(["pending", "in_progress", "done", "skipped"])
        .describe("新状态"),
      hours: z.number().optional().describe("学习时长（小时），仅 status=done 时用"),
    }),

    execute: async ({ taskId, status, hours }) => {
      return safeExecute("updateTaskStatus", async () => {
        console.log(`[updateTaskStatus] 任务 ${taskId} → ${status}${hours ? ` (${hours}h)` : ""}`);

        // 验证任务属于当前用户
        const existing = await prisma.planTask.findFirst({
          where: { id: taskId, userId },
        });
        if (!existing) {
          throw new Error(`任务不存在: ${taskId}`);
        }

        const updateData: Record<string, unknown> = { status };
        if (status === "done") {
          updateData.completedAt = new Date();
        } else if (status === "pending") {
          updateData.completedAt = null; // 重置完成时间
        }

        const updated = await prisma.planTask.update({
          where: { id: taskId },
          data: updateData,
        });

        // Day 24: 与打卡系统联动 — 完成任务时自动创建打卡记录
        let checkinCreated = false;
        if (status === "done") {
          try {
            const existingTaskCheckin = await prisma.checkin.findFirst({
              where: { sourceTaskId: existing.id },
            });
            if (existingTaskCheckin) {
              await prisma.checkin.update({
                where: { id: existingTaskCheckin.id },
                data: {
                  content: hours
                    ? `完成任务：${existing.title}（${hours}小时）`
                    : `完成任务：${existing.title}`,
                  hours: hours ?? 0,
                  subject: existing.category,
                  checkinDate: new Date(),
                },
              });
            } else {
              await prisma.checkin.create({
                data: {
                  userId,
                  sourceTaskId: existing.id,
                  planId: existing.planId,
                  content: hours
                    ? `完成任务：${existing.title}（${hours}小时）`
                    : `完成任务：${existing.title}`,
                  hours: hours ?? 0,
                  subject: existing.category,
                  checkinDate: new Date(),
                },
              });
            }
            checkinCreated = true;
            console.log(`[updateTaskStatus] ✅ 自动创建打卡记录`);
          } catch (err) {
            // 打卡失败不阻塞任务状态更新
            console.warn("[updateTaskStatus] 打卡记录创建失败:", err);
          }
        }

        // 自动统计计划整体进度
        const allTasks = await prisma.planTask.findMany({
          where: { planId: existing.planId },
        });
        const doneCount = allTasks.filter((t) => t.status === "done").length;
        const totalProgress =
          allTasks.length > 0
            ? Math.round((doneCount / allTasks.length) * 100)
            : 0;

        const statusLabel: Record<string, string> = {
          pending: "待开始",
          in_progress: "进行中",
          done: "已完成",
          skipped: "已跳过",
        };

        console.log(
          `[updateTaskStatus] ✅ "${existing.title}" → ${statusLabel[status]} | 计划总进度 ${totalProgress}%`
        );

        const result: Record<string, unknown> = {
          success: true,
          task: formatTask(updated),
          planProgress: totalProgress,
          message: `任务「${existing.title}」已标记为「${statusLabel[status]}」，当前计划进度 ${totalProgress}%`,
        };
        if (checkinCreated) {
          result.checkinCreated = true;
          result.checkinHours = hours ?? 0;
        }
        return result;
      });
    },
  });

  // ============================================================
  // Tool 9: 获取今日任务
  //
  // Agent 工作流第 4 步：每日检查 (Daily Check-in)
  // 查询今日应该完成的任务，帮助用户聚焦当日目标
  // ============================================================
  const getTodayTasks = tool({
    description: "获取用户今日应完成的任务清单。用户问'今天学什么''今日任务'时用。",

    inputSchema: z.object({}),

    execute: async () => {
      return safeExecute("getTodayTasks", async (): Promise<TodayTasksData> => {
        console.log(`[getTodayTasks] 查询用户 ${userId} 的今日任务`);

        // 获取所有活跃计划
        const activePlans = await prisma.plan.findMany({
          where: { userId, status: "active" },
          select: { id: true, name: true },
        });

        if (activePlans.length === 0) {
          return {
            success: true,
            tasks: [],
            activePlans: [],
          };
        }

        const planIds = activePlans.map((p) => p.id);

        // 获取所有活跃计划中未完成的任务（pending + in_progress）
        const tasks = await prisma.planTask.findMany({
          where: {
            planId: { in: planIds },
            status: { in: ["pending", "in_progress"] },
          },
          orderBy: [{ dayNumber: "asc" }, { priority: "desc" }],
        });

        const result: TodayTasksData = {
          success: true,
          tasks: tasks.map(formatTask),
          activePlans: activePlans.map((p) => ({
            planId: p.id,
            planName: p.name,
            taskCount: tasks.filter((t) => t.planId === p.id).length,
          })),
        };

        console.log(
          `[getTodayTasks] ✅ ${tasks.length} 个待完成任务 (${activePlans.length} 个活跃计划)`
        );

        return result;
      });
    },
  });

  return {
    breakdownPlanTasks,
    getPlanTasks,
    updateTaskStatus,
    getTodayTasks,
  };
}
