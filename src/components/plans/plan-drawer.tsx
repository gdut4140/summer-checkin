"use client";

import { useEffect, useState, useCallback } from "react";
import { X, CheckCircle, Circle, CircleDashed, PencilSimple, Check } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import type { PlanWithProgress, PlanTaskInfo } from "@/types";

interface Props {
  plan: PlanWithProgress | null;
  onClose: () => void;
  onRefresh: () => void;
}

export function PlanDrawer({ plan, onClose, onRefresh }: Props) {
  const [tasks, setTasks] = useState<PlanTaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");

  // 抽屉打开 / 切换计划时重置本地状态（渲染期同步 props 状态，避免在 effect 里同步 setState）
  const planKey = plan?.id ?? null;
  const [lastPlanKey, setLastPlanKey] = useState<string | null>(planKey);
  if (planKey !== lastPlanKey) {
    setLastPlanKey(planKey);
    setTasks([]);
    setLoading(plan != null);
    setEditing(false);
    setEditingTaskId(null);
    setEditName(plan?.name ?? "");
    setEditGoal(plan?.goal ?? "");
  }

  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    fetch(`/api/plans/${plan.id}/tasks`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setTasks(data.tasks ?? []); })
      .catch(() => { if (!cancelled) setTasks([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [plan]);

  useEffect(() => {
    if (plan) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [plan]);

  // 切换任务状态
  const toggleTask = useCallback(async (task: PlanTaskInfo) => {
    if (!plan) return;
    setToggling((prev) => new Set(prev).add(task.id));
    const newStatus: PlanTaskInfo["status"] = task.status === "done" ? "pending" : "done";
    try {
      await fetch(`/api/plans/${plan.id}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, status: newStatus }),
      });
      const updated = tasks.map((t) =>
        t.id === task.id ? { ...t, status: newStatus, completedAt: newStatus === "done" ? new Date().toISOString() : null } : t
      );
      setTasks(updated);
      if (updated.every((t) => t.status === "done")) {
        await fetch(`/api/plans/${plan.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
        toast.success("全部任务完成，计划已结束~");
      }
      onRefresh();
    } catch {
      toast.error("更新失败");
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(task.id); return next; });
    }
  }, [plan, tasks, onRefresh]);

  // 保存任务编辑
  const saveTaskEdit = async (taskId: string) => {
    if (!plan || !editingTaskTitle.trim()) return;
    try {
      await fetch(`/api/plans/${plan.id}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, title: editingTaskTitle.trim() }),
      });
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, title: editingTaskTitle.trim() } : t));
    } catch {
      toast.error("保存失败");
    } finally {
      setEditingTaskId(null);
    }
  };

  // 保存计划编辑
  const savePlan = async () => {
    if (!plan || !editName.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), goal: editGoal.trim() || null }),
      });
      toast.success("计划已更新");
      setEditing(false);
      onRefresh();
    } catch {
      toast.error("保存失败");
    } finally { setSaving(false); }
  };

  const isOpen = !!plan;
  const completed = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && plan && (
          <motion.div initial={{ x: "100%" }} animate={{ x: "0%" }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-white/10 bg-[#080f0c] text-white shadow-2xl sm:w-[42%] lg:w-[34%]">

            {/* 头部 */}
            <div className="flex shrink-0 items-start gap-3 border-b border-white/8 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[#d7ef83] font-medium">
                  {plan.status === "active" ? "进行中" : plan.status === "completed" ? "已完成" : "已暂停"}
                </p>
                {editing ? (
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full bg-transparent text-lg font-semibold outline-none border-b-2 border-[#d7ef83] pb-0.5" />
                ) : (
                  <h2 className="mt-1 text-lg font-semibold truncate">{plan.name}</h2>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {editing ? (
                  <>
                    <button onClick={savePlan} disabled={saving || !editName.trim()}
                      className="rounded-lg p-1.5 text-[#d7ef83] hover:bg-white/10 transition disabled:opacity-30">
                      <Check className="h-5 w-5" weight="bold" />
                    </button>
                    <button onClick={() => { setEditing(false); setEditName(plan.name); setEditGoal(plan.goal ?? ""); }}
                      className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition">
                      <X className="h-5 w-5" weight="bold" />
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditing(true)}
                    className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition">
                    <PencilSimple className="h-5 w-5" weight="bold" />
                  </button>
                )}
                <button onClick={onClose} className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition">
                  <X className="h-5 w-5" weight="bold" />
                </button>
              </div>
            </div>

            {/* 目标 */}
            <div className="shrink-0 border-b border-white/8 px-5 py-3">
              {editing ? (
                <input value={editGoal} onChange={(e) => setEditGoal(e.target.value)} placeholder="计划目标…"
                  className="w-full bg-transparent text-[13px] text-white/60 outline-none border-b-2 border-[#d7ef83] pb-0.5 placeholder:text-white/20" />
              ) : plan.goal ? (
                <p className="text-[13px] text-white/50 line-clamp-3">{plan.goal}</p>
              ) : (
                <p className="text-[13px] text-white/25">暂无目标</p>
              )}
            </div>

            {/* 进度 */}
            <div className="shrink-0 border-b border-white/8 px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/40">任务进度</span>
                <span className="text-xs tabular-nums">{completed}/{total} 项 · {progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-[#d7ef83] transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>

            {/* 任务列表 */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-[#d7ef83] border-t-transparent" /></div>
              ) : tasks.length === 0 ? (
                <p className="py-10 text-center text-xs text-white/30">还没有拆分任务，去 AI 对话中让助手帮你拆</p>
              ) : (
                <div className="space-y-1">
                  {tasks.map((task) => {
                    const isToggling = toggling.has(task.id);
                    const isEditingTask = editingTaskId === task.id;
                    return (
                      <div key={task.id} className="group/task flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-white/[0.03]">
                        {/* 勾选 */}
                        <button onClick={() => !isToggling && toggleTask(task)} disabled={isToggling}
                          className="shrink-0 mt-0.5 cursor-pointer disabled:opacity-50">
                          {task.status === "done" ? (
                            <CheckCircle className="h-4 w-4 text-[#d7ef83]" weight="fill" />
                          ) : task.status === "in_progress" ? (
                            <CircleDashed className="h-4 w-4 text-[#d7ef83]/60" weight="fill" />
                          ) : (
                            <Circle className="h-4 w-4 text-white/15" />
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          {isEditingTask ? (
                            <input
                              autoFocus
                              value={editingTaskTitle}
                              onChange={(e) => setEditingTaskTitle(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveTaskEdit(task.id); if (e.key === "Escape") setEditingTaskId(null); }}
                              placeholder="任务名"
                              className="w-full bg-transparent text-sm text-[#d7ef83] outline-none border-b-2 border-[#d7ef83] pb-0.5 placeholder:text-[#d7ef83]/30"
                            />
                          ) : (
                            <>
                              <p className={`text-sm ${task.status === "skipped" ? "line-through text-white/20" : task.status === "done" ? "text-white/50" : "text-white/80"}`}>
                                {task.title}
                              </p>
                              {task.category && (
                                <div className="mt-0.5">
                                  <span className="text-[10px] text-white/25">{task.category === "study" ? "学习" : task.category === "project" ? "项目" : task.category === "review" ? "复习" : "练习"}</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {isEditingTask ? (
                          <button onClick={() => saveTaskEdit(task.id)}
                            className="shrink-0 rounded p-1 text-[#d7ef83] hover:bg-white/10 transition">
                            <Check className="h-3.5 w-3.5" weight="bold" />
                          </button>
                        ) : (
                          <button
                            onClick={() => { setEditingTaskId(task.id); setEditingTaskTitle(task.title); }}
                            className="shrink-0 rounded p-1 text-[#d7ef83]/50 hover:text-[#d7ef83] hover:bg-white/5 transition"
                          >
                            <PencilSimple className="h-3.5 w-3.5" weight="bold" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
