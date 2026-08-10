"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, BellRinging } from "@phosphor-icons/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NotificationInfo } from "@/types";

function formatRelativeTime(iso: string): string {
  const diffMin = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 60000
  );
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<NotificationInfo[]>([]);
  const [open, setOpen] = useState(false);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unreadOnly=true&limit=5");
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data.unreadCount ?? 0);
      setNotifications(data.notifications ?? []);
    } catch {
      // 静默失败
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(fetchUnread, 0);
    // 每 30 秒刷新一次未读数
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchUnread]);

  async function markAsRead(id: string) {
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      setUnread((prev) => Math.max(0, prev - 1));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch {
      // 静默
    }
  }

  const typeColor: Record<string, string> = {
    reminder: "bg-[#d7ef83]",
    analysis: "bg-[#d7ef83]/70",
    report: "bg-[#d7ef83]/50",
    encouragement: "bg-[#d7ef83]/60",
    system: "bg-white/30",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="relative flex items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/20 hover:text-white">
        {unread > 0 ? (
          <BellRinging className="h-4 w-4 text-[#d7ef83]" weight="fill" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d7ef83] px-1 text-[10px] font-bold text-[#051612] leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 rounded-xl border border-white/10 bg-[#0a1a15]/98 p-0 shadow-2xl backdrop-blur-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-white">通知</span>
          {unread > 0 && (
            <span className="rounded-full bg-[#d7ef83]/15 px-2 py-0.5 text-[11px] font-medium text-[#d7ef83]">
              {unread} 条未读
            </span>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Bell className="h-8 w-8 text-white/10" />
            <p className="mt-3 text-xs text-white/25">暂无通知</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[320px]">
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) markAsRead(n.id);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${typeColor[n.type] ?? "bg-white/30"} ${!n.read ? "ring-2 ring-[#d7ef83]/30" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] line-clamp-1 ${!n.read ? "text-white font-medium" : "text-white/50"}`}>
                      {n.title}
                    </p>
                    {n.content && (
                      <p className="mt-0.5 text-[11px] text-white/35 line-clamp-1">{n.content}</p>
                    )}
                    <p className="mt-1 text-[10px] text-white/20">{formatRelativeTime(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}
          </ScrollArea>
        )}

        <div className="border-t border-white/5 px-4 py-2.5">
          <p className="text-center text-[11px] text-white/30 py-1">
            💡 通知中心已集成到右下角 AI 伙伴面板
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
