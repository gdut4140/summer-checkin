// ============================================================
// Phase 2: AgentDecision 服务
//
// 记录 Agent 的每一次自主决策，供后续：
// ① 追溯 — 查看 Agent 在过去做了哪些干预
// ② 评估 — 统计决策采纳率、效果
// ③ 优化 — 分析决策质量，改进 prompt 和策略
//
// 设计原则：
// - 决策记录不阻塞 Agent 主流程（fire-and-forget 或 try-catch 包裹）
// - 每个决策关联到 AgentRun，方便按运行批次追溯
// - status 字段支持决策生命周期：executed → 用户采纳/拒绝 → 效果评估
// ============================================================

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

// ---- 类型 ----

export type DecisionType =
  | "PLAN_ADJUST"
  | "REMINDER"
  | "ANALYSIS"
  | "TASK_CREATE";

export type DecisionStatus =
  | "executed"
  | "pending"
  | "rejected"
  | "failed";

export interface AgentDecisionRecord {
  id: string;
  userId: string;
  runId: string | null;
  type: DecisionType;
  reason: string;
  action: Record<string, unknown>;
  status: DecisionStatus;
  feedback: string | null;
  createdAt: string;
}

// ---- 创建决策 ----

interface CreateDecisionInput {
  userId: string;
  runId?: string;
  type: DecisionType;
  reason: string;
  action: Record<string, unknown>;
  status?: DecisionStatus;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function createDecision(
  input: CreateDecisionInput
): Promise<AgentDecisionRecord | null> {
  try {
    const decision = await prisma.agentDecision.create({
      data: {
        userId: input.userId,
        runId: input.runId ?? null,
        type: input.type,
        reason: input.reason,
        action: asJson(input.action),
        status: input.status ?? "executed",
      },
    });

    console.log(
      `[Decision] 创建决策: ${decision.type} | user=${input.userId} | run=${input.runId ?? "no-run"}`
    );

    return {
      id: decision.id,
      userId: decision.userId,
      runId: decision.runId,
      type: decision.type as DecisionType,
      reason: decision.reason,
      action: (decision.action as Record<string, unknown>) ?? {},
      status: decision.status as DecisionStatus,
      feedback: decision.feedback,
      createdAt: decision.createdAt.toISOString(),
    };
  } catch (error) {
    console.error("[Decision] 创建失败:", error);
    return null;
  }
}

// ---- 查询 ----

export async function listDecisions(
  userId: string,
  options: {
    type?: DecisionType;
    limit?: number;
    runId?: string;
  } = {}
): Promise<AgentDecisionRecord[]> {
  const where: Record<string, unknown> = { userId };
  if (options.type) where.type = options.type;
  if (options.runId) where.runId = options.runId;

  const decisions = await prisma.agentDecision.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 20,
  });

  return decisions.map((d) => ({
    id: d.id,
    userId: d.userId,
    runId: d.runId,
    type: d.type as DecisionType,
    reason: d.reason,
    action: (d.action as Record<string, unknown>) ?? {},
    status: d.status as DecisionStatus,
    feedback: d.feedback,
    createdAt: d.createdAt.toISOString(),
  }));
}

/**
 * 获取最近一次 Agent 分析决策
 */
export async function getLatestAnalysis(
  userId: string
): Promise<AgentDecisionRecord | null> {
  const decisions = await listDecisions(userId, { type: "ANALYSIS", limit: 1 });
  return decisions[0] ?? null;
}

// ---- 更新 ----

/**
 * 更新决策状态（用户采纳/拒绝后的反馈）
 */
export async function updateDecisionStatus(
  decisionId: string,
  userId: string,
  status: DecisionStatus,
  feedback?: string
): Promise<boolean> {
  try {
    const decision = await prisma.agentDecision.findFirst({
      where: { id: decisionId, userId },
    });
    if (!decision) return false;

    await prisma.agentDecision.update({
      where: { id: decisionId },
      data: {
        status,
        feedback: feedback ?? null,
      },
    });
    return true;
  } catch (error) {
    console.error("[Decision] 更新状态失败:", error);
    return false;
  }
}

// ---- 统计 ----

export interface DecisionStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  recentRate: number; // 最近7天采纳率
}

export async function getDecisionStats(userId: string): Promise<DecisionStats> {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const [all, recentWeek] = await Promise.all([
    prisma.agentDecision.findMany({
      where: { userId },
      select: { type: true, status: true },
    }),
    prisma.agentDecision.findMany({
      where: { userId, createdAt: { gte: weekStart } },
      select: { status: true },
    }),
  ]);

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const d of all) {
    byType[d.type] = (byType[d.type] ?? 0) + 1;
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
  }

  const recentRate =
    recentWeek.length > 0
      ? Math.round(
          (recentWeek.filter(
            (d) => d.status === "executed" || d.status === "pending"
          ).length /
            recentWeek.length) *
            100
        )
      : 0;

  return { total: all.length, byType, byStatus, recentRate };
}
