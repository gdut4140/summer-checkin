"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  ArrowUpRight,
  CheckCircle,
  ListChecks,
  PaperPlaneTilt,
  PencilSimple,
  Spinner,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { AgentRunResponse } from "@/lib/agent";

export interface AgentRunListItem {
  id: string;
  mode: string;
  goal: string;
  status: string;
  currentStep: number;
  summary: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  latestStep: { title: string; status: string; detail: string | null } | null;
  pendingApproval: { id?: string } | null;
}

interface Props {
  initialRuns: AgentRunListItem[];
}

const statusLabels: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  awaiting_approval: "待确认",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  rejected: "已拒绝",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isPlanDraft(value: unknown): value is {
  name: string;
  description?: string | null;
  goal: string;
  targetHours: number;
  assumptions?: string[];
  tasks: {
    title: string;
    description?: string | null;
    dayNumber?: number | null;
    weekNumber?: number | null;
    category: string;
    priority: string;
  }[];
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "name" in value &&
      "goal" in value &&
      "tasks" in value &&
      Array.isArray((value as { tasks?: unknown }).tasks)
  );
}

function getCreatedPlanId(run: AgentRunResponse | null): string | null {
  if (!run) return null;
  for (const step of run.steps) {
    if (step.kind !== "execution") continue;
    const output = step.output as { planId?: string } | null;
    if (output && typeof output.planId === "string" && output.planId) {
      return output.planId;
    }
  }
  return null;
}

function getStatusPill(mode: string, status: string): { label: string; className: string } {
  if (mode !== "planner" && status === "completed") {
    return { label: "小建议", className: "bg-[#f3c969] text-[#17352d]" };
  }
  const map: Record<string, { label: string; className: string }> = {
    queued: { label: "排队中", className: "bg-white/[0.08] text-muted-foreground" },
    running: { label: "运行中", className: "bg-primary/15 text-primary" },
    awaiting_approval: { label: "待确认", className: "bg-amber-500/15 text-amber-300" },
    completed: { label: "已完成", className: "bg-emerald-500/15 text-emerald-400" },
    failed: { label: "失败", className: "bg-destructive/20 text-destructive" },
    cancelled: { label: "已取消", className: "bg-white/[0.08] text-muted-foreground" },
    rejected: { label: "已拒绝", className: "bg-destructive/20 text-destructive" },
  };
  return map[status] ?? { label: statusLabels[status] ?? status, className: "bg-white/[0.08] text-muted-foreground" };
}

export function AgentWorkspace({ initialRuns }: Props) {
  const [runs, setRuns] = useState(initialRuns);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<AgentRunResponse | null>(null);
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadRun(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/agent/runs/${id}`);
      if (!response.ok) throw new Error("加载 Agent 运行失败");
      const data = (await response.json()) as { run: AgentRunResponse };
      setSelectedRun(data.run);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setDetailLoading(false);
    }
  }

  async function startRun() {
    if (!goal.trim() || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/agent/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim(), mode: "planner" }),
      });
      const data = (await response.json()) as { run?: AgentRunResponse; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error ?? "创建 Agent 运行失败");
      const run = data.run;
      const latestStep = run.steps.at(-1);
      const pendingApproval = run.approvals.find((approval) => approval.status === "pending");
      const summary: AgentRunListItem = {
        id: run.id,
        mode: run.mode,
        goal: run.goal,
        status: run.status,
        currentStep: run.currentStep,
        summary: run.summary,
        error: run.error,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        latestStep: latestStep
          ? { title: latestStep.title, status: latestStep.status, detail: latestStep.detail }
          : null,
        pendingApproval: pendingApproval ? { id: pendingApproval.id } : null,
      };
      setRuns((previous) => [summary, ...previous.filter((item) => item.id !== run.id)]);
      setSelectedId(run.id);
      setSelectedRun(run);
      setGoal("");
      toast.success("计划草案已生成，请检查后确认");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshRun() {
    if (!selectedId) return;
    await loadRun(selectedId);
  }

  async function decide(decision: "approve" | "reject") {
    if (!selectedRun) return;
    const approval = selectedRun.approvals.find((item) => item.status === "pending");
    if (!approval) return;
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/agent/runs/${selectedRun.id}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: approval.id, decision }),
      });
      const data = (await response.json()) as { run?: AgentRunResponse; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error ?? "提交确认失败");
      setSelectedRun(data.run);
      setRuns((previous) =>
        previous.map((item) =>
          item.id === data.run?.id
            ? {
                ...item,
                status: data.run.status,
                currentStep: data.run.currentStep,
                summary: data.run.summary,
                error: data.run.error,
                updatedAt: data.run.updatedAt,
                pendingApproval: null,
              }
            : item
        )
      );
      toast.success(decision === "approve" ? "计划已创建" : "已拒绝这份计划草案");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setDetailLoading(false);
    }
  }

  const createdPlanId = getCreatedPlanId(selectedRun);

  return (
    <div className="flex flex-col gap-3">
      {/* ── 新建：紧凑 composer ── */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 transition-colors focus-within:border-primary/40">
        <Textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="描述目标，例如：30 天掌握 Next.js…"
          rows={2}
          maxLength={1000}
          disabled={loading}
          className="min-h-0 resize-none border-0 bg-transparent px-1 py-0.5 text-[13px] shadow-none focus-visible:ring-0"
        />
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] text-muted-foreground/60">确认后才会写入计划</span>
          <Button
            onClick={startRun}
            size="sm"
            className="h-7 gap-1 px-2.5 text-xs"
            disabled={!goal.trim() || loading}
          >
            {loading ? <Spinner className="size-3.5 animate-spin" /> : <PaperPlaneTilt className="size-3.5" weight="fill" />}
            生成
          </Button>
        </div>
      </div>

      {/* ── 运行记录 ── */}
      <div>
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            运行记录
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/60">{runs.length} 条</span>
            <button
              type="button"
              onClick={refreshRun}
              disabled={detailLoading}
              title="刷新当前运行"
              className="flex size-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-40"
            >
              <ArrowClockwise className={detailLoading ? "size-3 animate-spin" : "size-3"} />
            </button>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.08] py-8 text-center text-xs text-muted-foreground/70">
            还没有运行记录，输入目标生成第一份计划草案
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {runs.map((run) => {
              const pill = getStatusPill(run.mode, run.status);
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => loadRun(run.id)}
                  className={cn(
                    "w-full rounded-xl px-3 py-2.5 text-left transition-colors",
                    selectedId === run.id ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {run.mode !== "planner" ? run.summary ?? formatTime(run.updatedAt) : run.goal}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
                        pill.className
                      )}
                    >
                      {pill.label}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                    {run.mode !== "planner" && (
                      <span>{run.mode === "daily" ? "每日分析" : "教练分析"}</span>
                    )}
                    <span className="truncate">{run.latestStep?.title ?? run.summary ?? "等待处理"}</span>
                    <span className="shrink-0 tabular-nums">{formatTime(run.updatedAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 详情：仅选中时显示 ── */}
      {selectedRun && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] pb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <ListChecks className="size-4 text-primary" />
                <span className="text-[13px] font-semibold text-foreground">
                  {selectedRun.mode === "daily"
                    ? "每日自动分析"
                    : selectedRun.mode === "coach"
                      ? "教练分析"
                      : "计划草案"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground wrap-break-word">
                {selectedRun.summary || selectedRun.goal}
              </p>
            </div>
            {(() => {
              const pill = getStatusPill(selectedRun.mode, selectedRun.status);
              return (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
                    pill.className
                  )}
                >
                  {pill.label}
                </span>
              );
            })()}
          </div>

          {selectedRun.error && (
            <p className="mt-2 text-xs text-destructive">{selectedRun.error}</p>
          )}

          {createdPlanId && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2.5">
              <CheckCircle className="size-4 shrink-0 text-primary" weight="fill" />
              <span className="text-xs font-medium text-foreground">计划已创建</span>
              <div className="ml-auto flex items-center gap-1.5">
                <Link
                  href={`/plans/${createdPlanId}`}
                  className="flex items-center gap-1 rounded-md bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-white/[0.1]"
                >
                  查看 <ArrowUpRight className="size-3" />
                </Link>
                <Link
                  href={`/plans/${createdPlanId}/edit`}
                  className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <PencilSimple className="size-3" />
                  编辑
                </Link>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {selectedRun.approvals.map((approval) => {
              const draft = isPlanDraft(approval.payload) ? approval.payload : null;
              const payload = approval.payload as Record<string, unknown> | null;

              // daily_analysis / daily_action → 系统自动总结
              if (approval.action === "daily_analysis" || approval.action === "daily_action") {
                const isFinding = approval.action === "daily_analysis";
                const severity = (payload?.severity as string) ?? "info";
                const severityColor: Record<string, string> = {
                  critical: "text-red-300",
                  warning: "text-amber-300",
                  info: "text-emerald-300",
                };
                return (
                  <div key={approval.id} className="rounded-lg bg-white/[0.03] px-3 py-2.5">
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${severityColor[severity] ?? severityColor.info}`}>
                      {isFinding ? "分析发现" : "建议行动"} · {severity}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-foreground">
                      {payload?.detail as string ?? payload?.reason as string ?? "—"}
                    </p>
                  </div>
                );
              }

              // create_plan / 默认 → 计划草案
              return (
                <div key={approval.id} className="rounded-lg bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-emerald-400">
                      {approval.status === "pending"
                        ? "确认后将会创建真实计划和任务"
                        : `审批状态：${approval.status}`}
                    </p>
                    {approval.status === "pending" && (
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 text-[11px]"
                          onClick={() => decide("reject")}
                          disabled={detailLoading}
                        >
                          <X className="size-3" />
                          拒绝
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 gap-1 text-[11px]"
                          onClick={() => decide("approve")}
                          disabled={detailLoading}
                        >
                          <CheckCircle className="size-3" />
                          确认创建
                        </Button>
                      </div>
                    )}
                  </div>
                  {draft && (
                    <div className="mt-2.5 flex flex-col gap-2.5 rounded-lg bg-white/[0.03] p-3">
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{draft.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {draft.description ?? draft.goal}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-semibold text-emerald-400">
                        <span>目标时长：{draft.targetHours} 小时</span>
                        <span>任务数：{draft.tasks.length}</span>
                      </div>
                      <Separator />
                      <div className="flex flex-col gap-2">
                        {draft.tasks.map((task, index) => (
                          <div key={`${task.title}-${index}`} className="flex gap-2.5">
                            <span className="w-4 shrink-0 text-right text-xs font-semibold text-emerald-500/60">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-foreground">{task.title}</p>
                              {task.description && (
                                <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {draft.assumptions && draft.assumptions.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          前提：{draft.assumptions.join("；")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
