import { z } from "zod";

// AgentRun.status 的可达取值。
// 原 awaiting_approval / cancelled / rejected 只由已移除的规划审批链路
// 与 run 取消接口写入，随该链路一并删掉。
export const agentRunStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
] as const;

export type AgentRunStatus = (typeof agentRunStatuses)[number];

export const planTaskDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(600).nullish(),
  dayNumber: z.number().int().min(1).max(365).nullish(),
  weekNumber: z.number().int().min(1).max(52).nullish(),
  category: z
    .enum(["study", "project", "review", "exercise"])
    .default("study"),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
});

export const planDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(600).nullish(),
  goal: z.string().trim().min(1).max(600),
  tasks: z.array(planTaskDraftSchema).max(40).default([]),
  assumptions: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
});

export type PlanDraft = z.infer<typeof planDraftSchema>;

// ---- Analyze 阶段的结构化输出 ----
//
// ⚠️ 这里的枚举必须与 prompts.ts 的 AGENT_COACH_PROMPT「输出格式」段严格一致。
// prompt 改了而这里没改的后果不是报错，是**所有**分析都被判为无效、
// 整批静默落到规则兜底——所以改 prompt 时务必同步改这里。
//
// 之前 analyze 只做 JSON.parse 不校验，模型返回 {"foo":1} 会被读成
// 「on_track + 空 findings」，即"一切正常"。这个 schema 就是补上的那道闸门。

export const analysisFindingSchema = z.object({
  category: z.enum(["progress", "weakness", "deviation", "streak", "habit"]),
  severity: z.enum(["info", "warning", "critical"]),
  detail: z.string().trim().min(1).max(2000),
  // evidence 只是随分析存进 AgentStep.output 的元数据，不参与任何用户可见的渲染，
  // 所以用 .catch 放宽：模型给成字符串/null/忘了给都不该让整份分析作废。
  evidence: z.record(z.string(), z.unknown()).catch({}),
});

export type AnalysisFinding = z.infer<typeof analysisFindingSchema>;

export const agentActionSchema = z.object({
  type: z.enum([
    "ADJUST_PLAN",
    "SEND_REMINDER",
    "GENERATE_REPORT",
    "ENCOURAGE",
  ]),
  priority: z.enum(["high", "normal", "low"]),
  reason: z.string().trim().min(1).max(1000),
  detail: z.string().trim().min(1).max(2000),
});

export type AgentAction = z.infer<typeof agentActionSchema>;

export const agentAnalysisSchema = z.object({
  status: z.enum(["on_track", "need_attention", "need_adjustment", "at_risk"]),
  summary: z.string().trim().min(1).max(2000),
  // 允许为空数组：用户确实一切正常时，没有 findings / actions 是**合法结果**。
  // 不要照搬 service.ts:126「tasks 为空即无效」那个守卫——那里成立是因为
  // 没任务的计划没用，这里照搬会把正常用户误判成兜底。
  // 上界给得宽松（prompt 要求 ≤5/≤3），目的是拦住畸形大 payload 而不是卡模型。
  findings: z.array(analysisFindingSchema).max(20).default([]),
  actions: z.array(agentActionSchema).max(10).default([]),
});

export type AgentAnalysis = z.infer<typeof agentAnalysisSchema>;

export interface AgentContextSnapshot {
  totalCheckins: number;
  activePlans: { id: string; name: string; progress: number }[];
  memoryCount: number;
}

