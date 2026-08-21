import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, format, subDays } from "date-fns";
import { CalendarCheck, ChartLineUp, Star, Lightning, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { ProfileHeader } from "@/components/profile/profile-header";
import { FocusDurationChart, type FocusDay } from "@/components/profile/focus-duration-chart";

export default async function ProfilePage() {
  const user = await requireAuth();
  const now = new Date();

  const fullUser = await prisma.user.findUnique({ where: { id: user.id } });

  // 计划统计
  const plans = await prisma.plan.findMany({
    where: { userId: user.id },
    include: { tasks: { select: { status: true, completedAt: true } } },
  });

  const totalTasks = plans.reduce((s, p) => s + p.tasks.length, 0);
  const doneTasks = plans.reduce((s, p) => s + p.tasks.filter((t) => t.status === "done").length, 0);
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // 加入天数
  const joinDays = fullUser?.createdAt
    ? Math.floor((now.getTime() - fullUser.createdAt.getTime()) / 86400000)
    : 0;

  // 今日完成
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const todayDone = plans.flatMap((p) =>
    p.tasks.filter((t) => t.status === "done" && t.completedAt && t.completedAt >= todayStart && t.completedAt <= todayEnd)
  ).length;

  // 完整番茄钟记录：累计数据 + 最近 7 天趋势
  const focusRangeStart = startOfDay(subDays(now, 6));
  const focusWhere = { userId: user.id, checkinId: { startsWith: "focus-" } };
  const [focusTotal, focusRecords] = await Promise.all([
    prisma.studyRecord.aggregate({
      where: focusWhere,
      _sum: { totalMinutes: true },
      _count: { _all: true },
    }),
    prisma.studyRecord.findMany({
      where: { ...focusWhere, date: { gte: focusRangeStart } },
      select: { date: true, totalMinutes: true },
      orderBy: { date: "asc" },
    }),
  ]);
  const focusByDate = new Map<string, number>();
  for (const record of focusRecords) {
    const key = format(record.date, "yyyy-MM-dd");
    focusByDate.set(key, (focusByDate.get(key) ?? 0) + record.totalMinutes);
  }
  const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
  const focusDays: FocusDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = subDays(now, 6 - index);
    const key = format(date, "yyyy-MM-dd");
    return {
      date: key,
      weekday: weekdayLabels[date.getDay()],
      minutes: Math.round(focusByDate.get(key) ?? 0),
      isToday: index === 6,
    };
  });

  // 连续活跃：合并打卡日期 + 任务完成日期
  const checkins = await prisma.checkin.findMany({
    where: { userId: user.id },
    select: { checkinDate: true },
  });
  const allActiveDates = new Set<string>();
  for (const c of checkins) {
    allActiveDates.add(format(c.checkinDate, "yyyy-MM-dd"));
  }
  for (const plan of plans) {
    for (const t of plan.tasks) {
      if (t.status === "done" && t.completedAt) allActiveDates.add(format(t.completedAt, "yyyy-MM-dd"));
    }
  }
  let streakDays = 0;
  const sortedDates = [...allActiveDates].sort().reverse();
  for (let i = 0; i < sortedDates.length; i++) {
    if (sortedDates[i] === format(new Date(now.getTime() - i * 86400000), "yyyy-MM-dd")) streakDays++;
    else break;
  }

  const overview = [
    { label: "加入天数", value: String(joinDays), unit: "天", icon: CalendarCheck },
    { label: "连续活跃", value: String(streakDays), unit: "天", icon: Lightning },
    { label: "任务完成率", value: String(progress), unit: "%", icon: ChartLineUp },
  ];

  return (
    <div className="product-page product-page--redesigned space-y-6">
      <ProfileHeader
        user={{
          name: fullUser?.name ?? user.name,
          email: fullUser?.email ?? user.email,
          bio: fullUser?.bio ?? null,
          image: fullUser?.image ?? null,
          createdAt: fullUser?.createdAt ?? new Date(),
        }}
      />

      {/* 概览 */}
      <section className="product-metrics grid grid-cols-1 sm:grid-cols-3">
        {overview.map((item, i) => (
          <div key={item.label} className={`product-metric flex items-center gap-3 ${i > 0 ? "border-t border-white/10 sm:border-t-0" : ""}`}>
            <span className="flex size-9 items-center justify-center rounded-md border border-white/8 bg-white/[0.035] text-primary"><item.icon className="size-[18px]" weight="duotone" /></span>
            <div className="min-w-0">
              <p className="text-[11px] text-white/38">{item.label}</p>
              <p className="mt-1 text-[1.35rem] font-semibold tabular-nums text-white">{item.value}<span className="ml-1 text-xs font-normal text-white/34">{item.unit}</span></p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <section className="product-panel p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-white/72">学习完成度</p>
              <p className="mt-1 text-xs text-white/32">所有计划的任务完成情况</p>
            </div>
            <span className="text-3xl font-semibold tabular-nums text-white">{progress}<span className="text-sm font-normal text-white/32">%</span></span>
          </div>
          <div className="mt-8 h-1 overflow-hidden bg-white/8">
            <div className="h-full bg-primary transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-white/34">
            <span>{doneTasks} 项已完成</span>
            <span>{Math.max(totalTasks - doneTasks, 0)} 项待推进</span>
          </div>
        </section>

        <section className="product-panel flex flex-col justify-between p-5 md:p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/72">今日动态</span>
            {todayDone > 0 ? <CheckCircle className="size-5 text-primary" weight="fill" /> : <Star className="size-5 text-primary" weight="duotone" />}
          </div>
          <p className="mt-6 text-sm leading-6 text-white/48">
            {todayDone > 0
              ? `已完成 ${todayDone} 个任务 · 连续 ${streakDays} 天活跃 · ${plans.length} 个计划`
              : `还没有完成任务 · ${plans.length} 个计划等你继续`}
          </p>
        </section>
      </div>

      <FocusDurationChart
        days={focusDays}
        totalMinutes={Math.round(focusTotal._sum.totalMinutes ?? 0)}
        sessionCount={focusTotal._count._all}
      />

      {/* 空状态 */}
      {plans.length === 0 && (
        <section className="rounded-lg border border-dashed border-white/10 py-16 text-center">
          <p className="text-sm text-white/40">这里还空着</p>
          <p className="mt-1 text-xs text-white/25">去计划页创建第一个计划，或者开始打卡吧</p>
        </section>
      )}
    </div>
  );
}
