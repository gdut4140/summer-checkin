// ============================================================
// 学习统计查询（getStudyStats 工具 + /api/ai 服务端注入共用）
//
// 打卡仅为小岛到访计数：不含时长/科目/心情（签到界面没有对应输入，
// 番茄钟专注数据也尚未接入）。所以这里只统计真正可靠的数据：
// 打卡次数、今日打卡、连续天数、活跃计划进度。
// ============================================================

import { prisma } from "@/lib/prisma";

export interface StudyStatsData {
  totalCheckins: number;
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

  // 连续打卡：从今天往回数（今天还没打卡不算断）
  let streak = 0;
  const checkDates = new Set(
    allCheckins.map((c) => c.checkinDate.toISOString().slice(0, 10))
  );
  for (let i = 0; i < 365; i++) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (checkDates.has(key)) streak++;
    else if (i > 0) break;
  }

  return {
    totalCheckins: allCheckins.length,
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
