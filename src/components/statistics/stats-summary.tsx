"use client";

import { Clock, CalendarCheck, Target, Star } from "@phosphor-icons/react";

interface StatsSummaryProps {
  totalHours: number;
  totalDays: number;
  avgPerDay: number;
  bestSubject: string;
}

export function StatsSummary({ totalHours, totalDays, avgPerDay, bestSubject }: StatsSummaryProps) {
  const items = [
    { label: "总时长", value: `${totalHours}h`, icon: Clock },
    { label: "学习天数", value: totalDays.toString(), icon: CalendarCheck },
    { label: "日均学习", value: `${avgPerDay}h`, icon: Target },
    { label: "最佳科目", value: bestSubject, icon: Star },
  ];

  return (
    <div className="metric-strip mb-5">
      {items.map((item) => (
        <div key={item.label} className="flex min-h-24 items-center gap-3 px-4 py-4 md:px-5">
          <item.icon className="size-5 shrink-0 text-primary" weight="duotone" />
          <div className="min-w-0"><p className="text-[11px] text-white/38">{item.label}</p><p className="mt-1 truncate text-xl font-semibold text-white">{item.value}</p></div>
        </div>
      ))}
    </div>
  );
}
