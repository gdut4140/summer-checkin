"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  CalendarCheck,
  ChartLine,
  Clock,
  Fire,
  Lightning,
  Play,
  Spinner,
  Target,
  TrendDown,
  TrendUp,
  Warning,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ---- Types ----

interface FindingItem {
  category: string;
  severity: "info" | "warning" | "critical";
  detail: string;
}

interface CoachData {
  status: "loading" | "ready" | "error";
  todayHours: number;
  weekHours: number;
  streak: number;
  completionRate: number;
  agentSummary: string | null;
  agentStatus: string | null; // on_track | need_attention | need_adjustment | at_risk
  findings: FindingItem[];
}

// ---- Config ----

const severityConfig: Record<
  string,
  { icon: typeof Warning; color: string; bg: string; label: string }
> = {
  critical: {
    icon: Warning,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    label: "严重",
  },
  warning: {
    icon: TrendDown,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    label: "警告",
  },
  info: {
    icon: ChartLine,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    label: "提示",
  },
};

const statusDisplay: Record<
  string,
  { emoji: string; label: string; color: string; bg: string }
> = {
  on_track: {
    emoji: "✅",
    label: "进展顺利",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  need_attention: {
    emoji: "⚠️",
    label: "需要关注",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  need_adjustment: {
    emoji: "🔧",
    label: "需要调整",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20",
  },
  at_risk: {
    emoji: "🚨",
    label: "有风险",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
};

// ---- Stat Card ----

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  trend,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | null;
}) {
  return (
    <div className="glass-panel rounded-xl px-4 py-4 flex items-center gap-4 transition-all hover:scale-[1.02] hover:shadow-lg">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
        <Icon className="h-5 w-5 text-primary" weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span className="text-xl font-bold tabular-nums">{value}</span>
          {unit && (
            <span className="text-sm text-muted-foreground">{unit}</span>
          )}
          {trend === "up" && (
            <TrendUp className="h-4 w-4 text-emerald-400" weight="fill" />
          )}
          {trend === "down" && (
            <TrendDown className="h-4 w-4 text-red-400" weight="fill" />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main Component ----

export function CoachOverview() {
  const [data, setData] = useState<CoachData>({
    status: "loading",
    todayHours: 0,
    weekHours: 0,
    streak: 0,
    completionRate: 0,
    agentSummary: null,
    agentStatus: null,
    findings: [],
  });
  const [running, setRunning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/runs");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      const runs = json.runs ?? [];

      // 找最近一次完成的 daily/coach 运行
      const latestAnalysis = runs.find(
        (r: { mode: string; status: string }) =>
          (r.mode === "daily" || r.mode === "coach") &&
          r.status === "completed"
      );

      let findings: FindingItem[] = [];
      let agentSummary: string | null = null;
      let agentStatus: string | null = null;
      let todayHours = 0;
      let weekHours = 0;
      let streak = 0;

      if (latestAnalysis) {
        try {
          const detailRes = await fetch(
            `/api/agent/runs/${latestAnalysis.id}`
          );
          if (detailRes.ok) {
            const detail = await detailRes.json();
            const run = detail.run;
            agentSummary = run.summary ?? null;

            // 从 approvals 提取 findings
            const analysisApprovals = (run.approvals ?? []).filter(
              (a: { action: string }) => a.action === "daily_analysis"
            );
            findings = analysisApprovals.map(
              (a: { payload: Record<string, unknown> }) => ({
                category: (a.payload?.category as string) ?? "info",
                severity: (a.payload?.severity as string) ?? "info",
                detail: (a.payload?.detail as string) ?? "",
              })
            );

            // 从 context step 提取 stats
            const contextStep = (run.steps ?? []).find(
              (s: { kind: string }) => s.kind === "context"
            );
            if (contextStep?.output?.stats) {
              todayHours = contextStep.output.stats.todayHours ?? 0;
              weekHours = contextStep.output.stats.weekHours ?? 0;
              streak = contextStep.output.stats.streak ?? 0;
            }

            // 从 analysis step 推断整体状态
            const analysisStep = (run.steps ?? []).find(
              (s: { kind: string }) => s.kind === "analysis"
            );
            if (analysisStep?.output?.status) {
              agentStatus = analysisStep.output.status as string;
            }
          }
        } catch {
          // 详情加载失败不影响
        }
      }

      setData({
        status: "ready",
        todayHours,
        weekHours,
        streak,
        completionRate: 0,
        agentSummary,
        agentStatus,
        findings,
      });
    } catch {
      setData((prev) => ({ ...prev, status: "error" }));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function triggerAgent() {
    setRunning(true);
    try {
      const res = await fetch("/api/agent/cron/daily");
      if (res.ok) {
        toast.success("AI 教练分析完成，刷新中…");
        await fetchData();
      } else {
        toast.error("分析触发失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setRunning(false);
    }
  }

  // ---- Loading ----
  if (data.status === "loading") {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-xl px-4 py-5">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  // ---- Error ----
  if (data.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Brain
          className="h-12 w-12 text-muted-foreground/40"
          weight="duotone"
        />
        <h3 className="mt-4 text-lg font-semibold">数据加载失败</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          请检查网络后重试
        </p>
        <Button variant="outline" className="mt-4" onClick={fetchData}>
          重新加载
        </Button>
      </div>
    );
  }

  // 从 findings 推断整体状态
  const hasCritical = data.findings.some((f) => f.severity === "critical");
  const hasWarning = data.findings.some((f) => f.severity === "warning");
  const overallStatus = data.agentStatus ??
    (hasCritical
      ? "at_risk"
      : hasWarning
        ? "need_attention"
        : "on_track");
  const statusInfo = statusDisplay[overallStatus] ?? statusDisplay.on_track;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── 头部 ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" weight="fill" />
            AI 学习教练
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.agentSummary ?? "点击「立即分析」让 AI 分析你的学习数据"}
          </p>
        </div>
        <Button
          onClick={triggerAgent}
          disabled={running}
          className="gap-2 shadow-lg shadow-primary/20"
        >
          {running ? (
            <Spinner className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" weight="fill" />
          )}
          {running ? "分析中…" : "立即分析"}
        </Button>
      </div>

      {/* ── 统计卡片 ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Clock}
          label="今日学习"
          value={data.todayHours}
          unit="小时"
        />
        <StatCard
          icon={CalendarCheck}
          label="本周累计"
          value={data.weekHours}
          unit="小时"
        />
        <StatCard
          icon={Fire}
          label="连续打卡"
          value={data.streak}
          unit="天"
        />
        <StatCard
          icon={Target}
          label="任务完成率"
          value={data.completionRate}
          unit="%"
          trend={
            data.completionRate >= 70
              ? "up"
              : data.completionRate > 0
                ? "down"
                : null
          }
        />
      </div>

      {/* ── 整体状态 + 分析发现 ── */}
      <div className="space-y-4">
        {/* 状态条 */}
        <div
          className={`rounded-2xl border p-5 ${statusInfo.bg} backdrop-blur-xl`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{statusInfo.emoji}</span>
            <div>
              <p className={`text-sm font-semibold ${statusInfo.color}`}>
                {statusInfo.label}
              </p>
              <p className="text-sm text-foreground/80 mt-0.5">
                {data.agentSummary ?? "AI 教练尚未运行，点击右上角按钮开始分析"}
              </p>
            </div>
          </div>
        </div>

        {/* 分析发现 */}
        {data.findings.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              分析发现
            </h3>
            {data.findings.map((finding, i) => {
              const config =
                severityConfig[finding.severity] ?? severityConfig.info;
              const Icon = config.icon;
              return (
                <div
                  key={i}
                  className={`rounded-xl border px-4 py-3 ${config.bg} backdrop-blur-xl transition-all hover:scale-[1.01]`}
                >
                  <div className="flex items-start gap-3">
                    <Icon
                      className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`}
                      weight="fill"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${config.color} border-current/30`}
                        >
                          {config.label}
                        </Badge>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {finding.category}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{finding.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 还没有分析过 */}
        {data.findings.length === 0 && !data.agentSummary && (
          <div className="glass-panel rounded-2xl border-dashed p-10 flex flex-col items-center text-center">
            <Lightning
              className="h-10 w-10 text-primary/30"
              weight="duotone"
            />
            <h3 className="mt-4 text-sm font-semibold">AI 教练待命中</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              AI 会分析你的学习数据（打卡、计划进度、任务完成率），
              发现隐藏问题并给出具体建议
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
