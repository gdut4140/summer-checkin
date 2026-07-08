import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { LeaderboardTable } from "@/components/ranking/leaderboard-table";
import { MyRankCard } from "@/components/ranking/my-rank-card";
import type { LeaderboardEntry } from "@/types";

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireAuth();
  const { period = "weekly" } = await searchParams;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      image: true,
      checkins: { select: { hours: true, checkinDate: true } },
    },
  });

  const now = new Date();
  const periodStart =
    period === "weekly"
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : period === "monthly"
      ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      : new Date(0);

  function calcStreak(checkins: { checkinDate: Date }[]): number {
    const days = new Set(
      checkins.map((c) => new Date(c.checkinDate).toDateString())
    );
    let streak = 0;
    const d = new Date();
    while (days.has(d.toDateString())) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  const leaderboard: LeaderboardEntry[] = users
    .map((u) => {
      const periodCheckins = u.checkins.filter(
        (c) => c.checkinDate >= periodStart
      );
      const totalHours = periodCheckins.reduce((s, c) => s + c.hours, 0);
      return {
        userId: u.id,
        name: u.name,
        image: u.image,
        totalHours: Math.round(totalHours * 10) / 10,
        streak: calcStreak(u.checkins),
        rank: 0,
      };
    })
    .sort((a, b) => b.totalHours - a.totalHours)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  const myEntry = leaderboard.find((e) => e.userId === user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          排行榜
        </h1>
        <p className="text-muted-foreground mt-1">
          看看你在所有学习者中的排名。
        </p>
      </div>

      {myEntry && <MyRankCard entry={myEntry} />}

      <LeaderboardTable
        entries={leaderboard.slice(0, 50)}
        currentUserId={user.id}
        period={period}
      />
    </div>
  );
}
