// ============================================================
// Memory v2 类型与常量
//
// 这里只放**领域类型**和**校验边界**，不放数据库访问。
// 存储层见 store.ts，生命周期/检索/上下文构建各自独立。
// ============================================================

/** 记忆类型。与 schema.prisma 的 Memory.kind 对应。 */
export const MEMORY_KINDS = [
  "goal",
  "skill",
  "weakness",
  "preference",
  "habit",
  "fact",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** 检索任务类型：决定类型配额与上下文排序。 */
export const MEMORY_TASKS = ["chat", "planning", "analysis", "doc_edit"] as const;
export type MemoryTask = (typeof MEMORY_TASKS)[number];

/** AI 入口场景，与 src/lib/tools/router.ts 的 AiSurface 保持一致。 */
export const MEMORY_SURFACES = ["agent", "plan", "doc"] as const;
export type MemorySurface = (typeof MEMORY_SURFACES)[number];

export function isMemoryKind(value: unknown): value is MemoryKind {
  return (
    typeof value === "string" &&
    (MEMORY_KINDS as readonly string[]).includes(value)
  );
}

/** 记忆状态。active 之外都默认不自动注入。 */
export const MEMORY_STATUSES = [
  "active",
  "superseded",
  "expired",
  "archived",
  "deleted",
] as const;

export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

/** 记忆来源。assistant_inference 已被服务端拒绝，不会落库。 */
export const MEMORY_SOURCE_TYPES = [
  "user_statement",
  "user_correction",
  "consolidation",
  "legacy",
  "user_edit",
] as const;

export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number];

/** 候选批次状态。 */
export const MEMORY_CANDIDATE_STATUSES = [
  "pending",
  "running",
  "ready",
  "done",
  "noop",
  "failed",
  "skipped",
] as const;

export type MemoryCandidateStatus =
  (typeof MEMORY_CANDIDATE_STATUSES)[number];

/** 服务端硬限制。prompt 里的约束必须在这里有对应实现。 */
export const MEMORY_LIMITS = {
  /** v2 新写入的正文上限（存量迁移数据不裁切） */
  contentMaxChars: 200,
  /** 一轮抽取最多提交的操作数 */
  maxOperationsPerTurn: 3,
  /** evidence 摘录上限 */
  evidenceMaxChars: 500,
  /** 单次抽取最多传给模型的已有记忆条数 */
  extractionExistingLimit: 12,
  /** 自动注入的 token 预算（按 surface 可再调） */
  defaultContextTokenBudget: 600,
  /** normalizedKey 允许的字符集与长度 */
  normalizedKeyMaxChars: 80,
} as const;

export const NORMALIZED_KEY_PATTERN = /^[a-z0-9:_\-.]{1,80}$/;

/** 一条长期记忆的领域对象。embedding 刻意不在这里——应用层从不读回向量。 */
export interface MemoryRecord {
  id: string;
  userId: string;
  legacyId: string | null;
  kind: MemoryKind;
  content: string;
  normalizedKey: string | null;
  status: MemoryStatus;
  importance: number;
  confidence: number;
  validFrom: Date | null;
  validTo: Date | null;
  lastConfirmedAt: Date;
  lastRetrievedAt: Date | null;
  lastInjectedAt: Date | null;
  injectedCount: number;
  toolReadCount: number;
  supersedesId: string | null;
  sourceType: MemorySourceType;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  embeddingModel: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** 抽取产出的记忆草稿。 */
export interface MemoryDraft {
  kind: MemoryKind;
  content: string;
  normalizedKey?: string | null;
  importance: number;
  confidence: number;
  validFrom?: string | null;
  validTo?: string | null;
}

/**
 * 候选操作。
 *
 * 注意：LLM 只负责“提议”，真正的合法性由 manager.ts 校验。
 * 这里保留 evidence 字段，是为了让每条操作都能回指用户原话。
 */
export type MemoryOperation =
  | (MemoryDraft & {
      op: "ADD";
      evidence: string;
      sourceType: MemorySourceType;
    })
  | (MemoryDraft & {
      op: "UPDATE";
      targetId: string;
      evidence: string;
      sourceType: MemorySourceType;
    })
  | {
      op: "DELETE";
      targetId: string;
      evidence: string;
      sourceType: MemorySourceType;
    }
  | {
      op: "NOOP";
      reason?: string;
    };

export interface MemoryCandidateOperations {
  operations: MemoryOperation[];
}

/** 工具/上下文返回给模型的记忆视图。 */
export interface MemoryView {
  id: string;
  kind: MemoryKind;
  content: string;
  confidence: number;
  importance: number;
  updatedAt: Date;
  sourceType: MemorySourceType;
  sourceMessageId: string | null;
  alreadyInContext?: boolean;
}

/** 记忆访问信号（三种“使用”分开记录）。 */
export type MemoryAccessKind = "retrieved" | "injected" | "tool_read";

/** 抽取门控结果。 */
export interface ExtractionGateDecision {
  shouldExtract: boolean;
  /** 命中门控的原因，便于日志与评估 */
  reason:
    | "explicit_signal"
    | "every_three_turns"
    | "correction"
    | "not_eligible"
    | "too_short";
}
