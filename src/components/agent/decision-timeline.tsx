"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ClockCounterClockwise,
  GitBranch,
  Lightning,
  Target,
  Timer,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { DecisionInfo, DecisionType } from "@/types";

// ---- Config ----

const typeConfig: Record<
  DecisionType,
  { icon: typeof GitBranch; label: string; color: string }
> = {
  PLAN_ADJUST: { icon: GitBranch, label: "计划调整", color: "text-violet-400" },
  REMINDER: { icon: Timer, label: "提醒", color: "text-amber-400" },
  ANALYSIS: { icon: Lightning, label: "分析", color: "text-blue-400" },
  TASK_CREATE: { icon: Target, label: "新建任务", color: "text-emerald-400" },
};

const filterTypes: { key: DecisionType | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "PLAN_ADJUST", label: "计划调整" },
  { key: "TASK_CREATE", label: "新建任务" },
  { key: "REMINDER", label: "提醒" },
  { key: "ANALYSIS", label: "分析" },
];

// ---- Main Component ----

export function DecisionTimeline() {
  const [decisions, setDecisions] = useState<DecisionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DecisionType | "all">("all");

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = filter !== "all" ? `&type=${filter}` : "";
      const res = await fetch(
        `/api/agent/decisions?limit=50${typeParam}&includeStats=false`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDecisions(data.decisions ?? []);
    } catch {
      toast.error("加载记录失败");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  const grouped = groupByDate(decisions);

  // ---- Loading ----
  if (loading && decisions.length === 0) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="flex gap-2">
          {filterTypes.map((f) => (
            <Skeleton key={f.key} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-3 w-3 rounded-full mt-1.5 shrink-0" />
              <div className="flex-1 glass-panel rounded-xl px-4 py-4">
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* ── 头部 ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ClockCounterClockwise className="h-5 w-5 text-primary" weight="fill" />
          活动记录
        </h2>
        {decisions.length > 0 && (
          <span className="text-xs text-muted-foreground">
            共 {decisions.length} 条
          </span>
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

      {/* ── 时间线 ── */}
      {decisions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ClockCounterClockwise className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">暂无活动记录</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            AI 教练运行后，每次决策会自动记录在这里
          </p>
        </div>
      ) : (
        <div className="relative pl-8">
          {/* 时间线竖线 */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border/60" />

          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel} className="mb-6">
              {/* 日期标签 */}
              <div className="flex items-center gap-3 mb-3 -ml-8">
                <div className="h-2.5 w-2.5 rounded-full bg-primary/60 ring-4 ring-background" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {dateLabel}
                </span>
              </div>

              {/* 记录卡片 */}
              <div className="space-y-2">
                {items.map((decision) => {
                  const tConfig =
                    typeConfig[decision.type] ?? typeConfig.ANALYSIS;
                  const TypeIcon = tConfig.icon;

                  return (
                    <div
                      key={decision.id}
                      className="glass-panel rounded-xl px-4 py-3 transition-all hover:scale-[1.005]"
                    >
                      <div className="flex items-start gap-3">
                        {/* 类型图标 */}
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <TypeIcon
                            className={`h-4 w-4 ${tConfig.color}`}
                            weight="fill"
                          />
                        </div>

                        {/* 内容 */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${tConfig.color} border-current/20`}
                            >
                              {tConfig.label}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium">
                            {decision.reason}
                          </p>
                          {(() => {
                            const action = decision.action as Record<string, string> | null;
                            const detail = action?.detail ?? action?.message;
                            if (!detail || Object.keys(decision.action).length === 0) return null;
                            return (
                              <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
                                <p className="text-xs text-muted-foreground">{detail}</p>
                              </div>
                            );
                          })()}
                          <p className="mt-1.5 text-[10px] text-muted-foreground">
                            {new Date(decision.createdAt).toLocaleString(
                              "zh-CN",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

function groupByDate(items: DecisionInfo[]): Record<string, DecisionInfo[]> {
  const groups: Record<string, DecisionInfo[]> = {};
  const now = new Date();

  for (const item of items) {
    const date = new Date(item.createdAt);
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / 86400000
    );

    let label: string;
    if (diffDays === 0) label = "今天";
    else if (diffDays === 1) label = "昨天";
    else if (diffDays < 7) label = `${diffDays}天前`;
    else
      label = new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
      }).format(date);

    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }

  return groups;
}
