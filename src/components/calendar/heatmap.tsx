"use client";

import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function checkedColor(checked: boolean): string {
  if (!checked) return "bg-white/5";
  return "bg-emerald-500/70";
}

interface HeatmapProps {
  data: { date: string; checked: boolean }[];
  year: number;
  compact?: boolean;
}

export function Heatmap({ data, year, compact = false }: HeatmapProps) {
  const weeks = useMemo(() => {
    const result: { date: string; checked: boolean; dayOfWeek: number }[][] = [];
    let currentWeek: { date: string; checked: boolean; dayOfWeek: number }[] = [];

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

  const cellSize = compact ? 12 : 13;
  const gap = compact ? 3 : 3;

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

  const step = cellSize + gap;

  return (
    <div>
      {/* 月份标签 */}
      {!compact && (
        <div className="mb-1 flex" style={{ marginLeft: 28 }}>
          {months.map((m, i) => (
            <div
              key={`${m.label}-${i}`}
              className="text-[10px] text-muted-foreground"
              style={{ marginLeft: i === 0 ? m.index * step : (m.index - months[i - 1].index) * step }}
            >
              {m.label}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-[2px]" style={{ gap }}>
        {/* 星期标签 */}
        {!compact && (
          <div className="mr-1 flex flex-col" style={{ gap, paddingTop: 2 }}>
            {["日", "", "二", "", "四", "", "六"].map((label, i) => (
              <div
                key={i}
                className="text-[9px] leading-none text-muted-foreground"
                style={{ width: cellSize, height: cellSize, lineHeight: `${cellSize}px` }}
              >
                {label}
              </div>
            ))}
          </div>
        )}

        <TooltipProvider>
          <div className="flex" style={{ gap }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap }}>
                {Array.from({ length: 7 }).map((_, di) => {
                  const day = week.find((d) => d.dayOfWeek === di);
                  if (!day || !day.date) {
                    return <div key={`${wi}-${di}`} style={{ width: cellSize, height: cellSize }} />;
                  }

                  return (
                    <Tooltip key={`${wi}-${di}`}>
                      <TooltipTrigger>
                        <div
                          className={`rounded-sm ${checkedColor(day.checked)}`}
                          style={{ width: cellSize, height: cellSize }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p>{day.date}</p>
                        <p>{day.checked ? "已来访 ✓" : "未来访"}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </TooltipProvider>
      </div>

      {/* 图例 */}
      {!compact && (
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          <span>少</span>
          <div className="h-3 w-3 rounded-sm bg-white/5" />
          <div className="h-3 w-3 rounded-sm bg-emerald-500/30" />
          <div className="h-3 w-3 rounded-sm bg-emerald-500/50" />
          <div className="h-3 w-3 rounded-sm bg-emerald-500/70" />
          <span>多</span>
        </div>
      )}
    </div>
  );
}
