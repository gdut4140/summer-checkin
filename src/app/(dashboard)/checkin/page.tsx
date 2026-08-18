import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, subDays, startOfYear, endOfYear, format, eachDayOfInterval } from "date-fns";
import { LearningIsland } from "@/components/landing/learning-island";
import { Heatmap } from "@/components/calendar/heatmap";
import { CheckinButton } from "./checkin-button";
import { SceneSelector } from "@/components/island/scene-selector";

export default async function CheckinPage() {
  const user = await requireAuth();
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // 今日是否已签到
  const todayCheckin = await prisma.checkin.findFirst({
    where: {
      userId: user.id,
      checkinDate: { gte: todayStart, lte: todayEnd },
    },
  });

  // 连续签到天数
  let streak = 0;
  let checkDate = new Date(now);
  if (!todayCheckin) checkDate = subDays(checkDate, 1);
  while (true) {
    const ds = startOfDay(checkDate);
    const de = endOfDay(checkDate);
    const dayCheckin = await prisma.checkin.findFirst({
      where: { userId: user.id, checkinDate: { gte: ds, lte: de } },
    });
    if (dayCheckin) { streak++; checkDate = subDays(checkDate, 1); }
    else break;
  }

  // 总签到次数
  const totalCheckins = await prisma.checkin.count({ where: { userId: user.id } });

  // 总学习时长（用于岛屿展示）
  const totalHoursAgg = await prisma.checkin.aggregate({
    where: { userId: user.id },
    _sum: { hours: true },
  });
  const userTotalHours = totalHoursAgg._sum.hours ?? 0;

  const todayCheckins = todayCheckin ? 5 : 0;

  // 本周签到天数
  const dayOfWeek = now.getDay();
  const weekStart = startOfDay(subDays(now, dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const weekCheckins = await prisma.checkin.findMany({
    where: { userId: user.id, checkinDate: { gte: weekStart } },
    distinct: ["checkinDate"],
  });

  // ── 日历热力图数据 ──
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);
  const yearCheckins = await prisma.checkin.findMany({
    where: { userId: user.id, checkinDate: { gte: yearStart, lte: yearEnd } },
    select: { checkinDate: true },
    orderBy: { checkinDate: "asc" },
  });

  const checkedInDays = new Set(yearCheckins.map((c) => format(c.checkinDate, "yyyy-MM-dd")));
  const allDays = eachDayOfInterval({ start: yearStart, end: yearEnd });
  const heatmapData = allDays.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return { date: key, checked: checkedInDays.has(key) };
  });

  // 最长连续
  let longestStreak = 0;
  let currentRun = 0;
  for (const d of allDays) {
    const key = format(d, "yyyy-MM-dd");
    if (checkedInDays.has(key)) {
      currentRun++;
      if (currentRun > longestStreak) longestStreak = currentRun;
    } else {
      currentRun = 0;
    }
  }

  const todayDate = now.toLocaleDateString("zh-CN", {
    month: "long", day: "numeric", weekday: "long",
  });

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      {/* ── 3D 小岛（透明背景，融入全局背景） ── */}
      <div className="absolute inset-0">
        <LearningIsland
          totalCheckins={totalCheckins}
          streak={streak}
          totalHours={userTotalHours}
          todayCheckins={todayCheckins}
        />
      </div>

      {/* 顶部渐变遮罩（轻量，仅保证文字可读） */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-background/85 to-transparent" />

      {/* ── 顶部：标题 + 统计 ── */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-4 pt-24 md:px-10 md:pt-24">
        <div className="flex flex-col gap-3">
          <div>
            <p className="product-eyebrow whitespace-nowrap">
              {todayDate}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">
              我的小岛
            </h1>
          </div>
          <SceneSelector />
        </div>
        <div className="surface grid grid-cols-3 overflow-hidden">
          {[
            { label: "持续来访", value: streak, unit: "天" },
            { label: "岛龄", value: totalCheckins, unit: "天" },
            { label: "本周足迹", value: weekCheckins.length, unit: "天" },
          ].map((item) => (
            <div key={item.label} className="min-w-16 border-l border-white/8 px-2.5 py-2 text-center first:border-l-0 md:min-w-24 md:px-4 md:py-2.5">
              <p className="truncate text-[9px] text-white/36 md:text-[10px]">{item.label}</p>
              <p className="text-lg font-semibold tabular-nums text-foreground md:text-xl">
                {item.value}
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">{item.unit}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 底部：热力图 + 签到 融合面板 ── */}
      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="pointer-events-none h-16 bg-gradient-to-t from-background/70 to-transparent" />

        <div className="border-t border-white/[0.06] bg-background/75 backdrop-blur-4xl">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-5 md:flex-row md:items-end md:gap-8 md:px-10 md:py-6">
            {/* 左侧：热力图 */}
            <div className="flex-1 overflow-hidden">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-sm font-medium text-foreground/70">
                  雨林足迹
                </span>
                <span className="text-xs text-muted-foreground/60">
                  今年探索了 {checkedInDays.size} 天 · 最长旅程 {longestStreak} 天
                </span>
              </div>
              <div className="overflow-x-auto pb-1">
                <Heatmap data={heatmapData} year={now.getFullYear()} compact />
              </div>
            </div>

            {/* 右侧分隔 + 签到区 */}
            <div className="hidden h-16 w-px bg-border md:block" />
            <div className="flex shrink-0 items-center justify-center md:justify-end">
              {todayCheckin ? (
                <div className="flex items-center gap-3 rounded-md bg-primary/8 px-5 py-3 ring-1 ring-primary/20">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                    <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary">今天来过了</p>
                    <p className="text-xs text-primary/60">已持续 {streak} 天</p>
                  </div>
                </div>
              ) : (
                <CheckinButton />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
