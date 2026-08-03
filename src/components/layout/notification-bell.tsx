"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell, BellRinging } from "@phosphor-icons/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
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
    fetchUnread();
    // 每 30 秒刷新一次未读数
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
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

  const typeEmoji: Record<string, string> = {
    reminder: "⏰",
    analysis: "📊",
    report: "📋",
    encouragement: "💬",
    system: "⚙️",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="relative flex items-center justify-center rounded-md border border-white/20 bg-white/10 p-2 text-white/70 backdrop-blur-sm transition-all hover:bg-white/18 hover:text-white">
        {unread > 0 ? (
          <BellRinging className="h-4 w-4" weight="fill" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0 backdrop-blur-xl bg-background/95 border-white/15"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="text-sm font-semibold">消息通知</span>
          {unread > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {unread} 条未读
            </span>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center px-4">
            <Bell className="h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">暂无通知</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[320px]">
            <div className="divide-y divide-border/40">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.read) markAsRead(n.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-muted/40 ${
                    !n.read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-sm shrink-0 mt-0.5">
                      {typeEmoji[n.type] ?? "📌"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium line-clamp-1 ${
                            !n.read ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {n.title}
                        </span>
                        {!n.read && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
                        {n.content}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground/60">
                        {formatRelativeTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="border-t border-border/50 px-4 py-2">
          <Link
            href="/agent"
            onClick={() => setOpen(false)}
            className="block text-center text-xs text-primary hover:underline py-1"
          >
            查看全部 →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
