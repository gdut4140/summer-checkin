"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CaretDown,
  CaretUp,
  ClockCounterClockwise,
  GitBranch,
  Lightning,
  Target,
  Timer,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { DecisionInfo, DecisionType } from "@/types";

// ---- Config ----

const typeConfig: Record<
  DecisionType,
  { icon: typeof GitBranch; label: string; color: string; bg: string }
> = {
  PLAN_ADJUST: { icon: GitBranch, label: "计划调整", color: "text-emerald-400", bg: "bg-emerald-500/12" },
  REMINDER: { icon: Timer, label: "提醒", color: "text-amber-400", bg: "bg-amber-500/12" },
  ANALYSIS: { icon: Lightning, label: "分析", color: "text-blue-400", bg: "bg-blue-500/12" },
  TASK_CREATE: { icon: Target, label: "新建任务", color: "text-[#d7ef83]", bg: "bg-[#d7ef83]/12" },
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    const typeParam = filter !== "all" ? `&type=${filter}` : "";
    fetch(`/api/agent/decisions?limit=50${typeParam}&includeStats=false`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setDecisions(data.decisions ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error("加载记录失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const grouped = groupByDate(decisions);

  // ---- Loading ----
  if (loading && decisions.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {filterTypes.map((f) => (
            <Skeleton key={f.key} className="h-7 w-16 rounded-full" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <ClockCounterClockwise className="size-4 text-primary" weight="fill" />
          活动记录
        </h2>
        {decisions.length > 0 && (
          <span className="text-[11px] text-muted-foreground">共 {decisions.length} 条</span>
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

      {/* 时间线 */}
      {decisions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-white/[0.04]">
            <ClockCounterClockwise className="size-4 text-muted-foreground/60" />
          </div>
          <h3 className="mt-3 text-[13px] font-medium text-foreground">暂无活动记录</h3>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            AI 教练运行后，每次决策会自动记录在这里
          </p>
        </div>
      ) : (
        <div className="relative pl-4">
          {/* 时间线竖线 */}
          <div className="absolute bottom-1.5 left-[7px] top-1.5 w-px bg-white/[0.08]" />

          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel} className="mb-5 last:mb-0">
              {/* 日期标签 */}
              <div className="mb-2 flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-primary/60 ring-2 ring-[#0c1f19]" />
                <span className="text-[11px] font-medium text-muted-foreground">{dateLabel}</span>
              </div>

              {/* 记录 */}
              <div className="flex flex-col gap-2 pl-4">
                {items.map((decision) => {
                  const tConfig = typeConfig[decision.type] ?? typeConfig.ANALYSIS;
                  const TypeIcon = tConfig.icon;

                  const isExpanded = expanded.has(decision.id);
                  const action = decision.action as Record<string, unknown> | null;
                  const actionKeys = action
                    ? Object.keys(action).filter((k) => k !== "planId" && k !== "planName")
                    : [];
                  const hasDetails = actionKeys.length > 0;
                  const planId = (action?.planId as string) || (action?.plan_id as string);

                  return (
                    <div
                      key={decision.id}
                      onClick={() => toggleExpand(decision.id)}
                      className="cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${tConfig.bg} ${tConfig.color}`}
                        >
                          <TypeIcon className="size-3.5" weight="fill" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[11px] font-semibold ${tConfig.color}`}>
                              {tConfig.label}
                            </span>
                            <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                              {new Date(decision.createdAt).toLocaleString("zh-CN", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">
                            {decision.reason}
                          </p>

                          {/* 展开详情 */}
                          {isExpanded && (
                            <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
                              {planId && (
                                <a
                                  href={`/plans/${planId}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex w-fit items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                                >
                                  查看计划 <ArrowUpRight className="size-3" />
                                </a>
                              )}
                              {actionKeys.map((key) => {
                                const val = action?.[key];
                                if (val == null || val === "") return null;
                                if (typeof val === "object") {
                                  return (
                                    <div key={key} className="rounded-lg bg-white/[0.03] px-3 py-2.5">
                                      <p className="mb-1 text-[11px] text-muted-foreground/60">{key}</p>
                                      <pre className="whitespace-pre-wrap font-sans text-[11px] text-foreground/60">
                                        {JSON.stringify(val, null, 2)}
                                      </pre>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={key} className="rounded-lg bg-white/[0.03] px-3 py-2.5">
                                    <p className="mb-0.5 text-[11px] text-muted-foreground/60">{key}</p>
                                    <p className="text-xs text-foreground/70">{String(val)}</p>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {hasDetails && (
                          <span className="mt-0.5 shrink-0 text-muted-foreground/50">
                            {isExpanded ? <CaretUp className="size-3.5" /> : <CaretDown className="size-3.5" />}
                          </span>
                        )}
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
