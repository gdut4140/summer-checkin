import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, startOfWeek, subDays } from "date-fns";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { GrowthChart } from "@/components/dashboard/growth-chart";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { QuickActions } from "@/components/dashboard/quick-actions";
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
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          欢迎回来，{user.name}
        </h1>
        <p className="text-muted-foreground mt-1">
          {now.toLocaleDateString("zh-CN", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <StatsCards stats={stats} />
      <QuickActions />

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
