"use client";

import { useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  ListChecks,
  PaperPlaneTilt,
  Robot,
  Spinner,
  Stop,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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

const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  queued: "outline",
  running: "secondary",
  awaiting_approval: "default",
  completed: "secondary",
  failed: "destructive",
  cancelled: "outline",
  rejected: "destructive",
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

function StepIcon({ status }: { status: string }) {
  if (status === "completed") {
    return <CheckCircle className="h-5 w-5 text-emerald-600" weight="fill" />;
  }
  if (status === "failed") {
    return <X className="h-5 w-5 text-destructive" />;
  }
  if (status === "running") {
    return <Spinner className="h-5 w-5 animate-spin text-primary" />;
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />;
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


  async function cancelRun() {
    if (!selectedRun) return;
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/agent/runs/${selectedRun.id}/cancel`, { method: "POST" });
      const data = (await response.json()) as { run?: AgentRunResponse; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error ?? "取消失败");
      setSelectedRun(data.run);
      setRuns((previous) =>
        previous.map((item) =>
          item.id === data.run?.id
            ? { ...item, status: data.run.status, summary: data.run.summary, updatedAt: data.run.updatedAt }
            : item
        )
      );
      toast.success("Agent 运行已取消");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消失败");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Robot className="h-5 w-5 text-primary" weight="fill" />
              新建 Agent 运行
            </CardTitle>
            <CardDescription>先生成草案，确认后才会写入你的学习计划。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="例如：30 天掌握 Next.js，并完成一个作品"
              rows={4}
              maxLength={1000}
              disabled={loading}
            />
            <div className="flex justify-end">
              <Button onClick={startRun} disabled={!goal.trim() || loading}>
                {loading ? <Spinner className="h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4" weight="fill" />}
                开始
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">运行记录</CardTitle>
              <CardDescription>{runs.length} 条最近记录</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={refreshRun} disabled={detailLoading} title="刷新当前运行">
              <ArrowClockwise className={detailLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {runs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">还没有 Agent 运行</p>
            ) : (
              runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => loadRun(run.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                    selectedId === run.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {run.mode !== "planner" && (
                          <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0">
                            {run.mode === "daily" ? "每日" : run.mode === "coach" ? "教练" : run.mode}
                          </Badge>
                        )}
                        <span className="line-clamp-1 text-sm font-medium">
                          {run.mode !== "planner"
                            ? run.summary ?? formatTime(run.updatedAt)
                            : run.goal}
                        </span>
                      </div>
                    </div>
                    {(() => {
                      const isDailyDone = run.mode !== "planner" && run.status === "completed";
                      return (
                        <Badge
                          variant={isDailyDone || run.status === "rejected" || run.status === "failed" ? "default" : (statusVariants[run.status] ?? "outline")}
                          className={`shrink-0 ${isDailyDone ? "bg-[#f3c969] text-[#17352d] hover:bg-[#f3c969]/90 border-0" : run.status === "rejected" || run.status === "failed" ? "bg-destructive text-destructive-foreground border-0" : ""}`}
                        >
                          {isDailyDone ? "小建议" : (statusLabels[run.status] ?? run.status)}
                        </Badge>
                      );
                    })()}
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    {run.latestStep?.title ?? run.summary ?? "等待处理"} · {formatTime(run.updatedAt)}
                  </p>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="min-h-[32rem]">
        {!selectedRun ? (
          <div className="flex min-h-[32rem] flex-col items-center justify-center px-6 text-center">
            <Robot className="h-10 w-10 text-primary/70" weight="duotone" />
            <h2 className="mt-4 text-lg font-semibold">选择一次 Agent 运行</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">计划草案、审批和执行轨迹会集中显示在这里。</p>
          </div>
        ) : (
          <>
            <CardHeader className="gap-3 border-b">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-primary" />
                    {selectedRun.mode === "daily" ? "每日自动分析" : selectedRun.mode === "coach" ? "教练分析" : "Agent 运行详情"}
                    {selectedRun.mode !== "planner" && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">系统自动</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1 break-words">{selectedRun.summary || selectedRun.goal}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const isDailyDone = selectedRun.mode !== "planner" && selectedRun.status === "completed";
                    const isRejected = selectedRun.status === "rejected" || selectedRun.status === "failed";
                    return (
                      <Badge
                        variant={isDailyDone || isRejected ? "default" : (statusVariants[selectedRun.status] ?? "outline")}
                        className={`${isDailyDone ? "bg-[#f3c969] text-[#17352d] border-0" : isRejected ? "bg-destructive text-destructive-foreground border-0" : ""}`}
                      >
                        {isDailyDone ? "小建议" : (statusLabels[selectedRun.status] ?? selectedRun.status)}
                      </Badge>
                    );
                  })()}
                </div>
              </div>
              {selectedRun.summary && <p className="text-sm text-foreground/80">{selectedRun.summary}</p>}
              {selectedRun.error && <p className="text-sm text-destructive">{selectedRun.error}</p>}
            </CardHeader>
            <CardContent className="space-y-6 py-6">
              {selectedRun.approvals.length > 0 && (
                <div className="mb-3">
                  <Badge className={`text-xs font-semibold border-0 ${selectedRun.mode !== "planner" ? "bg-[#f3c969] text-[#17352d]" : "bg-primary text-primary-foreground"}`}>
                    {selectedRun.mode !== "planner" ? "系统自动总结" : "计划草案"}
                  </Badge>
                </div>
              )}
              {selectedRun.approvals.map((approval) => {
                const draft = isPlanDraft(approval.payload) ? approval.payload : null;
                const payload = approval.payload as Record<string, unknown> | null;

                // daily_analysis / daily_action → 系统自动总结
                if (approval.action === "daily_analysis" || approval.action === "daily_action") {
                  const isFinding = approval.action === "daily_analysis";
                  const severity = (payload?.severity as string) ?? "info";
                  const severityColor: Record<string, string> = {
                    critical: "border-[#e8aaaa] bg-[#fef0f0] text-[#b84040]",
                    warning: "border-[#f3d878] bg-[#fef9e7] text-[#2d5a3d]",
                    info: "border-[#b8d8c0] bg-[#eaf6ef] text-[#2d5a3d]",
                  };
                  return (
                    <div key={approval.id} className={`rounded-lg border px-3 py-3 mb-3 ${severityColor[severity] ?? severityColor.info}`}>
                      <p className="text-xs font-medium uppercase tracking-wide opacity-70">
                        {isFinding ? "分析发现" : "建议行动"} · {severity}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{payload?.detail as string ?? payload?.reason as string ?? "—"}</p>
                    </div>
                  );
                }

                // create_plan / 默认 → 计划草案
                return (
                  <div key={approval.id} className="mb-3 rounded-lg border border-[#b8d8c0] bg-[#eaf6ef] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <p className="text-xs font-medium text-[#2d5a3d]">
                        {approval.status === "pending" ? "确认后将会创建真实计划和任务" : `审批状态：${approval.status}`}
                      </p>
                      {approval.status === "pending" && (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => decide("reject")} disabled={detailLoading}>
                            <X className="h-4 w-4" />
                            拒绝
                          </Button>
                          <Button size="sm" onClick={() => decide("approve")} disabled={detailLoading}>
                            <CheckCircle className="h-4 w-4" />
                            确认创建
                          </Button>
                        </div>
                      )}
                    </div>
                    {draft && (
                      <div className="space-y-3 rounded-lg border border-[#e2d6b8] bg-white/60 p-4">
                        <div>
                          <p className="text-base font-semibold text-[#1e4a2d]">{draft.name}</p>
                          <p className="mt-1 text-sm text-[#2d5a3d] font-medium">{draft.description ?? draft.goal}</p>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-[#3a6b4a]">
                          <span>目标时长：{draft.targetHours} 小时</span>
                          <span>任务数：{draft.tasks.length}</span>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                          {draft.tasks.map((task, index) => (
                            <div key={`${task.title}-${index}`} className="flex gap-3 text-sm">
                              <span className="w-5 shrink-0 text-right text-xs font-semibold text-[#3a6b4a]">{index + 1}</span>
                              <div className="min-w-0">
                                <p className="font-semibold text-[#1e4a2d]">{task.title}</p>
                                {task.description && <p className="mt-0.5 text-xs text-[#3a6b4a] font-medium">{task.description}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                        {draft.assumptions && draft.assumptions.length > 0 && (
                          <p className="text-xs text-[#3a6b4a] font-medium">前提：{draft.assumptions.join("；")}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
