// ============================================================
// 每日学习分析 — 单用户按需运行
//
// 触发方式：用户在当天第一次打开 dashboard 时，前端 fire-and-forget 调一次。
// 鉴权：走登录 session（getAuthUser），不存在无人值守调用，所以不需要
//       CRON_SECRET / crontab / 公开端点那一整套。
//
// 幂等：同一用户当天只跑一次。判断放在服务端、按 userId——前端 localStorage
//       是按浏览器算的，换设备/无痕会重复触发。
//
// 顺序：先跑分析，再清理通知。反过来的话，万一分析失败用户会既丢旧通知
//       又拿不到新的。
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth-utils";
import { runLearningAgent } from "@/lib/agent";
import { createWeeklyReportNotification } from "@/lib/agent/weekly";
import { cleanupOldNotifications } from "@/lib/notification";
import { cleanupColdMemories } from "@/lib/memory";

/** 通知保留天数：超过就清掉，已读未读都删 */
const NOTIFICATION_RETENTION_DAYS = 7;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSunday = new Date().getDay() === 0;

  try {
    // ---- 幂等：今天已经跑过就跳过 ----
    // 多标签页 / 多设备同时打开时，只有第一个请求会真正执行。
    const ranToday = await prisma.agentRun.findFirst({
      where: {
        userId: user.id,
        mode: { in: ["daily", "review"] },
        createdAt: { gte: startOfToday() },
      },
      select: { id: true },
    });

    if (ranToday) {
      return NextResponse.json({ success: true, skipped: true });
    }

    // ---- 周日：先生成本周学习周报（纯统计，不耗 LLM；自带周度去重）----
    let reportGenerated = false;
    if (isSunday) {
      reportGenerated = (await createWeeklyReportNotification(user.id)) !== null;
    }

    // ---- 跑分析 ----
    // runLearningAgent 内部对 LLM 失败有规则兜底，正常不会抛；
    // 真抛了也不该连带跳过后面的清理。
    let status: string | null = null;
    let actions = 0;
    try {
      const result = await runLearningAgent(user.id, {
        mode: isSunday ? "review" : "daily",
        persist: true,
      });
      status = result.status;
      actions = result.executedActions.length;
    } catch (error) {
      console.error("[DailyRun] 分析失败:", error);
    }

    // ---- 清理旧通知（已读未读都删）+ 淘汰冷记忆 ----
    const notificationsCleaned = await cleanupOldNotifications(
      user.id,
      NOTIFICATION_RETENTION_DAYS
    ).catch(() => 0);

    const memoriesCleaned = await cleanupColdMemories(user.id)
      .then((r) => r.deleted)
      .catch(() => 0);

    return NextResponse.json({
      success: true,
      skipped: false,
      isSunday,
      stats: {
        status,
        actions,
        reportGenerated,
        notificationsCleaned,
        memoriesCleaned,
      },
    });
  } catch (error) {
    console.error("[DailyRun] 整体异常:", error);
    return NextResponse.json(
      { error: "每日分析运行失败" },
      { status: 500 }
    );
  }
}
