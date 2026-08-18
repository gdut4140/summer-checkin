"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Bell,
  BellRinging,
  ChartBar,
  Fire,
  Gear,
  Newspaper,
  Trash,
} from "@phosphor-icons/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import type { NotificationInfo, NotificationType } from "@/types";

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

const typeMeta: Record<
  NotificationType,
  { icon: typeof Bell; label: string; tint: string }
> = {
  reminder: { icon: BellRinging, label: "提醒", tint: "bg-primary/12 text-primary" },
  analysis: { icon: ChartBar, label: "分析", tint: "bg-primary/10 text-primary" },
  report: { icon: Newspaper, label: "报告", tint: "bg-primary/8 text-primary" },
  encouragement: { icon: Fire, label: "鼓励", tint: "bg-primary/14 text-primary" },
  system: { icon: Gear, label: "系统", tint: "bg-foreground/[0.06] text-muted-foreground" },
};

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<NotificationInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<NotificationInfo | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data.unreadCount ?? 0);
      setNotifications(data.notifications ?? []);
    } catch {
      // 静默失败
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(fetchNotifications, 0);
    // 每 30 秒刷新一次未读数
    const interval = setInterval(fetchNotifications, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchNotifications]);

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

  async function deleteNotification(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      const removed = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (removed && !removed.read) {
        setUnread((prev) => Math.max(0, prev - 1));
      }
      setViewing(null);
    } catch {
      // 静默
    }
  }

  const typeColor: Record<string, string> = {
    reminder: "bg-primary",
    analysis: "bg-primary/70",
    report: "bg-primary/50",
    encouragement: "bg-primary/60",
    system: "bg-foreground/30",
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="relative flex items-center justify-center rounded-lg border border-foreground/10 bg-foreground/[0.04] p-2 text-muted-foreground backdrop-blur-sm transition-all hover:bg-foreground/[0.08] hover:border-foreground/20 hover:text-foreground">
          {unread > 0 ? (
            <BellRinging className="h-4 w-4 text-primary" weight="fill" />
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
          className="w-80 rounded-xl border border-foreground/10 bg-background/98 p-0 shadow-2xl backdrop-blur-2xl"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold text-foreground">通知</span>
            {unread > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                {unread} 条未读
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30" />
              <p className="mt-3 text-xs text-muted-foreground">暂无通知</p>
            </div>
          ) : (
            // 普通滚动容器：在弹层内部滚动，不撑高整个弹层/页面
            <div className="max-h-[360px] overflow-y-auto overflow-x-hidden">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.read) markAsRead(n.id);
                    setOpen(false);
                    setViewing(n);
                  }}
                  className="block w-full overflow-hidden text-left px-4 py-3 transition-colors hover:bg-foreground/[0.04]"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${typeColor[n.type] ?? "bg-foreground/30"} ${!n.read ? "ring-2 ring-primary/30" : ""}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] ${!n.read ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {n.title}
                      </p>
                      {n.content && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{n.content}</p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground/50">{formatRelativeTime(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* 弹窗查看完整通知 */}
      <Dialog
        open={viewing !== null}
        onOpenChange={(next) => {
          if (!next) setViewing(null);
        }}
      >
        <DialogContent className="border border-foreground/10 bg-background/95 text-foreground backdrop-blur-xl sm:max-w-lg">
          {viewing &&
            (() => {
              const meta = typeMeta[viewing.type] ?? typeMeta.system;
              const Icon = meta.icon;
              return (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-2 pr-6">
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${meta.tint}`}
                      >
                        <Icon className="size-3.5" weight="fill" />
                      </span>
                      <DialogTitle className="text-[15px] leading-snug text-foreground">
                        {viewing.title}
                      </DialogTitle>
                    </div>
                    <div className="flex items-center gap-2 pl-9">
                      <span className={`text-[11px] font-medium ${meta.tint.split(" ")[1]}`}>{meta.label}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatRelativeTime(viewing.createdAt)}
                      </span>
                    </div>
                  </DialogHeader>

                  <div className="max-h-[50vh] overflow-y-auto pr-1 text-[13px] leading-relaxed">
                    {viewing.type === "report" ? (
                      <div className="prose prose-sm prose-invert max-w-none text-foreground/90 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_h1]:font-bold [&_h2]:font-semibold [&_p]:text-[13px] [&_li]:text-[13px]">
                        <ReactMarkdown>{viewing.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-foreground/85">{viewing.content}</p>
                    )}
                  </div>

                  <DialogFooter className="border-foreground/8 bg-foreground/[0.03]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-red-500"
                      onClick={() => void deleteNotification(viewing.id)}
                    >
                      <Trash className="size-3.5" />
                      删除
                    </Button>
                    <DialogClose render={<Button variant="outline" size="sm" />}>
                      关闭
                    </DialogClose>
                  </DialogFooter>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </>
  );
}