"use client";

import { useState } from "react";
import { ClockCountdown, Fire, TrendUp } from "@phosphor-icons/react";

export interface FocusDay {
  date: string;
  weekday: string;
  minutes: number;
  isToday: boolean;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}

function formatCompactDuration(minutes: number) {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = minutes / 60;
  if (hours < 100) return `${Number(hours.toFixed(hours < 10 ? 1 : 0))}小时`;
  if (hours < 1000) return `${Math.round(hours)}小时`;
  return `${Number((hours / 1000).toFixed(1))}k小时`;
}

function formatCompactCount(count: number) {
  return new Intl.NumberFormat("zh-CN", {
    notation: count >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(count);
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function FocusDurationChart({
  days,
  totalMinutes,
  sessionCount,
}: {
  days: FocusDay[];
  totalMinutes: number;
  sessionCount: number;
}) {
  const todayMinutes = days.find((day) => day.isToday)?.minutes ?? 0;
  const weekMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
  const maxMinutes = Math.max(...days.map((day) => day.minutes), 60);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <section className="product-panel overflow-hidden">
      <div className="grid grid-cols-12 items-stretch gap-0">
        <div className="col-span-3 flex min-w-0 flex-col justify-center px-5 py-5 md:px-6">
          <div className="flex items-center gap-2 text-primary">
            <ClockCountdown className="size-4" weight="duotone" />
            <p className="text-xs font-medium">累计专注</p>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-foreground">番茄钟时间轨迹</h2>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground/55">
            完整结束后自动累计
          </p>
        </div>

        <div className="col-span-5 min-w-0 border-t border-border/20 px-4 py-3 lg:border-l lg:border-t-0 lg:px-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] text-muted-foreground/45">最近 7 天</span>
              <span className="ml-2 text-[10px] tabular-nums text-foreground/60">
                今天 {formatCompactDuration(todayMinutes)}
              </span>
            </div>
            <span className="shrink-0 text-[9px] text-muted-foreground/30">自适应刻度</span>
          </div>

          <div className="grid h-[80px] grid-cols-7 gap-1.5" aria-label="最近七天专注时长迷你柱状图">
            {days.map((day, idx) => {
              const height = day.minutes === 0 ? 3 : Math.max(10, Math.round((day.minutes / maxMinutes) * 100));
              const isHover = hoverIdx === idx;
              return (
                <div
                  key={day.date}
                  className="group relative flex min-w-0 flex-col items-center"
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  {/* 自定义主题 Tooltip */}
                  {isHover && (
                    <div className="pointer-events-none absolute bottom-full z-20 mb-2 whitespace-nowrap rounded-lg border border-border/50 bg-popover/95 px-3 py-1.5 text-[11px] shadow-lg shadow-black/20 backdrop-blur-md">
                      <span className="text-muted-foreground/70">{formatDate(day.date)}</span>
                      <span className="mx-1.5 text-muted-foreground/40">·</span>
                      <span className="font-semibold text-foreground">{formatDuration(day.minutes)}</span>
                      {/* 小箭头 */}
                      <span className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-x-[5px] border-t-[5px] border-x-transparent border-t-border/50" />
                    </div>
                  )}
                  <div className="relative flex min-h-0 w-full flex-1 items-end overflow-hidden bg-black/[0.07]">
                    <div
                      className={`w-full transition-[height,opacity] duration-500 ${
                        day.isToday
                          ? "bg-primary"
                          : day.minutes > 0
                            ? "bg-primary/50 group-hover:bg-primary/80"
                            : "bg-primary/10"
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className={`mt-1 text-[9px] transition-colors ${day.isToday ? "font-medium text-primary" : isHover ? "text-foreground/60" : "text-muted-foreground/35"}`}>
                    {day.weekday}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="col-span-4 grid grid-cols-3 border-t border-border/20 lg:border-l lg:border-t-0">
          <Metric label="累计" value={formatCompactDuration(totalMinutes)} fullValue={formatDuration(totalMinutes)} icon={TrendUp} />
          <Metric label="本周" value={formatCompactDuration(weekMinutes)} fullValue={formatDuration(weekMinutes)} icon={Fire} />
          <Metric label="番茄" value={`${formatCompactCount(sessionCount)}次`} fullValue={`${sessionCount} 次完整番茄`} icon={ClockCountdown} />
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  fullValue,
  icon: Icon,
}: {
  label: string;
  value: string;
  fullValue: string;
  icon: typeof ClockCountdown;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex min-w-0 flex-col items-center justify-center border-l border-border/20 px-4 py-6 text-center first:border-l-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 自定义 Tooltip */}
      {hovered && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border/50 bg-popover/95 px-3 py-1.5 text-[11px] shadow-lg shadow-black/20 backdrop-blur-md">
          <span className="font-medium text-foreground">{fullValue}</span>
          <span className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-x-[5px] border-t-[5px] border-x-transparent border-t-border/50" />
        </div>
      )}
      <Icon className="size-5 text-primary/80" weight="duotone" />
      <p
        className="mt-2.5 max-w-full truncate text-base font-semibold tabular-nums text-foreground/95"
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground/55">{label}</p>
    </div>
  );
}
