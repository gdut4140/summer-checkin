import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { startOfYear, endOfYear, format, eachDayOfInterval } from "date-fns";
import { Heatmap } from "@/components/calendar/heatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CalendarPage() {
  const user = await requireAuth();
  const now = new Date();
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);

  const checkins = await prisma.checkin.findMany({
    where: {
      userId: user.id,
      checkinDate: { gte: yearStart, lte: yearEnd },
    },
    select: { checkinDate: true, hours: true },
    orderBy: { checkinDate: "asc" },
  });

  const hoursMap: Record<string, number> = {};
  for (const c of checkins) {
    const key = format(c.checkinDate, "yyyy-MM-dd");
    hoursMap[key] = (hoursMap[key] || 0) + c.hours;
  }

  const days = eachDayOfInterval({ start: yearStart, end: yearEnd });
  const data = days.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return { date: key, hours: hoursMap[key] || 0 };
  });

  const totalDays = days.filter((d) => hoursMap[format(d, "yyyy-MM-dd")]).length;
  const totalHours = Object.values(hoursMap).reduce((s, h) => s + h, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          打卡日历
        </h1>
        <p className="text-muted-foreground mt-1">
          {now.getFullYear()} 年学习热力图。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">学习天数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalDays}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">总时长</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">日均学习</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalDays > 0 ? (totalHours / totalDays).toFixed(1) : "0"}h
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">最佳单日</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {Object.values(hoursMap).length > 0
                ? Math.max(...Object.values(hoursMap)).toFixed(1)
                : "0"}
              h
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">学习热力图</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap data={data} year={now.getFullYear()} />
        </CardContent>
      </Card>
    </div>
  );
}
