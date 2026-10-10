// 计划 → Markdown 文档序列化（文档工作室）
// 结构： # 名称 / ## 目标 / ## 计划说明 / ## 学习指导 / ## 任务安排 / ## 学习笔记
// 「## 任务安排」段落与 PlanTask 双向同步（保存时由 plan-sync 解析回写）。

export interface PlanTaskMarkdownSource {
  title: string;
  status: string; // pending | in_progress | done | skipped
  dayNumber?: number | null;
  weekNumber?: number | null;
}

// ---- 「## 任务安排」清单渲染（按天分组）----
//
// 文档里有两处列任务：
//   ## 学习指导 — 每任务一段（标题 + 说明 + 标签），标题里带「Day N」
//   ## 任务安排 — 勾选清单，plan-sync 解析它回写 PlanTask
//
// 清单原先是一条条平铺的，日期只存在于「学习指导」里。后果是 plan-sync 新建
// 任务时拿不到 dayNumber 只能留空 —— 同一份计划里，createPlan 建的任务有日期、
// 改文档新增的任务没日期，两种来源不一致。
//
// 所以清单也按 (周, 天) 分组，日期落在任务行所属的组标题上，解析时即可读到。
// 没有日期的任务仍然平铺在最前，因此旧文档的渲染结果一字不变（向后兼容）。

interface ChecklistTask {
  title: string;
  status?: string;
  dayNumber?: number | null;
  weekNumber?: number | null;
}

/** 分组标题文案，与「学习指导」的 ### 标题保持同一套写法 */
function dayGroupLabel(weekNumber?: number | null, dayNumber?: number | null): string {
  return [
    weekNumber ? `第 ${weekNumber} 周` : "",
    dayNumber ? `Day ${dayNumber}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** 清单行（不含「## 任务安排」标题本身） */
function renderChecklistLines(tasks: ChecklistTask[]): string[] {
  const check = (t: ChecklistTask) => `- [${t.status === "done" ? "x" : " "}] ${t.title}`;
  const lines: string[] = [];

  // 1) 无日期的任务平铺在最前
  for (const t of tasks) {
    if (!t.dayNumber && !t.weekNumber) lines.push(check(t));
  }

  // 2) 其余按 (周, 天) 升序分组
  const groups = new Map<string, { label: string; tasks: ChecklistTask[] }>();
  for (const t of tasks) {
    if (!t.dayNumber && !t.weekNumber) continue;
    const key = `${t.weekNumber ?? 0}-${t.dayNumber ?? 0}`;
    const g = groups.get(key);
    if (g) g.tasks.push(t);
    else
      groups.set(key, {
        label: dayGroupLabel(t.weekNumber, t.dayNumber),
        tasks: [t],
      });
  }

  const ordered = [...groups.entries()].sort(([a], [b]) => {
    const [aw, ad] = a.split("-").map(Number);
    const [bw, bd] = b.split("-").map(Number);
    return aw - bw || ad - bd;
  });

  for (const [, g] of ordered) {
    if (lines.length) lines.push("");
    lines.push(`### ${g.label}`, "");
    for (const t of g.tasks) lines.push(check(t));
  }

  return lines;
}

function renderTaskSection(tasks: ChecklistTask[]): string {
  return ["## 任务安排", "", ...renderChecklistLines(tasks)].join("\n");
}

/** PlanDraft → 详细计划文档（planner 流程确认创建时使用） */
export interface PlanDraftMarkdownTask {
  title: string;
  description?: string | null;
  dayNumber?: number | null;
  weekNumber?: number | null;
  category?: string;
  priority?: string;
  status?: string;
}

export interface PlanDraftMarkdownSource {
  name: string;
  description?: string | null;
  goal?: string | null;
  assumptions?: string[];
  tasks?: PlanDraftMarkdownTask[];
}

const TASK_CATEGORY_LABEL: Record<string, string> = {
  study: "学习",
  project: "项目",
  review: "复习",
  exercise: "练习",
};
const TASK_PRIORITY_LABEL: Record<string, string> = {
  high: "高",
  normal: "中",
  low: "低",
};

function taskTags(task: PlanDraftMarkdownTask): string[] {
  return [
    TASK_CATEGORY_LABEL[task.category ?? ""],
    task.priority ? `优先级：${TASK_PRIORITY_LABEL[task.priority] ?? task.priority}` : "",
  ].filter(Boolean);
}

function renderLearningGuide(tasks: PlanDraftMarkdownTask[]): string[] {
  const lines: string[] = ["## 学习指导", ""];
  for (const task of tasks) {
    const weekLabel = task.weekNumber ? `第 ${task.weekNumber} 周 · ` : "";
    const dayLabel = task.dayNumber ? `Day ${task.dayNumber} · ` : "";
    lines.push(`### ${weekLabel}${dayLabel}${task.title}`, "");
    if (task.description?.trim()) lines.push(task.description.trim(), "");
    const tags = taskTags(task);
    if (tags.length) lines.push(`> ${tags.join(" · ")}`, "");
  }
  return lines;
}

function renderTaskChecklist(tasks: ChecklistTask[]): string[] {
  return ["## 任务安排", "", ...renderChecklistLines(tasks), ""];
}

export function planDraftToMarkdown(draft: PlanDraftMarkdownSource): string {
  const lines: string[] = [`# ${draft.name}`, ""];

  if (draft.goal?.trim()) lines.push("## 目标", "", draft.goal.trim(), "");

  if (draft.description?.trim()) {
    lines.push("## 计划说明", "", draft.description.trim(), "");
  }

  if (draft.assumptions?.length) {
    lines.push("## 前提假设", "");
    for (const a of draft.assumptions) lines.push(`- ${a}`);
    lines.push("");
  }

  const tasks = draft.tasks ?? [];
  if (tasks.length > 0) {
    lines.push(...renderLearningGuide(tasks));
    lines.push(...renderTaskChecklist(tasks));
  }

  lines.push("## 学习笔记", "", "在这里记录学习内容、心得和遇到的问题…", "");
  return lines.join("\n");
}

/** 从 Plan 结构化字段 + PlanTask 行生成详细文档（AI 未提供 document 时的兜底） */
export interface PlanTasksMarkdownTask {
  title: string;
  description?: string | null;
  dayNumber?: number | null;
  weekNumber?: number | null;
  category?: string;
  priority?: string;
  status?: string;
}

export function planWithTasksToMarkdown(plan: {
  name: string;
  description?: string | null;
  goal?: string | null;
}, tasks: PlanTasksMarkdownTask[]): string {
  const lines: string[] = [`# ${plan.name}`, ""];

  if (plan.goal?.trim()) lines.push("## 目标", "", plan.goal.trim(), "");
  if (plan.description?.trim()) {
    lines.push("## 计划说明", "", plan.description.trim(), "");
  }

  if (tasks.length > 0) {
    lines.push(...renderLearningGuide(tasks));
    lines.push(...renderTaskChecklist(tasks));
  }

  lines.push("## 学习笔记", "", "在这里记录学习内容、心得和遇到的问题…", "");
  return lines.join("\n");
}

/**
 * 保证文档里存在「## 任务安排」段落：
 * - 文档已有该段落 → 原样返回（段落内容以用户/AI 维护为准）
 * - 文档没有、但计划有任务 → 在「## 学习笔记」之前（或文档末尾）补一段
 * 让智能体创建的任务在文档里始终可见。
 */
export function ensureTaskSectionInDocument(
  document: string,
  tasks: PlanTaskMarkdownSource[]
): string {
  if (tasks.length === 0) return document;
  if (/^#{1,6}\s*(任务安排|任务清单)\s*$/m.test(document)) return document;

  const section = renderTaskSection(tasks);
  // 插到「## 学习笔记」前，避免学习笔记被挤到任务下方
  const noteIndex = document.search(/^#{1,6}\s*学习笔记\s*$/m);
  if (noteIndex >= 0) {
    const before = document.slice(0, noteIndex).replace(/\s+$/, "");
    const after = document.slice(noteIndex);
    return `${before}\n\n${section}\n\n${after}`;
  }
  return `${document.replace(/\s+$/, "")}\n\n${section}\n`;
}
