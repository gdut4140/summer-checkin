// ============================================================
// 每日学习分析 — 单用户按需运行
//
// 触发方式：用户在当天第一次打开 dashboard 时，前端 fire-and-forget 调一次。
// 鉴权：走登录 session（getAuthUser），不存在无人值守调用，所以不需要
//       CRON_SECRET / crontab / 公开端点那一整套。
//
// 幂等：靠数据库唯一约束（agentrun.userId + runDate）**抢锁**，不是先查后写。
//       同一个用户同一天只有第一个请求能插入成功，其余拿到 P2002 直接跳过。
//       多标签页 / 多设备同时打开是常态，先 findFirst 再 create 那种写法挡不住。
//       抢锁也把周日周报的同类竞态一并挡住了——整个请求就是临界区。
//
// 顺序：先抢锁，再跑分析，最后清理通知。清理放最后是为了万一分析失败，
//       用户不会既丢旧通知又拿不到新的。
// ============================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth-utils";
import { runLearningAgent, agentRunGoal } from "@/lib/agent";
import { createWeeklyReportNotification } from "@/lib/agent/weekly";
import { cleanupOldNotifications } from "@/lib/notification";
import { cleanupColdMemories } from "@/lib/memory";

/** 通知保留天数：超过就清掉，已读未读都删 */
const NOTIFICATION_RETENTION_DAYS = 7;

/** 服务端本地日期 YYYY-MM-DD（与原先的「今天」判断同口径：按服务器本地日切分） */
function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 判断是否为 Prisma 唯一约束冲突。
 *
 * 故意用 code 字符串而不是 `instanceof Prisma.PrismaClientKnownRequestError`：
 * 本项目用的是自定义输出路径的生成客户端（@prisma-generated/client），
 * 鸭子类型判断不受生成器版本 / 类身份的影响，也不会把整个 Prisma 运行时命名空间
 * 拉进这个路由。
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/**
 * 释放还没开始跑的锁行。
 *
 * 只在 status 仍是 queued 时删——那说明分析根本没启动（例如周报就抛了），
 * 把今天的锁还回去让下次访问能重试。已经进入 running/completed/failed 的保留，
 * 维持「失败不自动重试、不反复打模型」的既有语义。
 * deleteMany + status 条件是原子的，不存在第二次 check-then-act。
 */
async function releaseClaim(runId: string): Promise<void> {
  try {
    await prisma.agentRun.deleteMany({ where: { id: runId, status: "queued" } });
  } catch (error) {
    console.error("[DailyRun] 释放锁行失败:", error);
  }
}

export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSunday = new Date().getDay() === 0;
  const mode = isSunday ? "review" : "daily";

  // ---- 抢锁：插入成功 = 今天归我；唯一冲突 = 别人已经在跑 ----
  // 唯一约束见 prisma/add-agentrun-daily-unique.sql
  let runId: string;
  try {
    const claim = await prisma.agentRun.create({
      data: {
        userId: user.id,
        mode,
        runDate: localDateKey(),
        goal: agentRunGoal(mode),
        status: "queued",
      },
      select: { id: true },
    });
    runId = claim.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ success: true, skipped: true });
    }
    console.error("[DailyRun] 抢锁失败:", error);
    return NextResponse.json({ error: "每日分析运行失败" }, { status: 500 });
  }

  try {
    // ---- 周日：先生成本周学习周报（纯统计，不耗 LLM；自带周度去重）----
    let reportGenerated = false;
    if (isSunday) {
      reportGenerated = (await createWeeklyReportNotification(user.id)) !== null;
    }

    // ---- 跑分析 ----
    // runLearningAgent 内部对 LLM 失败有规则兜底，正常不会抛；
    // 真抛了也不该连带跳过后面的清理。复用抢到的锁行，不再新建。
    let status: string | null = null;
    let actions = 0;
    try {
      const result = await runLearningAgent(user.id, {
        mode,
        persist: true,
        runId,
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
    await releaseClaim(runId);
    console.error("[DailyRun] 整体异常:", error);
    return NextResponse.json(
      { error: "每日分析运行失败" },
      { status: 500 }
    );
  }
}
