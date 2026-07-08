import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, format } from "date-fns";
import { StatsSummary } from "@/components/statistics/stats-summary";
import { DailyChart } from "@/components/statistics/daily-chart";
import { WeeklyChart } from "@/components/statistics/weekly-chart";
import { SubjectPieChart } from "@/components/statistics/subject-pie-chart";

export default async function StatisticsPage() {
  const user = await requireAuth();
  const now = new Date();

  const dailyData = [];
  for (let i = 29; i >= 0; i--) {
    const d = subDays(now, i);
    const dStart = startOfDay(d);
    const dEnd = endOfDay(d);
    const checkins = await prisma.checkin.findMany({
      where: { userId: user.id, checkinDate: { gte: dStart, lte: dEnd } },
    });
    dailyData.push({
      date: format(d, "MM/dd"),
      hours: Math.round(checkins.reduce((s, c) => s + c.hours, 0) * 10) / 10,
    });
  }

  const weeklyData = [];
  for (let i = 11; i >= 0; i--) {
    const d = subDays(now, i * 7);
    const ws = startOfWeek(d, { weekStartsOn: 1 });
    const we = endOfWeek(d, { weekStartsOn: 1 });
    const checkins = await prisma.checkin.findMany({
      where: { userId: user.id, checkinDate: { gte: ws, lte: we } },
    });
    weeklyData.push({
      week: format(ws, "MM/dd"),
      hours: Math.round(checkins.reduce((s, c) => s + c.hours, 0) * 10) / 10,
    });
  }

  const allCheckins = await prisma.checkin.findMany({
    where: { userId: user.id },
    select: { subject: true, hours: true, checkinDate: true },
  });
  const subjectMap: Record<string, number> = {};
  for (const c of allCheckins) {
    const key = c.subject || "其他";
    subjectMap[key] = (subjectMap[key] || 0) + c.hours;
  }
  const subjectData = Object.entries(subjectMap)
    .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);

  const totalHours = allCheckins.reduce((s, c) => s + c.hours, 0);
  const totalDays = new Set(allCheckins.map((c) => format(c.checkinDate, "yyyy-MM-dd"))).size;
  const avgPerDay = totalDays > 0 ? totalHours / totalDays : 0;
  const bestSubject = subjectData[0]?.name ?? "暂无";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          数据统计
        </h1>
        <p className="text-muted-foreground mt-1">
          分析你的学习模式和趋势。
        </p>
      </div>

      <StatsSummary
        totalHours={Math.round(totalHours * 10) / 10}
        totalDays={totalDays}
        avgPerDay={Math.round(avgPerDay * 10) / 10}
        bestSubject={bestSubject}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DailyChart data={dailyData} />
        <WeeklyChart data={weeklyData} />
      </div>

      <div className="max-w-md">
        <SubjectPieChart data={subjectData} />
      </div>
    </div>
  );
}
