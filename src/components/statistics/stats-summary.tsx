"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, CalendarCheck, Target, Star } from "@phosphor-icons/react";

interface StatsSummaryProps {
  totalHours: number;
  totalDays: number;
  avgPerDay: number;
  bestSubject: string;
}

export function StatsSummary({ totalHours, totalDays, avgPerDay, bestSubject }: StatsSummaryProps) {
  const items = [
    { label: "总时长", value: `${totalHours}h`, icon: Clock, color: "text-orange-600", bg: "bg-orange-500/10" },
    { label: "学习天数", value: totalDays.toString(), icon: CalendarCheck, color: "text-amber-700", bg: "bg-amber-500/10" },
    { label: "日均学习", value: `${avgPerDay}h`, icon: Target, color: "text-rose-600", bg: "bg-rose-500/10" },
    { label: "最佳科目", value: bestSubject, icon: Star, color: "text-yellow-600", bg: "bg-yellow-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.bg} ${item.color}`}>
              <item.icon className="h-4 w-4" weight="fill" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold truncate">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
