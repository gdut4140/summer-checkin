"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, Circle, CircleDashed, ListChecks, PencilSimple, Check } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import type { PlanWithProgress, PlanTaskInfo } from "@/types";

interface Props {
  plan: PlanWithProgress | null;
  onClose: () => void;
  onRefresh: () => void;
  /** 标题保存成功后立即回调，让父级同步选中的计划（抽屉显示不用重开） */
  onPlanNameChange?: (name: string) => void;
}

export function PlanDrawer({ plan, onClose, onRefresh, onPlanNameChange }: Props) {
  const [tasks, setTasks] = useState<PlanTaskInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [stale, setStale] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  // Portal 必须等客户端挂载后才能拿到 document.body（SSR/首屏 hydration 时不渲染）
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // 抽屉打开 / 切换计划时重置本地状态（渲染期同步 props 状态，避免在 effect 里同步 setState）
  const planKey = plan?.id ?? null;
  const [lastPlanKey, setLastPlanKey] = useState<string | null>(planKey);
  if (planKey !== lastPlanKey) {
    setLastPlanKey(planKey);
    setTasks([]);
    setLoading(plan != null);
    setStale(false);
    setSplitting(false);
    setRefreshing(false);
    setEditing(false);
    setEditName(plan?.name ?? "");
  }

  // 从服务端拉取权威任务列表 + 过期标记 + 拆分状态
  const loadTasks = useCallback(async (planId: string): Promise<{ tasks: PlanTaskInfo[]; stale: boolean; splitting: boolean }> => {
    const res = await fetch(`/api/plans/${planId}/tasks`);
    if (!res.ok) throw new Error("加载任务失败");
    const data = (await res.json()) as { tasks?: PlanTaskInfo[]; stale?: boolean; splitting?: boolean };
    return { tasks: data.tasks ?? [], stale: !!data.stale, splitting: !!data.splitting };
  }, []);

  // 已自动触发过拆分的标记（每次打开只自动拆一次，避免反复触发）
  const autoSplitRef = useRef<string | null>(null);

  // 拆分/刷新：触发后台拆分，不阻塞等待完成——轮询 effect 会检测完成并加载新任务。
  // 用本地 refreshing 标记"刷新中"，避免 AI 判断阶段被服务端 splitting=false 覆盖导致进度条闪烁。
  // silent=true 用于打开抽屉时自动触发（不弹提示，任务出现即成功）。
  const runSplit = async (silent = false) => {
    if (!plan || refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}/split`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { changed?: boolean; error?: string } | null;
      if (silent) return;
      if (!res.ok) {
        toast.error(data?.error || "拆分失败，请重试");
      } else if (data?.changed === true) {
        toast.success("任务已按文档更新");
      } else if (data?.changed === false) {
        toast.success("任务与文档一致，无需更新");
      }
    } catch {
      if (!silent) toast.error("触发拆分失败，请重试");
    } finally {
      setRefreshing(false);
      setSplitting(false);
      onRefresh();
    }
  };

  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    loadTasks(plan.id)
      .then(({ tasks, stale, splitting }) => {
        if (cancelled) return;
        setTasks(tasks);
        setStale(stale);
        setSplitting(splitting);
        // 任务为空 + 未在拆分 + 尚未自动触发过 → 打开抽屉即自动拆分，无需手动点「刷新任务」
        if (tasks.length === 0 && !splitting && !refreshing && !autoSplitRef.current) {
          autoSplitRef.current = plan.id;
          void runSplit(true);
        }
      })
      .catch(() => { if (!cancelled) { setTasks([]); setStale(false); setSplitting(false); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // runSplit/refreshing 在依赖里会导致重复触发；这里只关心打开时的一次性检查
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, loadTasks]);

  // 刷新/拆分中：每 2 秒轮询，直到 tasksSplittingAt 清空，加载最新任务并刷新计划页。
  // stale 也参与轮询，以覆盖"AI 判断中 → 拆分开始 → 完成"的整段过程。
  useEffect(() => {
    if (!plan || (!splitting && !refreshing && !stale)) return;
    const timer = window.setInterval(() => {
      loadTasks(plan.id)
        .then(({ tasks, stale: s, splitting: serverSplitting }) => {
          setTasks(tasks);
          setStale(s);
          setSplitting(serverSplitting);
          // 自动触发的拆分结束（非手动刷新）→ 刷新计划页数据
          if (splitting && !serverSplitting && !refreshing) onRefresh();
        })
        .catch(() => {});
    }, 2000);
    return () => window.clearInterval(timer);
  }, [plan, splitting, refreshing, stale, loadTasks, onRefresh]);

  useEffect(() => {
    if (plan) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [plan]);

  // 切换任务状态：有改动才自动刷新任务列表
  const toggleTask = useCallback(async (task: PlanTaskInfo) => {
    if (!plan) return;
    setToggling((prev) => new Set(prev).add(task.id));
    const newStatus: PlanTaskInfo["status"] = task.status === "done" ? "pending" : "done";
    try {
      const res = await fetch(`/api/plans/${plan.id}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, status: newStatus }),
      });
      if (!res.ok) throw new Error("更新失败");
      const updatedTask = (await res.json()) as PlanTaskInfo;

      // 有改动才刷新：服务端状态确实变了，才更新本地并重新拉取任务列表
      if (updatedTask.status === task.status) return;

      const optimistic = tasks.map((t) =>
        t.id === task.id ? { ...t, status: updatedTask.status, completedAt: updatedTask.completedAt } : t
      );
      setTasks(optimistic); // 先乐观更新，勾选立即生效

      // 自动刷新任务列表：以服务端为准，覆盖 AI 等外部对任务的改动
      const refreshed = await loadTasks(plan.id).catch(() => null);
      if (refreshed) { setTasks(refreshed.tasks); setStale(refreshed.stale); setSplitting(refreshed.splitting); }

      if ((refreshed?.tasks ?? optimistic).every((t) => t.status === "done")) {
        // 内部标记计划为非活跃（agent 用它区分活跃计划），用户侧不展示"已完成"状态
        await fetch(`/api/plans/${plan.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
        toast.success("全部任务完成！");
      }
      onRefresh();
    } catch {
      toast.error("更新失败");
    } finally {
      setToggling((prev) => { const next = new Set(prev); next.delete(task.id); return next; });
    }
  }, [plan, tasks, loadTasks, onRefresh]);

  // 保存任务编辑
  // 保存计划标题（手动编辑，不经过 AI）
  const savePlan = async () => {
    if (!plan || !editName.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      toast.success("计划已更新");
      onPlanNameChange?.(editName.trim());
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

  return mounted && typeof document !== "undefined"
    ? createPortal(
        <>
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                onClick={onClose}
                className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px]"
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {isOpen && plan && (
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: "0%" }}
                exit={{ x: "calc(100% + 24px)" }}
                transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.9 }}
                className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col
                           rounded-l-2xl
                           border-l border-white/10
                           bg-[var(--surface-nav-bg)]/95 text-foreground
                           shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.55),_-18px_0_50px_-18px_rgba(0,0,0,0.55)]
                           backdrop-blur-2xl
                           sm:w-[48%] md:w-[44%] lg:w-[36%] xl:w-[32%]"
              >
                {/* 左侧抽屉抓手：提示这是从右屏滑入的面板 */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-[6px] top-1/2 z-10 flex h-16 -translate-y-1/2 flex-col items-center justify-center gap-1.5 opacity-70"
                >
                  <span className="h-8 w-[3px] rounded-full bg-white/[0.15] shadow-[0_0_4px_rgba(255,255,255,0.08)]" />
                </div>

                {/* 头部：标题可手动编辑 */}
                <div className="flex shrink-0 items-start gap-3 border-b border-white/8 px-5 pt-4 pb-3">
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") void savePlan(); if (e.key === "Escape") { setEditing(false); setEditName(plan.name); } }}
                        className="w-full bg-transparent text-lg font-semibold outline-none border-b-2 border-primary pb-0.5" />
                    ) : (
                      <h2 className="text-lg font-semibold truncate">{plan.name}</h2>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {editing ? (
                      <>
                        <button onClick={() => void savePlan()} disabled={saving || !editName.trim()}
                          className="rounded-lg p-1.5 text-primary hover:bg-white/10 transition disabled:opacity-30">
                          <Check className="h-5 w-5" weight="bold" />
                        </button>
                        <button onClick={() => { setEditing(false); setEditName(plan.name); }}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition">
                          <X className="h-5 w-5" weight="bold" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setEditing(true)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition">
                        <PencilSimple className="h-5 w-5" weight="bold" />
                      </button>
                    )}
                    <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition">
                      <X className="h-5 w-5" weight="bold" />
                    </button>
                  </div>
                </div>

                {/* 进度 */}
                <div className="shrink-0 border-b border-white/8 px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">任务进度</span>
                    <span className="text-xs tabular-nums">{completed}/{total} 项 · {progress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* 任务列表 */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {/* 文档改动后任务过期提示（拆分中隐藏，避免与刷新提示重叠） */}
                  {stale && !splitting && (
                    <div className="mb-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2.5">
                      <p className="text-xs leading-snug text-amber-200/90">计划已修改，任务可能不是最新的，点下方「刷新任务」更新</p>
                    </div>
                  )}

                  {/* 任务刷新中：后台任务真正在修改任务（splitting）或手动刷新（refreshing）时显示。
                      注意 splitting 只在 AI 判断确认要改、实际开始重新拆分时才置上，所以大意没变的改动不会显示进度条。 */}
                  {(splitting || refreshing) && (
                    <div className="mb-3 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="size-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
                        <p className="text-xs text-primary">任务刷新中，请稍候…</p>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-1/3 rounded-full bg-primary animate-indeterminate" />
                      </div>
                    </div>
                  )}

                  {/* 任务清单头部：始终提供刷新按钮（有改动或没改动都能手动刷新） */}
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">任务清单</span>
                    <button onClick={() => void runSplit()} disabled={splitting || refreshing || loading}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground disabled:opacity-50">
                      <ListChecks className="size-3.5" />
                      {splitting || refreshing ? "刷新中…" : "刷新任务"}
                    </button>
                  </div>

                  {loading ? (
                    <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                  ) : tasks.length === 0 && !splitting && !refreshing ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">还没有任务，点上方「刷新任务」从文档拆分</p>
                  ) : (
                    <div className="space-y-1">
                      {tasks.map((task) => {
                              const isToggling = toggling.has(task.id);
                              return (
                                <div key={task.id} className="group/task flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-white/[0.03]">
                                  {/* 勾选 */}
                                  <button onClick={() => !isToggling && toggleTask(task)} disabled={isToggling}
                                    className="shrink-0 mt-0.5 cursor-pointer disabled:opacity-50">
                                    {task.status === "done" ? (
                                      <CheckCircle className="h-4 w-4 text-primary" weight="fill" />
                                    ) : task.status === "in_progress" ? (
                                      <CircleDashed className="h-4 w-4 text-primary/60" weight="fill" />
                                    ) : (
                                      <Circle className="h-4 w-4 text-muted-foreground/30" />
                                    )}
                                  </button>

                                  {/* 文字区域也可点击打勾 */}
                                  <div
                                    className="min-w-0 flex-1 cursor-pointer"
                                    onClick={() => !isToggling && toggleTask(task)}
                                  >
                                    <p className={`text-sm ${task.status === "skipped" ? "line-through text-muted-foreground/50" : task.status === "done" ? "text-muted-foreground" : "text-foreground"}`}>
                                      {task.title}
                                    </p>
                                    {task.category && (
                                      <div className="mt-0.5">
                                        <span className="text-[10px] text-muted-foreground/60">{task.category === "study" ? "学习" : task.category === "project" ? "项目" : task.category === "review" ? "复习" : "练习"}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )
    : null;
}
