"use client";

import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function getColor(hours: number): string {
  if (hours === 0) return "bg-muted";
  if (hours <= 0.5) return "bg-amber-200 dark:bg-amber-950";
  if (hours <= 1.5) return "bg-amber-400 dark:bg-amber-800";
  if (hours <= 3) return "bg-amber-500 dark:bg-amber-600";
  if (hours <= 5) return "bg-amber-600 dark:bg-amber-400";
  return "bg-amber-700 dark:bg-amber-300";
}

interface HeatmapProps {
  data: { date: string; hours: number }[];
  year: number;
}

export function Heatmap({ data, year }: HeatmapProps) {
  const weeks = useMemo(() => {
    const result: { date: string; hours: number; dayOfWeek: number }[][] = [];
    let currentWeek: { date: string; hours: number; dayOfWeek: number }[] = [];

    for (const day of data) {
      const d = new Date(day.date + "T00:00:00");
      const dayOfWeek = d.getDay();
      currentWeek.push({ ...day, dayOfWeek });

      if (dayOfWeek === 6 || day.date === data[data.length - 1].date) {
        result.push(currentWeek);
        currentWeek = [];
      }
    }
    return result;
  }, [data]);

  const dayLabels = ["日", "一", "二", "三", "四", "五", "六"];

  const months = useMemo(() => {
    const m: { label: string; index: number }[] = [];
    weeks.forEach((week, i) => {
      if (week.length > 0) {
        const d = new Date(week[0].date + "T00:00:00");
        const month = d.toLocaleDateString("zh-CN", { month: "short" });
        const last = m[m.length - 1];
        if (!last || last.label !== month) {
          m.push({ label: month, index: i });
        }
      }
    });
    return m;
  }, [weeks]);

  return (
    <div className="overflow-x-auto">
      <div className="flex mb-1 ml-8">
        {months.map((m, i) => (
          <div
            key={`${m.label}-${i}`}
            className="text-xs text-muted-foreground"
            style={{ marginLeft: i === 0 ? m.index * 13 : (m.index - months[i - 1].index) * 13 }}
          >
            {m.label}
          </div>
        ))}
      </div>

      <div className="flex gap-[3px]">
        <div className="flex flex-col gap-[3px] pr-2 justify-start pt-[2px]">
          {dayLabels.map((label, i) => (
            <div
              key={label}
              className="text-[10px] text-muted-foreground h-[11px] leading-[11px]"
            >
              {i % 2 === 0 ? label : ""}
            </div>
          ))}
        </div>

        <TooltipProvider>
          <div className="flex gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {Array.from({ length: 7 }).map((_, di) => {
                  const day = week.find((d) => d.dayOfWeek === di) ?? {
                    date: "",
                    hours: 0,
                  };

                  return (
                    <Tooltip key={`${wi}-${di}`}>
                      <TooltipTrigger>
                        <div
                          className={`w-[11px] h-[11px] rounded-sm ${getColor(day.hours)}`}
                        />
                      </TooltipTrigger>
                      {day.date && (
                        <TooltipContent side="top" className="text-xs">
                          <p>{day.date}</p>
                          <p>{day.hours.toFixed(1)} 小时</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-2 mt-3 justify-end text-xs text-muted-foreground">
        <span>少</span>
        <div className="w-[11px] h-[11px] rounded-sm bg-muted" />
        <div className="w-[11px] h-[11px] rounded-sm bg-amber-200 dark:bg-amber-950" />
        <div className="w-[11px] h-[11px] rounded-sm bg-amber-400 dark:bg-amber-800" />
        <div className="w-[11px] h-[11px] rounded-sm bg-amber-500 dark:bg-amber-600" />
        <div className="w-[11px] h-[11px] rounded-sm bg-amber-600 dark:bg-amber-400" />
        <div className="w-[11px] h-[11px] rounded-sm bg-amber-700 dark:bg-amber-300" />
        <span>多</span>
      </div>
    </div>
  );
}
