"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Brain, CalendarCheck, Clock, Fire, Lightning, Play, Spinner, Target, TrendDown, TrendUp,
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
  status: "loading" | "loaded" | "error";
  todayHours: number;
  weekHours: number;
  streak: number;
  completionRate: number;
  agentSummary: string | null;
  agentStatus: string | null;
  findings: FindingItem[];
}

// ---- Config ----

const severityConfig: Record<string, { icon: typeof Warning; label: string; color: string; bg: string }> = {
  info:     { icon: Lightning, label: "信息", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  warning:  { icon: Lightning, label: "注意", color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
  critical: { icon: Lightning, label: "关键", color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
};
const onTrackStatus = { emoji: "✅", label: "运行良好", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" };
const attentionStatus = { emoji: "⚠️", label: "需要关注", color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" };
const adjustStatus   = { emoji: "🔧", label: "需要调整", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" };
const riskStatus     = { emoji: "🚨", label: "有风险",   color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" };

const statusMap: Record<string, typeof onTrackStatus> = {
  on_track: onTrackStatus, need_attention: attentionStatus, need_adjustment: adjustStatus, at_risk: riskStatus,
};
function getStatus(s: string) { return statusMap[s] ?? onTrackStatus; }

// ---- Main ----

export function CoachOverview() {
  const [data, setData] = useState<CoachData>({ status: "loading", todayHours: 0, weekHours: 0, streak: 0, completionRate: 0, agentSummary: null, agentStatus: null, findings: [] });
  const [running, setRunning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/runs");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      const runs = json.runs ?? [];
      const latest = runs.find((r: any) => (r.mode === "daily" || r.mode === "coach") && r.status === "completed");

      let findings: FindingItem[] = [], summary: string | null = null, status: string | null = null, th = 0, wh = 0, st = 0;

      if (latest) {
        const dr = await fetch(`/api/agent/runs/${latest.id}`);
        if (dr.ok) {
          const dd = await dr.json();
          summary = dd.summary ?? null;
          status = dd.status ?? null;
          const ctx = dd.steps?.find((s: any) => s.kind === "context");
          if (ctx?.output) { th = ctx.output.todayHours ?? 0; wh = ctx.output.weekHours ?? 0; st = ctx.output.streak ?? 0; }
          findings = (dd.approvals ?? [])
            .filter((a: any) => a.action === "daily_analysis")
            .map((a: any) => ({ category: a.payload?.category ?? "habit", severity: a.payload?.severity ?? "info", detail: a.payload?.detail ?? "" }));
        }
      }
      setData({ status: "loaded", todayHours: th, weekHours: wh, streak: st, completionRate: runs.length > 0 ? Math.round((runs.filter((r: any) => r.status === "completed").length / runs.length) * 100) : 0, agentSummary: summary, agentStatus: status, findings });
    } catch {
      setData((prev) => ({ ...prev, status: "error" }));
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const triggerAgent = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/agent/cron/daily");
      if (res.ok) toast.success("AI 分析完成，刷新中…");
      else toast.error("分析失败，请重试");
      await fetchData();
    } catch { toast.error("分析失败"); }
    finally { setRunning(false); }
  }, [fetchData]);

  // ---- Loading ----
  if (data.status === "loading") {
    return (
      <div className="space-y-3">
        <div className="rf-stat-grid">
          {[1,2,3,4].map((i) => <div key={i} className="rf-stat-item"><Skeleton className="h-4 w-12 mb-1" /><Skeleton className="h-6 w-16" /></div>)}
        </div>
        <div className="rf-card"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-3 w-full mb-1" /><Skeleton className="h-3 w-2/3" /></div>
      </div>
    );
  }

  // ---- Error ----
  if (data.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Brain className="size-10 text-white/20" weight="duotone" />
        <h3 className="mt-3 text-sm font-medium">数据加载失败</h3>
        <p className="mt-1 text-[11px] text-white/40">请检查网络后重试</p>
        <Button variant="outline" size="sm" className="mt-3 h-7 text-[11px]" onClick={fetchData}>重新加载</Button>
      </div>
    );
  }

  // ---- Success ----
  const statusInfo = getStatus(data.agentStatus ?? "on_track");
  const StatItem = ({ icon: I, label, value, unit, trend }: { icon: any; label: string; value: number; unit: string; trend?: string | null }) => (
    <div className="rf-stat-item">
      <I className="size-4 text-primary/70" weight="fill" />
      <span className="rf-stat-value">{value}{unit}</span>
      <span className="rf-stat-label">{label}</span>
      {trend === "up" && <TrendUp className="size-3 text-emerald-400" weight="fill" />}
      {trend === "down" && <TrendDown className="size-3 text-red-400" weight="fill" />}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Brain className="size-4 text-primary" weight="fill" />AI 学习教练</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/45 line-clamp-2">{data.agentSummary ?? "点击「分析」让 AI 分析你的学习数据"}</p>
        </div>
        <Button onClick={triggerAgent} disabled={running} size="sm" className="h-7 shrink-0 gap-1 text-[11px]">
          {running ? <Spinner className="size-3 animate-spin" /> : <Play className="size-3" weight="fill" />}{running ? "分析中" : "分析"}
        </Button>
      </div>

      <div className="rf-stat-grid">
        <StatItem icon={Clock} label="今日" value={data.todayHours} unit="h" />
        <StatItem icon={CalendarCheck} label="本周" value={data.weekHours} unit="h" />
        <StatItem icon={Fire} label="连续" value={data.streak} unit="天" />
        <StatItem icon={Target} label="完成率" value={data.completionRate} unit="%" trend={data.completionRate >= 70 ? "up" : data.completionRate > 0 ? "down" : null} />
      </div>

      <div className={`rf-card ${statusInfo.bg}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{statusInfo.emoji}</span>
          <p className={`text-xs font-semibold ${statusInfo.color}`}>{statusInfo.label}</p>
          <p className="text-[11px] text-white/50 line-clamp-2">{data.agentSummary ?? "AI 教练尚未运行"}</p>
        </div>
      </div>

      {data.findings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-white/30 uppercase tracking-wide">分析发现</p>
          {data.findings.map((finding, i) => {
            const cfg = severityConfig[finding.severity] ?? severityConfig.info;
            const IconEl = cfg.icon;
            return (
              <div key={i} className={`rf-card ${cfg.bg}`}>
                <div className="flex items-start gap-2">
                  <IconEl className={`size-3.5 shrink-0 mt-0.5 ${cfg.color}`} weight="fill" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${cfg.color} border-current/30`}>{cfg.label}</Badge>
                      <span className="text-[9px] text-white/30">{finding.category}</span>
                    </div>
                    <p className="text-xs leading-relaxed">{finding.detail}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.findings.length === 0 && !data.agentSummary && (
        <div className="flex flex-col items-center py-8 text-center">
          <Lightning className="size-8 text-white/10" weight="duotone" />
          <p className="mt-2 text-xs font-medium">AI 教练待命中</p>
          <p className="mt-1 text-[11px] text-white/30">点击上方「分析」按钮开始</p>
        </div>
      )}
    </div>
  );
}
