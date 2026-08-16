"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  BellRinging,
  ChartBar,
  Envelope,
  EnvelopeOpen,
  Fire,
  Gear,
  Newspaper,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";
import type { NotificationInfo, NotificationType } from "@/types";

// ---- Config ----

const typeConfig: Record<
  NotificationType,
  { icon: typeof Bell; label: string; color: string; bg: string }
> = {
  reminder: { icon: BellRinging, label: "提醒", color: "text-amber-400", bg: "bg-amber-500/12" },
  analysis: { icon: ChartBar, label: "分析", color: "text-blue-400", bg: "bg-blue-500/12" },
  report: { icon: Newspaper, label: "报告", color: "text-emerald-400", bg: "bg-emerald-500/12" },
  encouragement: { icon: Fire, label: "鼓励", color: "text-orange-400", bg: "bg-orange-500/12" },
  system: { icon: Gear, label: "系统", color: "text-muted-foreground", bg: "bg-white/[0.06]" },
};

const filterTypes: { key: NotificationType | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "reminder", label: "提醒" },
  { key: "analysis", label: "分析" },
  { key: "report", label: "报告" },
  { key: "encouragement", label: "鼓励" },
  { key: "system", label: "系统" },
];

// ---- Main Component ----

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NotificationType | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const typeParam = filter !== "all" ? `&type=${filter}` : "";
    fetch(`/api/notifications?limit=50${typeParam}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setNotifications(data.notifications ?? []);
          setUnreadCount(data.unreadCount ?? 0);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("加载通知失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  async function markAsRead(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      toast.error("操作失败");
    }
  }

  async function markAllAsRead() {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
        toast.success("已全部标记为已读");
      }
    } catch {
      toast.error("操作失败");
    }
  }

  async function deleteOne(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (res.ok) {
        const removed = notifications.find((n) => n.id === id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (removed && !removed.read) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
        if (expandedId === id) setExpandedId(null);
        toast.success("已删除");
      }
    } catch {
      toast.error("删除失败");
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
    const notification = notifications.find((n) => n.id === id);
    if (notification && !notification.read) {
      markAsRead(id);
    }
  }

  // ---- Loading ----
  if (loading && notifications.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {filterTypes.slice(0, 4).map((f) => (
            <Skeleton key={f.key} className="h-7 w-14 rounded-full" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="flex flex-col gap-3">
      {/* 头部 */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <Bell className="size-4 text-primary" weight="fill" />
          通知中心
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary">
              {unreadCount}
            </span>
          )}
        </h2>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <EnvelopeOpen className="size-3" />
            全部已读
          </button>
        )}
      </div>

      {/* 类型筛选 */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {filterTypes.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-white/[0.04]">
            <Envelope className="size-4 text-muted-foreground/60" />
          </div>
          <h3 className="mt-3 text-[13px] font-medium text-foreground">暂无通知</h3>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            {filter !== "all"
              ? "当前筛选条件下没有通知"
              : "AI 教练会在分析你的学习数据后生成通知"}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((notification) => {
            const config = typeConfig[notification.type] ?? typeConfig.system;
            const Icon = config.icon;
            const isExpanded = expandedId === notification.id;
            const isReport = notification.type === "report";

            return (
              <div
                key={notification.id}
                className={`rounded-xl border transition-colors ${
                  !notification.read
                    ? "border-white/[0.1] bg-white/[0.04]"
                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(notification.id)}
                  className="w-full px-3.5 py-3 text-left"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${config.bg} ${config.color}`}
                    >
                      <Icon className="size-3.5" weight={notification.read ? "regular" : "fill"} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {notification.title}
                        </span>
                        {!notification.read && (
                          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>

                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`text-[11px] font-medium ${config.color}`}>{config.label}</span>
                        <span className="text-[11px] text-muted-foreground/70 tabular-nums">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </div>

                      {!isExpanded && (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                          {isReport
                            ? notification.content.replace(/^#.*$/m, "").trim().slice(0, 120)
                            : notification.content.slice(0, 120)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 展开内容 */}
                  {isExpanded && (
                    <div
                      className="mt-3 border-t border-white/[0.06] pt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isReport ? (
                        <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_h1]:font-bold [&_h2]:font-semibold [&_p]:text-xs [&_li]:text-xs">
                          <ReactMarkdown>{notification.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                          {notification.content}
                        </p>
                      )}
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => deleteOne(notification.id)}
                        >
                          <Trash className="size-3" />
                          删除
                        </button>
                      </div>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(date);
}
