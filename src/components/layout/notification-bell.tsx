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
import { Dialog, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DetailCard } from "@/components/layout/detail-card";
import { AnnouncementList } from "@/components/layout/announcement-list";
import { BellRow, formatRelativeTime } from "@/components/layout/bell-row";
import type { NotificationInfo, NotificationType } from "@/types";

/** 面板顶部的两个页签 */
const TABS = [
  { key: "notifications", label: "通知" },
  { key: "announcements", label: "公告" },
] as const;

const typeMeta: Record<
  NotificationType,
  { icon: typeof Bell; label: string }
> = {
  reminder: { icon: BellRinging, label: "提醒" },
  analysis: { icon: ChartBar, label: "分析" },
  report: { icon: Newspaper, label: "报告" },
  encouragement: { icon: Fire, label: "鼓励" },
  system: { icon: Gear, label: "系统" },
};

export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<NotificationInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<NotificationInfo | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("notifications");

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
          <div
            role="tablist"
            className="flex items-center gap-1 border-b border-foreground/8 px-2"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`relative flex items-center gap-1.5 px-2.5 py-3 text-[13px] font-medium transition-colors ${
                  tab === t.key
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/80"
                }`}
              >
                {t.label}
                {t.key === "notifications" && unread > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary tabular-nums">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
                {tab === t.key && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>

          {tab === "announcements" ? (
            <AnnouncementList />
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30" />
              <p className="mt-3 text-xs text-muted-foreground">暂无通知</p>
            </div>
          ) : (
            // 普通滚动容器：在弹层内部滚动，不撑高整个弹层/页面
            <div className="max-h-[360px] overflow-y-auto overflow-x-hidden">
              {notifications.map((n) => (
                <BellRow
                  key={n.id}
                  dot={typeColor[n.type] ?? "bg-foreground/30"}
                  glow={!n.read}
                  highlight={!n.read}
                  title={n.title}
                  preview={n.content}
                  time={formatRelativeTime(n.createdAt)}
                  onClick={() => {
                    if (!n.read) markAsRead(n.id);
                    setOpen(false);
                    setViewing(n);
                  }}
                />
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* 弹窗查看完整通知 —— 与公告共用同一个 DetailCard 外壳 */}
      <Dialog
        open={viewing !== null}
        onOpenChange={(next) => {
          if (!next) setViewing(null);
        }}
      >
        {viewing &&
          (() => {
            const meta = typeMeta[viewing.type] ?? typeMeta.system;
            return (
              <DetailCard
                icon={meta.icon}
                eyebrow={meta.label}
                title={viewing.title}
                meta={formatRelativeTime(viewing.createdAt)}
                content={viewing.content}
                // 只有报告是 Markdown；其余是纯文本，解析反而会把 * # 之类吃掉
                markdown={viewing.type === "report"}
                action={
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void deleteNotification(viewing.id)}
                    >
                      <Trash className="size-3.5" />
                      删除
                    </Button>
                    <DialogClose
                      render={
                        <button type="button" className="btn-sticker flex-1" />
                      }
                    >
                      知道了
                    </DialogClose>
                  </div>
                }
              />
            );
          })()}
      </Dialog>
    </>
  );
}