// ============================================================
// Memory v2 候选校验（纯函数）
//
// LLM 只负责“提议”，这里负责把提议变成**可写入的结构**：
//   · 类型 / 分数 / 长度 / 日期合法性
//   · UPDATE / DELETE 的 target 必须属于当前用户
//   · evidence 必须是用户原话的摘录
//
// 纯函数，不碰数据库，方便单测。
// ============================================================

import {
  isMemoryKind,
  MEMORY_LIMITS,
  NORMALIZED_KEY_PATTERN,
  type MemoryDraft,
  type MemoryKind,
  type MemoryOperation,
  type MemorySourceType,
} from "./types";

export interface ExistingMemorySummary {
  id: string;
  kind: MemoryKind;
  content: string;
  normalizedKey: string | null;
}

export interface ValidateContext {
  /** 本次抽取窗口里的全部用户消息（evidence 可以来自其中任意一条） */
  userMessages: string[];
  /** 传给模型的已有记忆（用于校验 targetId 归属） */
  existing: ExistingMemorySummary[];
  /** ADD 的来源；UPDATE 会被强制标成 user_correction */
  sourceType: MemorySourceType;
}

export interface RejectedOperation {
  index: number;
  reason: string;
}

export interface ValidateResult {
  operations: MemoryOperation[];
  rejected: RejectedOperation[];
}

const PUNCTUATION =
  /[\s，。！？、；：""''（）()【】\[\]《》…—\-·,.!?;:'"`~/／|｜]/g;

/** 用户明确表达“删除/忘记”的意图。DELETE 操作必须命中。 */
const DELETE_INTENT = /(忘掉|忘记|删掉|删除|去掉|不要记|别记|清除)/;

function stripForEvidence(value: string): string {
  return value.replace(PUNCTUATION, "").toLowerCase();
}

/** evidence 必须是某条用户消息（或本次窗口内多条消息拼接）的摘录。 */
export function evidenceMatchesUserMessages(
  evidence: string,
  userMessages: string[]
): boolean {
  const needle = stripForEvidence(evidence);
  if (needle.length < 4) return false;
  // 模型经常把两轮用户消息拼成一条 evidence（“我原来用 Vue。现在改用 React。”），
  // 只要拼接后仍是用户原话的连续片段，就应当接受。
  const haystack = userMessages.map(stripForEvidence).join("");
  return haystack.includes(needle);
}

export function normalizeMemoryContent(
  value: unknown
): { value: string } | { error: string } {
  if (typeof value !== "string") return { error: "content_missing" };
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { error: "content_empty" };
  if (cleaned.length > MEMORY_LIMITS.contentMaxChars) {
    return { error: "content_too_long" };
  }
  return { value: cleaned };
}

export function normalizeNormalizedKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return NORMALIZED_KEY_PATTERN.test(key) ? key : null;
}

export function clampScore(value: unknown, fallback = 0.5): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDraft(
  raw: Record<string, unknown>
): { draft: MemoryDraft } | { error: string } {
  if (!isMemoryKind(raw.kind)) return { error: "kind_invalid" };

  const content = normalizeMemoryContent(raw.content);
  if ("error" in content) return { error: content.error };

  const validFrom = parseDate(raw.validFrom);
  const validTo = parseDate(raw.validTo);
  if (validFrom && validTo && validTo.getTime() <= validFrom.getTime()) {
    return { error: "validity_invalid" };
  }

  return {
    draft: {
      kind: raw.kind,
      content: content.value,
      normalizedKey: normalizeNormalizedKey(raw.normalizedKey),
      importance: clampScore(raw.importance),
      confidence: clampScore(raw.confidence),
      validFrom: validFrom ? validFrom.toISOString() : null,
      validTo: validTo ? validTo.toISOString() : null,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 校验模型返回的操作列表。
 *
 * 单条非法只丢弃该条，不整批作废——这样一次模型抖动不会损失全部记忆。
 * 全部非法时返回空 operations，由调用方记为 NOOP。
 */
export function validateRawOperations(
  raw: unknown,
  context: ValidateContext
): ValidateResult {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { operations?: unknown })?.operations)
      ? ((raw as { operations: unknown[] }).operations)
      : [];

  const existingById = new Map(context.existing.map((m) => [m.id, m]));
  const operations: MemoryOperation[] = [];
  const rejected: RejectedOperation[] = [];

  // 同一批里如果已经 UPDATE/DELETE 了某条旧记忆，就不要再 ADD 它的旧状态。
  // 这是小模型常见的问题：既输出“改成 React”，又顺手把“原来用 Vue”当作新事实。
  const updateTargets: ExistingMemorySummary[] = [];
  for (const item of list) {
    const record = asRecord(item);
    if (!record) continue;
    const op = typeof record.op === "string" ? record.op.toUpperCase() : "";
    if (
      (op === "UPDATE" || op === "DELETE") &&
      typeof record.targetId === "string"
    ) {
      const target = existingById.get(record.targetId);
      if (target) updateTargets.push(target);
    }
  }
  const conflictingKeys = new Set(
    updateTargets
      .map((target) => target.normalizedKey)
      .filter((key): key is string => Boolean(key))
  );
  const conflictingContents = updateTargets
    .map((target) => stripForEvidence(target.content))
    .filter((content) => content.length >= 4);

  for (const [index, item] of list.entries()) {
    if (operations.length >= MEMORY_LIMITS.maxOperationsPerTurn) {
      rejected.push({ index, reason: "too_many_operations" });
      continue;
    }

    const record = asRecord(item);
    if (!record) {
      rejected.push({ index, reason: "not_an_object" });
      continue;
    }

    const op = typeof record.op === "string" ? record.op.toUpperCase() : "";

    if (op === "NOOP") {
      operations.push({
        op: "NOOP",
        reason: typeof record.reason === "string" ? record.reason : undefined,
      });
      continue;
    }

    if (op === "DELETE") {
      const targetId =
        typeof record.targetId === "string" ? record.targetId : "";
      const target = existingById.get(targetId);
      if (!target) {
        rejected.push({ index, reason: "target_not_found" });
        continue;
      }
      const evidence =
        typeof record.evidence === "string" ? record.evidence.trim() : "";
      // 删除是三段式校验：target 必须属于用户、用户必须表达删除意图。
      // evidence 可以省略（小模型经常不给），也可以引用目标正文。
      const hasDeleteIntent = context.userMessages.some((message) =>
        DELETE_INTENT.test(message)
      );
      const evidenceOk =
        hasDeleteIntent ||
        (evidence !== "" &&
          (evidenceMatchesUserMessages(evidence, context.userMessages) ||
            evidenceMatchesUserMessages(evidence, [target.content])));
      if (!evidenceOk) {
        rejected.push({ index, reason: "delete_intent_not_found" });
        continue;
      }
      operations.push({
        op: "DELETE",
        targetId,
        evidence,
        sourceType: "user_correction",
      });
      continue;
    }

    if (op !== "ADD" && op !== "UPDATE") {
      rejected.push({ index, reason: "op_unknown" });
      continue;
    }

    const evidence =
      typeof record.evidence === "string" ? record.evidence.trim() : "";
    if (!evidenceMatchesUserMessages(evidence, context.userMessages)) {
      rejected.push({ index, reason: "evidence_not_found" });
      continue;
    }

    const draft = buildDraft(record);
    if ("error" in draft) {
      rejected.push({ index, reason: draft.error });
      continue;
    }

    if (op === "ADD") {
      if (
        draft.draft.normalizedKey &&
        conflictingKeys.has(draft.draft.normalizedKey)
      ) {
        rejected.push({ index, reason: "conflicts_with_update" });
        continue;
      }
      const addContent = stripForEvidence(draft.draft.content);
      if (
        addContent.length >= 4 &&
        conflictingContents.some(
          (content) =>
            content.includes(addContent) || addContent.includes(content)
        )
      ) {
        rejected.push({ index, reason: "conflicts_with_update" });
        continue;
      }
      operations.push({
        op: "ADD",
        ...draft.draft,
        evidence,
        sourceType: context.sourceType,
      });
      continue;
    }

    const targetId = typeof record.targetId === "string" ? record.targetId : "";
    if (!existingById.has(targetId)) {
      rejected.push({ index, reason: "target_not_found" });
      continue;
    }

    operations.push({
      op: "UPDATE",
      ...draft.draft,
      targetId,
      evidence,
      sourceType: "user_correction",
    });
  }

  return { operations, rejected };
}
