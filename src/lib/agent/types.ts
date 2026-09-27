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

export interface AgentContextSnapshot {
  totalCheckins: number;
  activePlans: { id: string; name: string; progress: number }[];
  memoryCount: number;
}

