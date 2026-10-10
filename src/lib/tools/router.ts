// ============================================================
// 工具 router —— 按场景声明「给哪些工具 + 配哪段提示词」
//
// 背景：/api/ai 是三个界面共用的唯一端点（智能体页 / 计划工作台 / 文档工作台）。
// 原先它把 5 个工具工厂无条件全量展开，于是文档工作台里也握着 deleteTodo /
// updateTaskStatus / breakdownPlanTasks —— 用户让 AI 改一个错别字，AI 理论上
// 可以顺手删掉待办。这些工具全部直接落库、无审批。
//
// 规则（一句话）：
//   工作台 = 全部读工具 + 当前工作台自己的写工具；智能体 = 全部。
// 读工具没有爆炸半径，所以全留意味着问答能力零损失；只砍「改非当前对象」的写工具。
//
// ⚠️ 工具白名单与提示词分组必须写在同一个常量里。SYSTEM_PROMPT 是全部场景共用的，
//    里面点名了每一个工具并带祈使指令（「调用 createPlan 创建计划」…）。只裁工具
//    不裁提示词，模型会反复去调一个不存在的工具——比不裁更糟。二者只在一处声明，
//    才谈得上不漂移。
//
// 白名单是 fail-closed：往工厂里加一个新工具，它不会自动出现在任何场景，
// 必须显式列出来。这正是原先缺的那道闸门。
// ============================================================

/** 三个场景。会话表 Conversation.surface 用的就是这三个值。 */
export const AI_SURFACES = ["agent", "plan", "doc"] as const;
export type AiSurface = (typeof AI_SURFACES)[number];

/**
 * 提示词分组。每一组对应 deepseek.ts 里**一段连续的原文**——
 * 刻意按原有段落边界切，不逐条打散重排，这样智能体场景拼出来的系统提示词
 * 与改动前的 SYSTEM_PROMPT 逐字相同（有测试钉着）。
 *
 * 各段含哪些工具名（决定它能不能给工作台）：
 *   knowledge      searchKnowledgeBase, listKnowledgeDocs
 *   planning       createPlan, getStudyStats, getMyPlans, getMyMemories, breakdownPlanTasks
 *   agentWorkflow  breakdownPlanTasks, getTodayTasks, getPlanTasks, updateTaskStatus
 *   toolReference  全部 15 个工具的能力清单 + 触发映射
 *   conduct        不点名任何工具
 */
export const ALL_PROMPT_GROUPS = [
  "knowledge", // 知识库（RAG）怎么用、以及「列举 ≠ 检索」那条排他说明
  "planning", // 制定学习计划的工作流
  "agentWorkflow", // 任务拆分 + 每日检查 + 进度管理
  "toolReference", // 能力清单 / 什么时候用工具
  "conduct", // 行为准则
] as const satisfies readonly string[];

export type PromptGroup = (typeof ALL_PROMPT_GROUPS)[number];

/** 写工具：会改「非当前工作台对象」的数据，因此只在智能体场景出现 */
const WRITE_TOOLS_OUTSIDE_STUDIO = [
  "breakdownPlanTasks",
  "updateTaskStatus",
  "createTodo",
  "updateTodo",
  "deleteTodo",
] as const;

/** 工作台共有的读工具 */
const STUDIO_READ_TOOLS = [
  "getMyPlans",
  "getRecentCheckins",
  "getMyMemories",
  "getStudyStats",
  "searchKnowledgeBase",
  "listKnowledgeDocs",
  "getPlanTasks",
  "getTodayTasks",
  "getMyTodos",
] as const;

/**
 * 工作台拿到的提示词段落。
 *
 * 只给 knowledge + conduct：知识库那段末尾的「列举要用 listKnowledgeDocs、不要用
 * searchKnowledgeBase」是踩过真实生产事故才写下的，必须留着；其余段落都点名了
 * 工作台没有的工具。9 个读工具在工作台里靠工具自身的 description 说明用途
 * （见各 tools/*.ts），不再由系统提示词重复一遍。
 */
const STUDIO_PROMPT_GROUPS = [
  "knowledge",
  "conduct",
] as const satisfies readonly PromptGroup[];

export interface SurfacePolicy {
  /** 该场景注册的工具白名单（工具名） */
  tools: readonly string[];
  /** 该场景注入的提示词分组 */
  promptGroups: readonly PromptGroup[];
}

export const SURFACE_POLICY: Record<AiSurface, SurfacePolicy> = {
  // 智能体：通用助手，写工具在这里是正当能力（「帮我记个待办」），
  // 也没有「当前文档」需要保护。唯一的例外是 studio 工具——没有打开的文档，
  // updateDocument / updatePlanInfo 无从作用。
  agent: {
    tools: [
      "createPlan",
      ...STUDIO_READ_TOOLS,
      ...WRITE_TOOLS_OUTSIDE_STUDIO,
    ],
    promptGroups: ALL_PROMPT_GROUPS,
  },

  // 计划工作台：能改当前这份计划的文档与基本信息，也能勾任务状态——
  // 但勾选是 updateDocument 改「## 任务安排」段 + plan-sync 回写，不是 updateTaskStatus。
  // 任务进度的交互式勾选框在 /plans 抽屉里，走自己的 PATCH 路由，与 AI 工具无关。
  plan: {
    tools: [...STUDIO_READ_TOOLS, "updatePlanInfo", "updateDocument"],
    promptGroups: STUDIO_PROMPT_GROUPS,
  },

  // 文档工作台：只有当前文档可写。计划相关的写工具一律不给——
  // 用户在这块屏幕上要改的是正文，不该顺手动别的实体。
  doc: {
    tools: [...STUDIO_READ_TOOLS, "updateDocument"],
    promptGroups: STUDIO_PROMPT_GROUPS,
  },
};

/** 从请求体里的 studioContext 判定场景（与 route.ts 建会话时的口径一致） */
export function surfaceOf(
  studioContext?: { kind?: "plan" | "doc" } | null
): AiSurface {
  if (studioContext?.kind === "plan") return "plan";
  if (studioContext) return "doc";
  return "agent";
}

export function toolNamesFor(surface: AiSurface): readonly string[] {
  return SURFACE_POLICY[surface].tools;
}

export function promptGroupsFor(surface: AiSurface): readonly PromptGroup[] {
  return SURFACE_POLICY[surface].promptGroups;
}

/**
 * 按白名单过滤候选工具集。
 *
 * 返回类型标成 T 而不是 Partial<T>：AI SDK 的 tools 参数要的是
 * Record<string, Tool>，Partial 会把每个值变成 Tool | undefined，通不过类型检查。
 * 运行时返回的确实是子集，所以这个"谎"只影响这一处的类型，而白名单是常量、
 * 且有测试逐个核对——比在调用点写 as 更收敛。
 *
 * @param candidates 已按场景建好的全部候选工具（含 studio 工具，若适用）
 * @param surface    目标场景
 */
export function pickTools<T extends Record<string, unknown>>(
  candidates: T,
  surface: AiSurface
): T {
  const allowed = new Set<string>(toolNamesFor(surface));
  const picked: Record<string, unknown> = {};
  for (const [name, tool] of Object.entries(candidates)) {
    if (allowed.has(name)) picked[name] = tool;
  }
  return picked as T;
}
