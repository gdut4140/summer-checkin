import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, startOfWeek, subDays } from "date-fns";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { LearningIsland } from "@/components/landing/learning-island";

import type { DashboardStats } from "@/types";

export default async function DashboardPage() {
  const user = await requireAuth();
  const now = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  const todayCheckins = await prisma.checkin.findMany({
    where: { userId: user.id, checkinDate: { gte: today, lte: todayEnd } },
  });
  const todayHours = todayCheckins.reduce((sum, c) => sum + c.hours, 0);

  const weekCheckins = await prisma.checkin.findMany({
    where: { userId: user.id, checkinDate: { gte: weekStart } },
    distinct: ["checkinDate"],
  });
  const weekDays = Math.min(
    Math.ceil((now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)),
    7
  );
  const weekCompletion =
    weekDays > 0 ? Math.round((weekCheckins.length / weekDays) * 100) : 0;

  let streak = 0;
  let checkDate = new Date(today);
  while (true) {
    const dayStart = startOfDay(checkDate);
    const dayEnd = endOfDay(checkDate);
    const dayCheckin = await prisma.checkin.findFirst({
      where: { userId: user.id, checkinDate: { gte: dayStart, lte: dayEnd } },
    });
    if (dayCheckin) {
      streak++;
      checkDate = subDays(checkDate, 1);
    } else {
      break;
    }
  }

  const totalHours = await prisma.checkin.aggregate({
    where: { userId: user.id },
    _sum: { hours: true },
  });
  const userTotalHours = totalHours._sum.hours ?? 0;

  const totalCheckins = await prisma.checkin.count({
    where: { userId: user.id },
  });

  const totalUsers = await prisma.user.count();

  const betterUsers = await prisma.checkin.groupBy({
    by: ["userId"],
    _sum: { hours: true },
    having: {
      hours: { _sum: { gt: userTotalHours } },
    },
  });
  const userRank = betterUsers.length + 1;

  const recentCheckins = await prisma.checkin.findMany({
    where: { userId: user.id },
    orderBy: { checkinDate: "desc" },
    take: 5,
    include: { plan: { select: { name: true } } },
  });

  const weeklyData = [];
  for (let i = 6; i >= 0; i--) {
    const d = subDays(now, i);
    const dStart = startOfDay(d);
    const dEnd = endOfDay(d);
    const dayCheckins = await prisma.checkin.findMany({
      where: {
        userId: user.id,
        checkinDate: { gte: dStart, lte: dEnd },
      },
    });
    const hours = dayCheckins.reduce((s, c) => s + c.hours, 0);
    weeklyData.push({
      date: d.toLocaleDateString("zh-CN", { weekday: "short" }),
      hours: Math.round(hours * 10) / 10,
    });
  }

  const stats: DashboardStats = {
    streak,
    todayHours: Math.round(todayHours * 10) / 10,
    weekCompletion,
    userRank,
    totalUsers,
    recentCheckins: recentCheckins.map((c) => ({
      id: c.id,
      content: c.content,
      hours: c.hours,
      subject: c.subject,
      mood: c.mood,
      checkinDate: c.checkinDate,
      planName: c.plan?.name ?? null,
    })),
    weeklyData,
  };

  return (
    <div className="space-y-6">
      <section className="relative min-h-[500px] overflow-hidden rounded-lg border border-white/14 bg-[#071f1a]/72 text-white shadow-2xl shadow-black/15 backdrop-blur-xl lg:min-h-[540px]">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <div className="relative z-10 grid min-h-[500px] lg:min-h-[540px] lg:grid-cols-[0.72fr_1.28fr]">
          <div className="flex flex-col justify-between px-6 py-8 md:px-9 md:py-10">
            <div>
              <p className="text-sm font-medium text-[#9cc8b8]">今日学习概览</p>
              <h1 className="mt-3 text-3xl font-semibold md:text-4xl">
                欢迎回来，{user.name}
              </h1>
              <p className="mt-3 text-sm text-white/60">
                {now.toLocaleDateString("zh-CN", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="mt-7 max-w-md text-base leading-7 text-white/68">
                每一次打卡都会积累今天的学习进度，也让这座学习岛继续生长。
              </p>
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/12 pt-6 sm:grid-cols-4 lg:grid-cols-2">
              <div>
                <dt className="text-xs text-white/48">连续打卡</dt>
                <dd className="mt-1 text-xl font-semibold">{stats.streak}<span className="ml-1 text-xs font-normal text-white/45">天</span></dd>
              </div>
              <div>
                <dt className="text-xs text-white/48">今日学习</dt>
                <dd className="mt-1 text-xl font-semibold">{stats.todayHours}<span className="ml-1 text-xs font-normal text-white/45">小时</span></dd>
              </div>
              <div>
                <dt className="text-xs text-white/48">本周完成率</dt>
                <dd className="mt-1 text-xl font-semibold">{stats.weekCompletion}<span className="ml-1 text-xs font-normal text-white/45">%</span></dd>
              </div>
              <div>
                <dt className="text-xs text-white/48">当前排名</dt>
                <dd className="mt-1 text-xl font-semibold">#{stats.userRank}<span className="ml-1 text-xs font-normal text-white/45">/ {stats.totalUsers}</span></dd>
              </div>
            </dl>
          </div>

          <div className="relative min-h-[390px] lg:min-h-0">
            <div className="pointer-events-none absolute inset-x-[10%] bottom-[9%] h-[22%] rounded-[50%] bg-black/30 blur-3xl" />
            <LearningIsland totalCheckins={totalCheckins} streak={streak} totalHours={userTotalHours} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <GrowthChart data={stats.weeklyData} />
        </div>
        <div>
          <RecentActivity checkins={stats.recentCheckins} />
        </div>
      </div>
    </div>
  );
}
