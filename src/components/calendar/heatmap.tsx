"use client";

import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function checkedColor(checked: boolean, level?: 1 | 2 | 3): { cls: string; style?: React.CSSProperties } {
  // 未打卡：统一灰底（没有数据的「洞」也用这个，避免点阵破洞）
  if (!checked) return { cls: "bg-white/5" };

  // 已打卡：用 CSS 变量直接读 theme-primary，雪景切冰蓝/雨林切墨绿自动生效
  // level 支持 1/2/3/full 4 档浓度（图例用，日常数据按 checked=true 默认 full）
  const opacity = level === 1 ? 0.22 : level === 2 ? 0.45 : level === 3 ? 0.7 : 1;
  return {
    cls: "",
    style: {
      backgroundColor: `color-mix(in oklab, var(--theme-primary) ${Math.round(opacity * 100)}%, transparent)`,
    },
  };
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
                  // 无论有没有这一天（月初/月末缺口）都渲染与未打卡一致的灰圈，消除点阵「破洞」
                  if (!day || !day.date) {
                    return (
                      <div
                        key={`${wi}-${di}`}
                        className={`rounded-sm bg-white/5`}
                        style={{ width: cellSize, height: cellSize }}
                      />
                    );
                  }

                  const { cls, style } = checkedColor(day.checked);
                  return (
                    <Tooltip key={`${wi}-${di}`}>
                      <TooltipTrigger>
                        <div
                          className={`rounded-sm ${cls}`}
                          style={{ width: cellSize, height: cellSize, ...style }}
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
          <div
            className="h-3 w-3 rounded-sm"
            style={checkedColor(true, 1).style}
          />
          <div
            className="h-3 w-3 rounded-sm"
            style={checkedColor(true, 2).style}
          />
          <div
            className="h-3 w-3 rounded-sm"
            style={checkedColor(true, 3).style}
          />
          <span>多</span>
        </div>
      )}
    </div>
  );
}
