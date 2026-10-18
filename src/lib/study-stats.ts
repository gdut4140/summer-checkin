// ============================================================
// 学习统计查询（getStudyStats 工具用）
//
// 打卡有两种来源：签到界面的一键「到访」，以及 AI 标记完成任务时自动记的那条
// （见 lib/tools/agent-tools.ts）。两者都**不含学习时长**——时长以番茄钟为准
// （StudyRecord），不在这张表里。
//
// 所以这里统计的是口径统一的那部分：打卡天数与条数、今日打卡、连续天数、活跃计划。
//
// 「连续打卡」的口径统一走 lib/checkin-streak.ts（本地时区）。这里原先用
// toISOString().slice(0,10) 造 UTC 日期键，会把今天的打卡挤出扫描窗口。
// ============================================================

import { prisma } from "@/lib/prisma";
import { checkinDayKeys, computeStreak } from "@/lib/checkin-streak";

export interface StudyStatsData {
  /** 打卡记录条数（含 AI 代报「完成任务」写进来的那些，所以**不等于天数**） */
  totalCheckins: number;
  /** 有打卡的**不同天数**。这才是「打卡天数」 */
  activeDays: number;
  todayCount: number;
  streak: number;
  activePlans: { name: string; progress: number }[];
}

export async function getStudyStatsData(userId: string): Promise<StudyStatsData> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [allCheckins, activePlans, todayCheckins] = await Promise.all([
    prisma.checkin.findMany({
      where: { userId },
      orderBy: { checkinDate: "desc" },
    }),
    prisma.plan.findMany({
      where: { userId, status: "active" },
      include: { tasks: { select: { status: true } } },
    }),
    prisma.checkin.findMany({
      where: { userId, checkinDate: { gte: todayStart } },
    }),
  ]);

  // 连续打卡：从今天往回数（今天还没打卡不算断）——口径见 lib/checkin-streak.ts
  const dayKeys = checkinDayKeys(allCheckins);
  const streak = computeStreak(dayKeys, now);

  return {
    totalCheckins: allCheckins.length,
    // 条数 ≠ 天数：AI 代报「完成任务」时一个任务写一条，一天可以写很多条
    activeDays: dayKeys.size,
    todayCount: todayCheckins.length,
    streak,
    activePlans: activePlans.map((plan) => {
      const total = plan.tasks.length;
      const done = plan.tasks.filter((t) => t.status === "done").length;
      return {
        name: plan.name,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
      };
    }),
  };
}
