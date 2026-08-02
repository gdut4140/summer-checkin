// ============================================================
// Phase 1: Coach Tools — Agent 自主学习循环的分析与执行工具
//
// 新增工具：
// ① analyzeStudyPattern  — 分析学习模式，识别弱项/强项/趋势
// ② adjustLearningPlan   — 调整计划（修改任务优先级、添加补救任务）
//
// 设计理念：
// 这些工具是 Agent Runtime 的"手"——Agent 通过它们执行分析结果。
// 与 study-tools（偏 CRUD）和 agent-tools（偏任务拆分）不同，
// coach-tools 侧重「洞察」和「干预」。
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { safeExecute } from "./utils";

// ---- 类型 ----

export interface StudyPattern {
  weakSubjects: string[];
  strongSubjects: string[];
  trend: "improving" | "stable" | "declining" | "insufficient_data";
  streakDays: number;
  avgDailyHours: number;
  completionRate: number; // 0-1
  totalUnfinishedTasks: number;
  suggestion: string;
}

export interface SubjectDetail {
  subject: string;
  totalHours: number;
  recentHours: number; // 近7天
  trend: "up" | "stable" | "down";
  taskCompletionRate: number;
}

// ---- Coach Tools 工厂函数 ----

export function createCoachTools(userId: string) {
  // ============================================================
  // Tool 10: 分析学习模式
  //
  // Agent Runtime Step 2 (Analyze) 的核心工具。
  // 不是简单的数据查询，而是对学习数据进行「洞察」：
  // - 哪些科目是弱项（投入不足/完成率低）
  // - 哪些是强项（投入多/完成率高）
  // - 整体趋势（上升/稳定/下滑）
  // - 给出可执行的改进建议
  // ============================================================
  const analyzeStudyPattern = tool({
    description:
      "深度分析用户的学习模式。输入用户ID，返回弱项科目、强项科目、学习趋势、" +
      "任务完成率和改进建议。这个工具不只是查数据，而是对数据做「诊断」。" +
      "Agent 在做学习分析时必须优先调用此工具。",

    inputSchema: z.object({
      days: z
        .number()
        .optional()
        .describe("分析最近多少天的数据，默认 30 天"),
    }),

    execute: async ({ days = 30 }) => {
      return safeExecute(
        "analyzeStudyPattern",
        async (): Promise<{ success: true; pattern: StudyPattern; details: SubjectDetail[] }> => {
          const now = new Date();
          const startDate = new Date(now);
          startDate.setDate(startDate.getDate() - days);
          const weekStart = new Date(now);
          weekStart.setDate(weekStart.getDate() - 7);

          console.log(
            `[analyzeStudyPattern] 分析用户 ${userId}，范围：最近 ${days} 天`
          );

          // 并行查询：打卡记录 + 任务 + 计划 + 记忆
          const [checkins, tasks, activePlans, memories] = await Promise.all([
            prisma.checkin.findMany({
              where: { userId, checkinDate: { gte: startDate } },
              orderBy: { checkinDate: "desc" },
            }),
            prisma.planTask.findMany({
              where: { userId, createdAt: { gte: startDate } },
            }),
            prisma.plan.findMany({
              where: { userId, status: "active" },
              select: { id: true, name: true, goal: true },
            }),
            prisma.userMemory.findMany({
              where: { userId, category: "goal" },
              select: { content: true },
            }),
          ]);

          // ---- 1. 科目分析 ----
          const subjectMap = new Map<string, { total: number; recent: number; done: number; totalTasks: number }>();

          for (const c of checkins) {
            const subject = c.subject || "未分类";
            const entry = subjectMap.get(subject) || { total: 0, recent: 0, done: 0, totalTasks: 0 };
            entry.total += c.hours;
            if (c.checkinDate >= weekStart) entry.recent += c.hours;
            subjectMap.set(subject, entry);
          }

          // 合并任务数据
          for (const t of tasks) {
            // 用任务 category 作为科目
            const subject = t.category;
            const entry = subjectMap.get(subject) || { total: 0, recent: 0, done: 0, totalTasks: 0 };
            entry.totalTasks += 1;
            if (t.status === "done") entry.done += 1;
            subjectMap.set(subject, entry);
          }

          // 构建科目详情
          const details: SubjectDetail[] = [];
          for (const [subject, data] of subjectMap) {
            // 判断趋势：比较近期占比和总体占比
            const totalHoursAll = [...subjectMap.values()].reduce((s, v) => s + v.total, 0);
            const recentHoursAll = [...subjectMap.values()].reduce((s, v) => s + v.recent, 0);

            const totalShare = totalHoursAll > 0 ? data.total / totalHoursAll : 0;
            const recentShare = recentHoursAll > 0 ? data.recent / recentHoursAll : 0;

            const trend: SubjectDetail["trend"] =
              totalHoursAll === 0 || recentHoursAll === 0
                ? "stable"
                : recentShare > totalShare * 1.3
                  ? "up"
                  : recentShare < totalShare * 0.7
                    ? "down"
                    : "stable";

            details.push({
              subject,
              totalHours: Math.round(data.total * 10) / 10,
              recentHours: Math.round(data.recent * 10) / 10,
              trend,
              taskCompletionRate:
                data.totalTasks > 0
                  ? Math.round((data.done / data.totalTasks) * 100)
                  : 100, // 无任务 = 不适用，默认 100
            });
          }

          details.sort((a, b) => b.totalHours - a.totalHours);

          // ---- 2. 识别强弱项 ----
          // 弱项：投入时间少 或 完成率低 或 趋势下降
          const weakSubjects = details
            .filter(
              (d) =>
                d.trend === "down" ||
                d.taskCompletionRate < 50 ||
                (d.totalHours < 1 && d.subject !== "未分类")
            )
            .map((d) => d.subject);

          // 强项：投入时间多 且 完成率高 且 趋势不下降
          const strongSubjects = details
            .filter(
              (d) =>
                d.totalHours >= 2 &&
                d.taskCompletionRate >= 70 &&
                d.trend !== "down"
            )
            .map((d) => d.subject);

          // ---- 3. 整体趋势判断 ----
          const recentCheckins = checkins.filter((c) => c.checkinDate >= weekStart);
          const olderCheckins = checkins.filter(
            (c) => c.checkinDate < weekStart && c.checkinDate >= new Date(startDate.getTime() - 14 * 86400000)
          );

          const recentDailyAvg =
            recentCheckins.length > 0
              ? recentCheckins.reduce((s, c) => s + c.hours, 0) / 7
              : 0;
          const olderDailyAvg =
            olderCheckins.length > 0
              ? olderCheckins.reduce((s, c) => s + c.hours, 0) /
                Math.max(1, Math.ceil((now.getTime() - weekStart.getTime() - 7 * 86400000) / 86400000))
              : 0;

          let trend: StudyPattern["trend"];
          if (checkins.length < 3) {
            trend = "insufficient_data";
          } else if (olderDailyAvg === 0) {
            trend = recentDailyAvg > 0 ? "improving" : "insufficient_data";
          } else {
            const ratio = recentDailyAvg / olderDailyAvg;
            trend = ratio > 1.2 ? "improving" : ratio < 0.7 ? "declining" : "stable";
          }

          // ---- 4. 连续打卡 ----
          const checkDates = new Set(
            checkins.map((c) => c.checkinDate.toISOString().slice(0, 10))
          );
          let streakDays = 0;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          for (let i = 0; i < 365; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            if (checkDates.has(d.toISOString().slice(0, 10))) {
              streakDays++;
            } else if (i > 0) break; // 今天没打不算断
          }

          // ---- 5. 统计汇总 ----
          const totalHours = checkins.reduce((s, c) => s + c.hours, 0);
          const avgDailyHours = days > 0 ? Math.round((totalHours / days) * 100) / 100 : 0;
          const doneTasks = tasks.filter((t) => t.status === "done").length;
          const completionRate = tasks.length > 0 ? doneTasks / tasks.length : 0;
          const unfinishedTasks = await prisma.planTask.count({
            where: { userId, status: { in: ["pending", "in_progress"] } },
          });

          // ---- 6. 生成建议 ----
          const goalContents = memories.map((m) => m.content);
          const suggestion = buildSuggestion({
            trend,
            weakSubjects,
            strongSubjects,
            completionRate,
            unfinishedTasks,
            avgDailyHours,
            goals: goalContents,
            activePlanNames: activePlans.map((p) => p.name),
          });

          const pattern: StudyPattern = {
            weakSubjects,
            strongSubjects,
            trend,
            streakDays,
            avgDailyHours: Math.round(avgDailyHours * 100) / 100,
            completionRate: Math.round(completionRate * 100) / 100,
            totalUnfinishedTasks: unfinishedTasks,
            suggestion,
          };

          console.log(
            `[analyzeStudyPattern] ✅ 趋势:${trend} | 弱项:${weakSubjects.join(",") || "无"} | 强项:${strongSubjects.join(",") || "无"}`
          );

          return { success: true, pattern, details };
        }
      );
    },
  });

  // ============================================================
  // Tool 11: 调整学习计划
  //
  // Agent Runtime Step 4 (Execute) 的工具。
  // 根据分析结果调整计划：修改任务优先级、添加补救任务。
  // 这是 Agent "主动干预"的核心体现。
  // ============================================================
  const adjustLearningPlan = tool({
    description:
      "根据学习分析结果调整学习计划。可以修改现有任务的优先级、添加新的补救任务。" +
      "Agent 在发现用户学习偏差或拖延时，应使用此工具主动调整计划。" +
      "使用前必须先调用 analyzeStudyPattern 获取分析结果。",

    inputSchema: z.object({
      planId: z.string().describe("要调整的计划ID"),
      reason: z.string().describe("调整原因，如'算法连续3天未完成，需要增加练习'"),
      adjustments: z.object({
        // 修改任务优先级
        reprioritize: z
          .array(
            z.object({
              taskId: z.string(),
              newPriority: z.enum(["high", "normal", "low"]),
            })
          )
          .optional()
          .describe("要修改优先级的任务列表"),
        // 添加补救任务
        addTasks: z
          .array(
            z.object({
              title: z.string().describe("任务标题"),
              description: z.string().optional().describe("任务详细描述"),
              category: z
                .enum(["study", "project", "review", "exercise"])
                .default("study"),
              priority: z
                .enum(["high", "normal", "low"])
                .default("high"),
            })
          )
          .optional()
          .describe("要新增的补救任务"),
      }),
    }),

    execute: async ({ planId, reason, adjustments }) => {
      return safeExecute("adjustLearningPlan", async () => {
        console.log(
          `[adjustLearningPlan] 调整计划 ${planId}: ${reason}`
        );

        // 验证计划存在且属于当前用户
        const plan = await prisma.plan.findFirst({
          where: { id: planId, userId },
        });
        if (!plan) throw new Error(`计划不存在: ${planId}`);

        const results: string[] = [];

        // 修改优先级
        if (adjustments.reprioritize?.length) {
          for (const item of adjustments.reprioritize) {
            const task = await prisma.planTask.findFirst({
              where: { id: item.taskId, userId, planId },
            });
            if (!task) {
              console.warn(`[adjustLearningPlan] 任务不存在: ${item.taskId}`);
              continue;
            }
            await prisma.planTask.update({
              where: { id: item.taskId },
              data: { priority: item.newPriority },
            });
            results.push(`任务「${task.title}」优先级 → ${item.newPriority}`);
          }
        }

        // 添加补救任务
        if (adjustments.addTasks?.length) {
          for (const task of adjustments.addTasks) {
            const created = await prisma.planTask.create({
              data: {
                planId,
                userId,
                title: task.title,
                description: task.description ?? null,
                category: task.category,
                priority: task.priority,
              },
            });
            results.push(`新增任务「${created.title}」`);
          }
        }

        const message =
          results.length > 0
            ? `已为「${plan.name}」执行 ${results.length} 项调整：${results.join("；")}`
            : `未执行任何调整（无有效操作）`;

        console.log(`[adjustLearningPlan] ✅ ${message}`);

        return {
          success: true,
          planId,
          planName: plan.name,
          reason,
          changes: results,
          message,
        };
      });
    },
  });

  return {
    analyzeStudyPattern,
    adjustLearningPlan,
  };
}

// ---- 建议生成（纯函数，不依赖数据库） ----

interface SuggestionInput {
  trend: StudyPattern["trend"];
  weakSubjects: string[];
  strongSubjects: string[];
  completionRate: number;
  unfinishedTasks: number;
  avgDailyHours: number;
  goals: string[];
  activePlanNames: string[];
}

function buildSuggestion(input: SuggestionInput): string {
  const parts: string[] = [];

  // 趋势判断
  if (input.trend === "declining") {
    parts.push("⚠️ 近期学习时长明显下降，建议检查是否存在疲劳或时间分配问题");
  } else if (input.trend === "improving") {
    parts.push("✅ 学习势头良好，近期投入持续增长，保持节奏");
  } else if (input.trend === "insufficient_data") {
    parts.push("📊 数据还不足，建议先坚持打卡一周以建立基准");
  }

  // 弱项关注
  if (input.weakSubjects.length > 0) {
    parts.push(`🎯 薄弱环节：${input.weakSubjects.join("、")}，建议本周重点加强`);
  }

  // 任务积压
  if (input.unfinishedTasks > 5) {
    parts.push(`📋 还有 ${input.unfinishedTasks} 个任务未完成，建议清理或重新规划优先级`);
  }

  // 完成率
  if (input.completionRate < 0.3 && input.unfinishedTasks > 0) {
    parts.push("🔴 任务完成率偏低，可能是计划设置过重或任务不够具体");
  }

  // 如果一切良好
  if (parts.length === 0) {
    parts.push("👍 学习状态良好，各项指标正常，继续保持！");
  }

  return parts.join("。\n");
}
