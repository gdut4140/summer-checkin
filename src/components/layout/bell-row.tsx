"use client";

import { cn } from "@/lib/utils";

/** 相对时间（通知和公告列表共用同一套口径） */
export function formatRelativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

/**
 * 铃铛面板里的一行 —— 通知列表和公告列表共用，两处结构完全一致：
 * 圆点 / 标题 / 摘要 / 时间。
 */
export function BellRow({
  dot,
  glow = false,
  highlight = false,
  title,
  preview,
  time,
  onClick,
}: {
  /** 圆点的颜色类，例如 "bg-primary" */
  dot: string;
  /** 圆点带主色光晕（未读通知、全部公告） */
  glow?: boolean;
  /** 标题用正文色 + 中等字重；否则是已读的淡化样式 */
  highlight?: boolean;
  title: string;
  preview?: string;
  time: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full overflow-hidden text-left px-4 py-3 transition-colors hover:bg-primary/8"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-1.5 size-2 shrink-0 rounded-full", dot)}
          style={
            glow
              ? {
                  boxShadow:
                    "0 0 8px color-mix(in srgb, var(--primary) 55%, transparent)",
                }
              : undefined
          }
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[13px]",
              highlight
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            {title}
          </p>
          {preview && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
              {preview}
            </p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground/50">{time}</p>
        </div>
      </div>
    </button>
  );
}
