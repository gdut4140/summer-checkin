// ============================================================
// Phase 3: Daily Agent Cron — 完整调度系统
//
// 升级内容：
// ① 支持 AgentSchedule — 按用户配置决定是否运行（Phase 3）
// ② 通知投递 — Agent 运行后自动生成 Notification（Phase 3）
// ③ 周度报告 — 每周日生成学习周报（Phase 3）
// ④ 通知清理 — 自动清理 30 天前的已读通知（Phase 3）
//
// 触发方式：GET /api/agent/cron/daily
// 安全机制：CRON_SECRET Bearer Token
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runLearningAgent } from "@/lib/agent";
import { createWeeklyReportNotification } from "@/lib/agent/weekly";
import { cleanupOldNotifications } from "@/lib/notification";
import { cleanupColdMemories } from "@/lib/memory";

export async function GET(request: NextRequest) {
  // 安全校验
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const isSunday = now.getDay() === 0; // 周日生成周报
  console.log(`[Cron] ====== 每日 Agent 运行开始 (${now.toISOString()}) ======`);

  // 汇总统计
  let totalUsers = 0;
  let agentSucceeded = 0;
  let agentFailed = 0;
  let notificationsCreated = 0;
  let reportsGenerated = 0;
  let oldNotifsCleaned = 0;
  let coldMemoriesCleaned = 0;

  try {
    // ============================================================
    // 1. 查找需要运行的用户（Phase 3：AgentSchedule 优先）
    // ============================================================

    // 1a. 查找今天有调度配置的用户
    const todayHour = now.getHours().toString().padStart(2, "0");
    const todayMinute = now.getMinutes().toString().padStart(2, "0");
    const timePattern = `${todayMinute} ${todayHour} * * *`;

    const scheduledUsers = await prisma.agentSchedule.findMany({
      where: {
        enabled: true,
        OR: [
          { cron: timePattern },
          // 宽松匹配：cron 分钟字段为 *（每小时）且小时字段匹配
          { cron: { startsWith: `* ${todayHour}` } },
        ],
      },
      select: { userId: true, type: true, id: true },
    });

    console.log(
      `[Cron] 调度匹配: ${scheduledUsers.length} 个用户 (time: ${timePattern})`
    );

    // 1b. 回退：如果没有调度配置，使用活跃计划用户（Phase 1 策略）
    let userIds: string[] = scheduledUsers.map((s) => s.userId);

    if (userIds.length === 0) {
      console.log("[Cron] 无调度匹配用户，回退为活跃计划用户策略");
      const activePlanUsers = await prisma.plan.findMany({
        where: { status: "active" },
        select: { userId: true },
        distinct: ["userId"],
      });
      userIds = activePlanUsers.map((p) => p.userId);
    }

    // 去重
    userIds = [...new Set(userIds)];
    totalUsers = userIds.length;

    console.log(`[Cron] 共 ${totalUsers} 个用户需要处理`);

    // ============================================================
    // 2. 为每个用户运行 Agent
    // ============================================================
    for (const userId of userIds) {
      try {
        // 周日：先生成本周学习周报（真实周度汇总，不依赖 LLM 是否产出报告动作）
        if (isSunday) {
          const weekly = await createWeeklyReportNotification(userId);
          if (weekly) reportsGenerated++;
        }

        const result = await runLearningAgent(userId, {
          mode: isSunday ? "review" : "daily",
          persist: true,
        });

        if (result.status !== "at_risk" || result.error === undefined) {
          agentSucceeded++;
        } else {
          agentFailed++;
        }

        // 统计通知数（由 executeAction 自动生成）
        notificationsCreated += result.executedActions.filter(
          (a) => a.success && (a.type === "SEND_REMINDER" || a.type === "ENCOURAGE")
        ).length;

        // 统计报告数
        reportsGenerated += result.executedActions.filter(
          (a) => a.success && a.type === "GENERATE_REPORT"
        ).length;

        console.log(
          `[Cron] 用户 ${userId.slice(0, 8)}: status=${result.status}, actions=${result.executedActions.length}`
        );
      } catch (error) {
        agentFailed++;
        const message = error instanceof Error ? error.message : "运行异常";
        console.error(`[Cron] 用户 ${userId.slice(0, 8)} 失败:`, message);
      }
    }

    // ============================================================
    // 3. 更新 AgentSchedule.lastRunAt / nextRunAt
    // ============================================================
    if (scheduledUsers.length > 0) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // 默认下次运行：明天 9:00

      for (const schedule of scheduledUsers) {
        await prisma.agentSchedule
          .update({
            where: { id: schedule.id },
            data: {
              lastRunAt: now,
              nextRunAt: tomorrow,
            },
          })
          .catch(() => {});
      }
    }

    // ============================================================
    // 4. 清理旧通知（30 天前的已读通知）
    // ============================================================
    for (const userId of userIds.slice(0, 50)) {
      try {
        const cleaned = await cleanupOldNotifications(userId, 30);
        oldNotifsCleaned += cleaned;
      } catch {
        // 跳过失败的用户
      }
    }

    // ============================================================
    // 5. 冷记忆淘汰（长期未使用 + 低重要性的记忆）
    // ============================================================
    for (const userId of userIds.slice(0, 50)) {
      try {
        const result = await cleanupColdMemories(userId);
        coldMemoriesCleaned += result.deleted;
      } catch {
        // 跳过失败的用户
      }
    }

    // ============================================================
    // 完成
    // ============================================================
    console.log(
      `[Cron] ====== 结束: ${agentSucceeded}成功/${agentFailed}失败 | ` +
      `通知${notificationsCreated}条 | 报告${reportsGenerated}份 | ` +
      `清理${oldNotifsCleaned}条旧通知 | 淘汰${coldMemoriesCleaned}条冷记忆 ======`
    );

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      isSunday,
      stats: {
        totalUsers,
        agentSucceeded,
        agentFailed,
        notificationsCreated,
        reportsGenerated,
        oldNotifsCleaned,
        coldMemoriesCleaned,
      },
    });
  } catch (error) {
    console.error("[Cron] 整体异常:", error);
    return NextResponse.json(
      {
        error: "Cron job failed",
        detail: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
}
