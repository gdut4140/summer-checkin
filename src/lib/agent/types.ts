import { z } from "zod";

export const agentRunStatuses = [
  "queued",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
  "rejected",
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
  totalHours: number;
  recentHours: number;
  activePlans: { id: string; name: string; progress: number }[];
  memoryCount: number;
}

export interface AgentRunResponse {
  id: string;
  mode: string;
  goal: string;
  status: string;
  currentStep: number;
  maxSteps: number;
  summary: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: {
    id: string;
    stepNumber: number;
    kind: string;
    status: string;
    title: string;
    detail: string | null;
    input: unknown;
    output: unknown;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }[];
  approvals: {
    id: string;
    action: string;
    status: string;
    payload: unknown;
    decisionReason: string | null;
    decidedAt: string | null;
    createdAt: string;
  }[];
}

