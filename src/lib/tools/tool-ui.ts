// ============================================================
// 工具调用的展示元数据
//
// 界面上要把「AI 调了什么工具」渲染成卡片，需要三样东西：动作名、读/写分类
// （读类默认折叠、写类展开）、以及一条落库用的短摘要。
//
// 为什么摘要是在**落库时**算好存下来的，而不是存原始 input/output：
// updateDocument 的 input 是**整篇文档**（zod 上限 100000 字符），原样存等于把
// 整篇文档复制进每一条消息行。而且 UI 也用不上——studio-tools.ts 的
// updateDocument 只返回 { success: true }，没有可比对的 diff。
// 所以存「已修改文档（1234 字）」这种算好的字符串即可。
//
// 白名单是 fail-closed：往工具工厂里加一个新工具，它不会自动出现在这里，
// 必须显式登记。tests/tool-ui.test.ts 逐个核对 SURFACE_POLICY 里出现的每个
// 工具名都有登记——漏登记的表现是卡片显示成裸工具名，属于静默降级。
// ============================================================

export type ToolKind = "read" | "write";

export interface ToolUiSpec {
  /** 动作名，完成态显示。进行中显示为「正在${label}…」 */
  label: string;
  /** 读工具默认折叠成一行，写工具展开成卡片 */
  kind: ToolKind;
  /** 落库时算出的短摘要；返回 undefined 表示没什么可补充的 */
  summarize?: (input: unknown, output: unknown) => string | undefined;
}

/** 从工具入参里安全取字段（入参是 unknown，模型给什么都可能） */
function field(source: unknown, key: string): unknown {
  if (source === null || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
}

/** 取一个非空字符串，顺带截断——摘要不该比卡片还长 */
function str(value: unknown, max = 40): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "待开始",
  in_progress: "进行中",
  done: "已完成",
  skipped: "已跳过",
};

export const TOOL_UI: Record<string, ToolUiSpec> = {
  // ---------- 读工具：默认折叠 ----------
  getStudyStats: { label: "查看学习统计", kind: "read" },
  getMyPlans: { label: "查看学习计划", kind: "read" },
  getRecentCheckins: { label: "查看打卡记录", kind: "read" },
  getMyMemories: { label: "回忆长期记忆", kind: "read" },
  searchKnowledgeBase: {
    label: "检索知识库",
    kind: "read",
    summarize: (input) => str(field(input, "query")),
  },
  listKnowledgeDocs: { label: "列出知识库文档", kind: "read" },
  getPlanTasks: { label: "查看计划任务", kind: "read" },
  getTodayTasks: { label: "查看今日任务", kind: "read" },
  getMyTodos: { label: "查看今日待办", kind: "read" },

  // ---------- 写工具：展开成卡片 ----------
  createPlan: {
    label: "创建学习计划",
    kind: "write",
    summarize: (input) => {
      const name = str(field(input, "name"), 30);
      return name ? `「${name}」` : undefined;
    },
  },
  breakdownPlanTasks: {
    label: "拆分学习任务",
    kind: "write",
    summarize: (_input, output) => {
      const n = num(field(output, "count")) ?? num(field(output, "taskCount"));
      return n === undefined ? undefined : `${n} 个任务`;
    },
  },
  updateTaskStatus: {
    label: "更新任务状态",
    kind: "write",
    summarize: (input) => {
      const status = str(field(input, "status"));
      return status ? (TASK_STATUS_LABEL[status] ?? status) : undefined;
    },
  },
  createTodo: {
    label: "新增待办",
    kind: "write",
    summarize: (input) => {
      const title = str(field(input, "title"), 30);
      return title ? `「${title}」` : undefined;
    },
  },
  updateTodo: {
    label: "更新待办",
    kind: "write",
    summarize: (input) => {
      const title = str(field(input, "title"), 30);
      return title ? `「${title}」` : undefined;
    },
  },
  deleteTodo: { label: "删除待办", kind: "write" },
  updatePlanInfo: {
    label: "更新计划信息",
    kind: "write",
    summarize: (input) => {
      const updated = field(input, "updatedFields") ?? input;
      const names: string[] = [];
      if (str(field(updated, "name"))) names.push("名称");
      if (str(field(updated, "goal"))) names.push("目标");
      if (str(field(updated, "description"))) names.push("说明");
      return names.length ? names.join("、") : undefined;
    },
  },
  updateDocument: {
    label: "修改文档",
    kind: "write",
    summarize: (input) => {
      const content = field(input, "content");
      return typeof content === "string" ? `${content.length} 字` : undefined;
    },
  },
};

/** 未登记的工具（新加了工具但忘了登记，或 SDK 的 dynamic-tool）不崩，退化成裸名 */
export function toolUi(toolName: string): ToolUiSpec {
  return TOOL_UI[toolName] ?? { label: toolName, kind: "write" };
}
