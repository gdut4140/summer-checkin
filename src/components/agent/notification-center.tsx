"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellRinging,
  CalendarCheck,
  ChartBar,
  CheckCircle,
  Envelope,
  EnvelopeOpen,
  Fire,
  Gear,
  Info,
  Lightbulb,
  Megaphone,
  Newspaper,
  Sparkle,
  Trash,
  Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import type { NotificationInfo, NotificationType } from "@/types";

// ---- Config ----

const typeConfig: Record<
  NotificationType,
  { icon: typeof Bell; label: string; color: string }
> = {
  reminder: { icon: BellRinging, label: "提醒", color: "text-amber-400" },
  analysis: { icon: ChartBar, label: "分析", color: "text-blue-400" },
  report: { icon: Newspaper, label: "报告", color: "text-emerald-400" },
  encouragement: { icon: Fire, label: "鼓励", color: "text-orange-400" },
  system: { icon: Gear, label: "系统", color: "text-muted-foreground" },
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
  const [total, setTotal] = useState(0);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = filter !== "all" ? `&type=${filter}` : "";
      const res = await fetch(`/api/notifications?limit=50${typeParam}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setTotal(data.total ?? 0);
    } catch {
      toast.error("加载通知失败");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

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
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="flex gap-2">
          {filterTypes.map((f) => (
            <Skeleton key={f.key} className="h-8 w-16 rounded-full" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-xl px-4 py-4">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* ── 头部操作栏 ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" weight="fill" />
            通知中心
          </h2>
          {unreadCount > 0 && (
            <Badge className="bg-primary text-primary-foreground text-[11px] px-2">
              {unreadCount} 未读
            </Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs gap-1.5">
            <EnvelopeOpen className="h-3.5 w-3.5" />
            全部已读
          </Button>
        )}
      </div>

      {/* ── 类型筛选 ── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {filterTypes.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
              filter === f.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── 通知列表 ── */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Envelope className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">暂无通知</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            {filter !== "all"
              ? "当前筛选条件下没有通知"
              : "AI 教练会在分析你的学习数据后生成通知"}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[560px]">
          <div className="space-y-2 pr-2">
            {notifications.map((notification) => {
              const config = typeConfig[notification.type] ?? typeConfig.system;
              const Icon = config.icon;
              const isExpanded = expandedId === notification.id;
              const isReport = notification.type === "report";

              return (
                <div
                  key={notification.id}
                  className={`glass-panel rounded-xl transition-all ${
                    !notification.read
                      ? "border-primary/30 ring-1 ring-primary/10"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(notification.id)}
                    className="w-full text-left px-4 py-3.5"
                  >
                    <div className="flex items-start gap-3">
                      {/* 图标 */}
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          notification.read ? "bg-muted" : "bg-primary/10"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${config.color}`}
                          weight={notification.read ? "regular" : "fill"}
                        />
                      </div>

                      {/* 内容 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold truncate">
                            {notification.title}
                          </span>
                          {!notification.read && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        {!isExpanded && (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {isReport
                              ? notification.content.replace(/^#.*$/m, "").trim().slice(0, 120)
                              : notification.content.slice(0, 120)}
                          </p>
                        )}
                      </div>

                      {/* 时间 + 操作 */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${config.color} border-current/20`}
                        >
                          {config.label}
                        </Badge>
                      </div>
                    </div>

                    {/* 展开内容 */}
                    {isExpanded && (
                      <div
                        className="mt-3 pt-3 border-t border-border/50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isReport ? (
                          <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-xs [&_h1]:font-bold [&_h2]:font-semibold [&_p]:text-xs [&_li]:text-xs">
                            <ReactMarkdown>{notification.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                            {notification.content}
                          </p>
                        )}
                        <div className="flex justify-end gap-2 mt-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteOne(notification.id)}
                          >
                            <Trash className="h-3 w-3" />
                            删除
                          </Button>
                        </div>
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
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
