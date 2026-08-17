import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, format } from "date-fns";
import { CalendarCheck, ChartLineUp, Star, Lightning } from "@phosphor-icons/react/dist/ssr";
import { ProfileHeader } from "@/components/profile/profile-header";

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

  // 连续活跃
  let streakDays = 0;
  const completedDates = new Set<string>();
  for (const plan of plans) {
    for (const t of plan.tasks) {
      if (t.status === "done" && t.completedAt) completedDates.add(format(t.completedAt, "yyyy-MM-dd"));
    }
  }
  const sortedDates = [...completedDates].sort().reverse();
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
    <div className="product-page space-y-6">
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
      <section className="grid grid-cols-2 border-y border-white/10 bg-black/10 lg:grid-cols-4">
        {overview.map((item, i) => (
          <div key={item.label} className={`flex min-h-24 items-center gap-3 px-3 py-4 md:px-5 ${i % 2 === 1 ? "border-l border-white/10" : ""} ${i > 1 ? "border-t border-white/10 lg:border-t-0" : ""} ${i > 0 ? "lg:border-l lg:border-white/10" : ""}`}>
            <item.icon className="size-5 shrink-0 text-[#d7ef83]" weight="duotone" />
            <div>
              <p className="text-xs text-white/42">{item.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-white">{item.value}<span className="ml-1 text-xs font-normal text-white/36">{item.unit}</span></p>
            </div>
          </div>
        ))}
      </section>

      {/* 进度条 */}
      {totalTasks > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">总任务进度</span>
            <span className="tabular-nums text-[#d7ef83] font-medium">{doneTasks}/{totalTasks} · {progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-[#d7ef83] transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
        </section>
      )}

      {/* 今日 */}
      <section className="rounded-lg border border-white/8 bg-[#0a2119]/50 px-5 py-4">
        <div className="flex items-center gap-2">
          <Star className="size-4 text-[#d7ef83]" weight="fill" />
          <span className="text-sm font-medium text-white">今日动态</span>
        </div>
        <p className="mt-2 text-sm text-white/50">
          {todayDone > 0
            ? `已完成 ${todayDone} 个任务 · 连续 ${streakDays} 天活跃 · ${plans.length} 个计划`
            : `还没有完成任务 · ${plans.length} 个计划等你继续`}
        </p>
      </section>

      {/* 空状态 */}
      {plans.length === 0 && (
        <section className="rounded-lg border border-dashed border-white/10 py-16 text-center">
          <p className="text-sm text-white/40">这里还空着</p>
          <p className="mt-1 text-xs text-white/25">去学习计划页创建第一个计划，或者开始打卡吧</p>
        </section>
      )}
    </div>
  );
}
