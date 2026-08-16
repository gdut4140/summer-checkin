"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  CalendarCheck,
  CheckCircle,
  Fire,
  Lightning,
  Play,
  Spinner,
  Target,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ---- Types ----

interface FindingItem {
  category: string;
  severity: "info" | "warning" | "critical";
  detail: string;
}

interface CoachData {
  status: "loading" | "loaded" | "error";
  activePlans: number;
  avgProgress: number;
  todayTasks: number;
  todayDone: number;
  streak: number;
  agentSummary: string | null;
  agentStatus: string | null;
  findings: FindingItem[];
}

interface RunListItem {
  id: string;
  mode: string;
  status: string;
}

interface RunContextOutput {
  stats?: { streak?: number };
  plans?: { progress?: number }[];
  pendingTasks?: { status?: string }[];
}

interface FindingPayload {
  category?: string;
  severity?: "info" | "warning" | "critical";
  detail?: string;
}

interface RunDetail {
  summary?: string | null;
  status?: string | null;
  steps?: { kind?: string; output?: RunContextOutput | null }[];
  approvals?: { action?: string; payload?: FindingPayload | null }[];
}

// ---- Config ----

const severityConfig: Record<
  string,
  { label: string; color: string; dot: string; bg: string }
> = {
  info: { label: "信息", color: "text-emerald-400", dot: "bg-emerald-400", bg: "bg-emerald-500/10" },
  warning: { label: "注意", color: "text-amber-400", dot: "bg-amber-400", bg: "bg-amber-500/10" },
  critical: { label: "关键", color: "text-red-400", dot: "bg-red-400", bg: "bg-red-500/10" },
};

const statusMap: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  on_track: { emoji: "✓", label: "运行良好", color: "text-emerald-400", bg: "bg-emerald-500/15" },
  need_attention: { emoji: "!", label: "需要关注", color: "text-amber-400", bg: "bg-amber-500/15" },
  need_adjustment: { emoji: "…", label: "需要调整", color: "text-orange-400", bg: "bg-orange-500/15" },
  at_risk: { emoji: "!", label: "有风险", color: "text-red-400", bg: "bg-red-500/15" },
};
function getStatus(s: string) {
  return statusMap[s] ?? statusMap.on_track;
}

// ---- Main ----

export function CoachOverview() {
  const [data, setData] = useState<CoachData>({
    status: "loading",
    activePlans: 0,
    avgProgress: 0,
    todayTasks: 0,
    todayDone: 0,
    streak: 0,
    agentSummary: null,
    agentStatus: null,
    findings: [],
  });
  const [running, setRunning] = useState(false);

  const loadCoachData = useCallback(async (): Promise<CoachData> => {
    const res = await fetch("/api/agent/runs");
    if (!res.ok) throw new Error("Failed");
    const json = (await res.json()) as { runs: RunListItem[] };
    const runs = json.runs ?? [];
    const latest = runs.find(
      (r) => (r.mode === "daily" || r.mode === "coach") && r.status === "completed"
    );

    let findings: FindingItem[] = [],
      summary: string | null = null,
      status: string | null = null,
      st = 0,
      activePlans = 0,
      avgProgress = 0,
      todayTasks = 0,
      todayDone = 0;

    if (latest) {
      const dr = await fetch(`/api/agent/runs/${latest.id}`);
      if (dr.ok) {
        const dd = (await dr.json()) as RunDetail;
        summary = dd.summary ?? null;
        status = dd.status ?? null;
        const ctx = dd.steps?.find((s) => s.kind === "context");
        if (ctx?.output) {
          st = ctx.output.stats?.streak ?? 0;
          const plans = ctx.output.plans ?? [];
          activePlans = plans.length;
          avgProgress =
            plans.length > 0
              ? Math.round(plans.reduce((s, p) => s + (p.progress ?? 0), 0) / plans.length)
              : 0;
          const tasks = ctx.output.pendingTasks ?? [];
          todayTasks = tasks.length;
          todayDone = tasks.filter((t) => t.status === "done").length;
        }
        findings = (dd.approvals ?? [])
          .filter((a) => a.action === "daily_analysis")
          .map((a) => ({
            category: a.payload?.category ?? "habit",
            severity: a.payload?.severity ?? "info",
            detail: a.payload?.detail ?? "",
          }));
      }
    }
    return {
      status: "loaded",
      activePlans,
      avgProgress,
      todayTasks,
      todayDone,
      streak: st,
      agentSummary: summary,
      agentStatus: status,
      findings,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCoachData()
      .then((loaded) => {
        if (!cancelled) setData(loaded);
      })
      .catch(() => {
        if (!cancelled) setData((prev) => ({ ...prev, status: "error" }));
      });
    return () => {
      cancelled = true;
    };
  }, [loadCoachData]);

  const reload = useCallback(async () => {
    try {
      setData(await loadCoachData());
    } catch {
      setData((prev) => ({ ...prev, status: "error" }));
    }
  }, [loadCoachData]);

  const triggerAgent = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/agent/cron/daily");
      if (res.ok) toast.success("AI 分析完成，刷新中…");
      else toast.error("分析失败，请重试");
      setData(await loadCoachData());
    } catch {
      toast.error("分析失败");
    } finally {
      setRunning(false);
    }
  }, [loadCoachData]);

  // ---- Loading ----
  if (data.status === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-2/3" />
          </div>
          <Skeleton className="h-7 w-14 rounded-md" />
        </div>
        <Skeleton className="h-14 rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ---- Error ----
  if (data.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-center">
        <Brain className="size-7 text-white/20" weight="duotone" />
        <h3 className="mt-3 text-[13px] font-medium text-foreground">数据加载失败</h3>
        <p className="mt-1 text-xs text-muted-foreground">请检查网络后重试</p>
        <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={reload}>
          重新加载
        </Button>
      </div>
    );
  }

  // ---- Success ----
  const statusInfo = getStatus(data.agentStatus ?? "on_track");

  const stats = [
    { icon: CheckCircle, label: "待办任务", value: data.todayTasks, unit: "" },
    { icon: Target, label: "计划进度", value: data.avgProgress, unit: "%" },
    { icon: CalendarCheck, label: "进行中计划", value: data.activePlans, unit: "个" },
    { icon: Fire, label: "连续打卡", value: data.streak, unit: "天" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <Brain className="size-4 text-primary" weight="fill" />
            AI 学习教练
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {data.agentSummary ?? "点击「分析」让 AI 分析你的学习数据"}
          </p>
        </div>
        <Button
          onClick={triggerAgent}
          disabled={running}
          size="sm"
          className="h-7 shrink-0 gap-1 px-2.5 text-xs"
        >
          {running ? <Spinner className="size-3.5 animate-spin" /> : <Play className="size-3.5" weight="fill" />}
          {running ? "分析中" : "分析"}
        </Button>
      </div>

      {/* 状态 */}
      <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${statusInfo.color} ${statusInfo.bg}`}
        >
          {statusInfo.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-[13px] font-semibold ${statusInfo.color}`}>{statusInfo.label}</p>
          <p className="text-[11px] text-muted-foreground">
            今日待办 {data.todayDone}/{data.todayTasks} 已完成
          </p>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3"
          >
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <s.icon className="size-3.5" weight="fill" />
              <span className="text-[11px]">{s.label}</span>
            </div>
            <div className="mt-2 text-xl font-semibold leading-none tabular-nums text-foreground">
              {s.value}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 分析发现 */}
      {data.findings.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            分析发现
          </p>
          {data.findings.map((finding, i) => {
            const cfg = severityConfig[finding.severity] ?? severityConfig.info;
            return (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3"
              >
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${cfg.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-[11px] text-muted-foreground/60">{finding.category}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/80">{finding.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 空态 */}
      {data.findings.length === 0 && !data.agentSummary && (
        <div className="flex flex-col items-center py-8 text-center">
          <Lightning className="size-6 text-white/10" weight="duotone" />
          <p className="mt-2 text-[13px] font-medium text-foreground">AI 教练待命中</p>
          <p className="mt-1 text-xs text-muted-foreground">点击上方「分析」按钮开始</p>
        </div>
      )}
    </div>
  );
}
