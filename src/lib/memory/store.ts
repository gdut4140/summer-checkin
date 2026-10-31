// ============================================================
// Memory v2 存储层
//
// 只负责“怎么和数据库打交道”：
//   · 行 ↔ 领域对象映射
//   · 带向量列的原始 SQL（Prisma 不支持 Unsupported 字段的写入）
//   · 按用户串行化的事务（advisory lock）
//   · 候选队列与事件日志的读写
//
// 业务规则（该不该 ADD/UPDATE、冲突怎么判）在 manager.ts，
// 不要下沉到这里。
// ============================================================

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-generated/client";
import { prisma } from "@/lib/prisma";
import { toPgVector } from "@/lib/rag/retriever";
import type {
  MemoryCandidateStatus,
  MemoryKind,
  MemoryRecord,
  MemorySourceType,
  MemoryStatus,
} from "./types";

export type Db = typeof prisma | Prisma.TransactionClient;

const memorySelect = {
  id: true,
  userId: true,
  legacyId: true,
  kind: true,
  content: true,
  normalizedKey: true,
  status: true,
  importance: true,
  confidence: true,
  validFrom: true,
  validTo: true,
  lastConfirmedAt: true,
  lastRetrievedAt: true,
  lastInjectedAt: true,
  injectedCount: true,
  toolReadCount: true,
  supersedesId: true,
  sourceType: true,
  sourceConversationId: true,
  sourceMessageId: true,
  embeddingModel: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.MemorySelect;

type MemoryRow = Prisma.MemoryGetPayload<{ select: typeof memorySelect }>;

export function toMemoryRecord(row: MemoryRow): MemoryRecord {
  return {
    ...row,
    kind: row.kind as MemoryKind,
    status: row.status as MemoryStatus,
    sourceType: row.sourceType as MemorySourceType,
  };
}

/**
 * 同一用户的记忆写入串行化。
 *
 * 用 PostgreSQL 事务级 advisory lock，而不是应用层锁：
 * 多进程 / 多容器也能生效；事务结束自动释放，不会留下死锁。
 * hashtext 返回 int4，显式转 bigint 以匹配 pg_advisory_xact_lock 的重载。
 */
export async function withUserMemoryLock<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // pg_advisory_xact_lock 返回 void，Prisma 无法反序列化 void 列；
      // 用 CTE 把它包起来，只 SELECT 一个 int。
      await tx.$queryRawUnsafe(
        `WITH lock AS (
           SELECT pg_advisory_xact_lock(hashtext($1)::bigint)
         )
         SELECT 1 AS locked FROM lock`,
        userId
      );
      return fn(tx);
    },
    { timeout: 10_000 }
  );
}

// ---- 查询 ----

export async function findMemoryById(
  id: string,
  userId: string,
  db: Db = prisma
): Promise<MemoryRecord | null> {
  const row = await db.memory.findFirst({
    where: { id, userId },
    select: memorySelect,
  });
  return row ? toMemoryRecord(row) : null;
}

export async function findActiveByKey(
  userId: string,
  normalizedKey: string,
  db: Db = prisma
): Promise<MemoryRecord | null> {
  const row = await db.memory.findFirst({
    where: { userId, normalizedKey, status: "active" },
    select: memorySelect,
  });
  return row ? toMemoryRecord(row) : null;
}

export async function listActiveMemories(
  userId: string,
  db: Db = prisma
): Promise<MemoryRecord[]> {
  const rows = await db.memory.findMany({
    where: { userId, status: "active" },
    select: memorySelect,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toMemoryRecord);
}

/** 按给定 id 顺序取回 active 记忆（检索阶段保持相似度排序）。 */
export async function findMemoriesByIds(
  ids: string[],
  userId: string,
  db: Db = prisma
): Promise<MemoryRecord[]> {
  if (ids.length === 0) return [];
  const rows = await db.memory.findMany({
    where: { id: { in: ids }, userId, status: "active" },
    select: memorySelect,
  });
  const byId = new Map(rows.map((row) => [row.id, toMemoryRecord(row)]));
  return ids.map((id) => byId.get(id)).filter((row): row is MemoryRecord => !!row);
}

/** 用结构化的 kind + 重要度取稳定画像候选（无 query 时也跑）。 */
export async function listStableMemories(
  userId: string,
  kinds: MemoryKind[],
  limit: number,
  db: Db = prisma
): Promise<MemoryRecord[]> {
  const now = new Date();
  const rows = await db.memory.findMany({
    where: {
      userId,
      status: "active",
      kind: { in: kinds },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    select: memorySelect,
    orderBy: [{ importance: "desc" }, { lastConfirmedAt: "desc" }],
    take: limit,
  });
  return rows.map(toMemoryRecord);
}

// ---- 写入 ----

export interface InsertMemoryInput {
  userId: string;
  kind: MemoryKind;
  content: string;
  normalizedKey: string | null;
  importance: number;
  confidence: number;
  validFrom: Date | null;
  validTo: Date | null;
  sourceType: MemorySourceType;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  supersedesId: string | null;
  embedding: number[] | null;
  embeddingModel: string | null;
}

/**
 * 新建一条 active 记忆。
 *
 * 有向量时走原始 SQL（Prisma 没有 embedding 字段的 CreateInput）；
 * 无向量时也可以走原始 SQL，保持单一写路径。
 */
export async function insertMemory(
  tx: Prisma.TransactionClient,
  input: InsertMemoryInput
): Promise<string> {
  const id = randomUUID();
  const now = new Date();

  await tx.$executeRawUnsafe(
    `INSERT INTO memory (
       id, "userId", kind, content, "normalizedKey", status,
       importance, confidence, "validFrom", "validTo", "lastConfirmedAt",
       "supersedesId", "sourceType", "sourceConversationId", "sourceMessageId",
       embedding, "embeddingModel", "createdAt", "updatedAt"
     ) VALUES (
       $1, $2, $3, $4, $5, 'active',
       $6, $7, $8, $9, $10,
       $11, $12, $13, $14,
       $15::vector, $16, $17, $17
     )`,
    id,
    input.userId,
    input.kind,
    input.content,
    input.normalizedKey,
    input.importance,
    input.confidence,
    input.validFrom,
    input.validTo,
    now,
    input.supersedesId,
    input.sourceType,
    input.sourceConversationId,
    input.sourceMessageId,
    input.embedding ? toPgVector(input.embedding) : null,
    input.embeddingModel,
    now
  );

  return id;
}

/** 覆盖旧记忆：状态改为 superseded，并保留 validTo 作为失效时间。 */
export async function supersedeMemory(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  when = new Date()
): Promise<number> {
  const result = await tx.memory.updateMany({
    where: { id, userId, status: "active" },
    data: { status: "superseded", validTo: when },
  });
  return result.count;
}

export async function softDeleteMemory(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  when = new Date()
): Promise<number> {
  const result = await tx.memory.updateMany({
    where: { id, userId, status: { not: "deleted" } },
    data: { status: "deleted", deletedAt: when },
  });
  return result.count;
}

export async function setMemoryEmbedding(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  embedding: number[],
  model: string | null
): Promise<number> {
  const result = await tx.$executeRawUnsafe(
    `UPDATE memory
     SET embedding = $1::vector, "embeddingModel" = $2, "updatedAt" = now()
     WHERE id = $3 AND "userId" = $4`,
    toPgVector(embedding),
    model,
    id,
    userId
  );
  return result;
}

/** 给 embedding 缺失的 active 记忆补向量（每日任务用）。 */
export async function listMemoriesMissingEmbedding(
  userId: string,
  limit = 20
): Promise<MemoryRecord[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string }>
  >(
    `SELECT id FROM memory
     WHERE "userId" = $1 AND status = 'active' AND embedding IS NULL
     ORDER BY "createdAt" ASC
     LIMIT $2`,
    userId,
    limit
  );
  if (rows.length === 0) return [];
  const full = await prisma.memory.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: memorySelect,
  });
  return full.map(toMemoryRecord);
}

// ---- 相似度 / 抽取上下文 ----

export interface SimilarMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  normalizedKey: string | null;
  importance: number;
  confidence: number;
  similarity: number;
}

/**
 * 找与给定向量最相似的一条 active 记忆。
 * 用于 Manager 的 ADD → UPDATE 兜底：LLM 没匹配上，但语义上已经重复。
 */
export async function findMostSimilarActiveMemory(
  userId: string,
  embedding: number[],
  kind?: MemoryKind,
  db: Db = prisma
): Promise<SimilarMemory | null> {
  const rows = await db.$queryRawUnsafe<SimilarMemory[]>(
    `SELECT id, kind, content, "normalizedKey", importance, confidence,
            (1 - (embedding <=> $2::vector))::float8 AS similarity
     FROM memory
     WHERE "userId" = $1
       AND status = 'active'
       AND embedding IS NOT NULL
       AND (("validTo" IS NULL) OR "validTo" > now())
       ${kind ? "AND kind = $4" : ""}
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    ...(kind
      ? [userId, toPgVector(embedding), 1, kind]
      : [userId, toPgVector(embedding), 1])
  );
  return rows[0] ?? null;
}

/**
 * 抽取时给模型的“已有记忆”候选。
 *
 * 优先向量相近，embedding 为空的排最后，再按重要度兜底。
 * 不再固定取“最近 20 条”。
 */
export async function listExtractionContextMemories(
  userId: string,
  embedding: number[] | null,
  limit = 12
): Promise<SimilarMemory[]> {
  if (!embedding) {
    const rows = await prisma.memory.findMany({
      where: { userId, status: "active" },
      select: {
        id: true,
        kind: true,
        content: true,
        normalizedKey: true,
        importance: true,
        confidence: true,
      },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: limit,
    });
    return rows.map((r) => ({
      ...r,
      kind: r.kind as MemoryKind,
      similarity: 0,
    }));
  }

  return prisma.$queryRawUnsafe<SimilarMemory[]>(
    `SELECT id, kind, content, "normalizedKey", importance, confidence,
            COALESCE(1 - (embedding <=> $2::vector), 0)::float8 AS similarity
     FROM memory
     WHERE "userId" = $1
       AND status = 'active'
       AND (("validTo" IS NULL) OR "validTo" > now())
     ORDER BY (embedding IS NULL) ASC,
              embedding <=> $2::vector NULLS LAST,
              importance DESC
     LIMIT $3`,
    userId,
    toPgVector(embedding),
    limit
  );
}

/**
 * 查询相关的 active 记忆（只返回 id + 相似度）。
 *
 * 相似度阈值在 SQL 里就过滤掉，避免“凑满 TopN”式召回。
 * 返回后由 retrieval.ts 再取完整记录、按 kind 配额筛选。
 */
export async function searchActiveMemoryIdsByVector(
  userId: string,
  embedding: number[],
  limit = 30,
  minSimilarity = 0.35
): Promise<Array<{ id: string; similarity: number }>> {
  return prisma.$queryRawUnsafe<Array<{ id: string; similarity: number }>>(
    `SELECT id,
            (1 - (embedding <=> $2::vector))::float8 AS similarity
     FROM memory
     WHERE "userId" = $1
       AND status = 'active'
       AND embedding IS NOT NULL
       AND (("validTo" IS NULL) OR "validTo" > now())
       AND (1 - (embedding <=> $2::vector)) >= $4
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    userId,
    toPgVector(embedding),
    limit,
    minSimilarity
  );
}

// ---- 会话上下文（抽取重试时用） ----

export async function listRecentConversationMessages(
  conversationId: string,
  upToMessageId: string,
  limit = 6
) {
  const current = await prisma.conversationMessage.findUnique({
    where: { id: upToMessageId },
    select: { createdAt: true },
  });
  if (!current) return [];
  const rows = await prisma.conversationMessage.findMany({
    where: {
      conversationId,
      createdAt: { lte: current.createdAt },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return rows.reverse();
}

/** 距离上次抽取已经过去了几条助手消息（用于“每 3 轮抽取一次”）。 */
export async function countAssistantMessagesSince(
  conversationId: string,
  since: Date
): Promise<number> {
  return prisma.conversationMessage.count({
    where: {
      conversationId,
      role: "assistant",
      createdAt: { gt: since },
    },
  });
}

export async function findLatestCandidateForConversation(
  conversationId: string
) {
  return prisma.memoryCandidate.findFirst({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
  });
}

// ---- 事件 ----

export interface InsertMemoryEventInput {
  userId: string;
  memoryId?: string | null;
  action: string;
  actor: string;
  before?: unknown;
  after?: unknown;
  evidence?: string | null;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
}

export async function insertMemoryEvent(
  db: Db,
  input: InsertMemoryEventInput
): Promise<void> {
  await db.memoryEvent.create({
    data: {
      userId: input.userId,
      memoryId: input.memoryId ?? null,
      action: input.action,
      actor: input.actor,
      before:
        input.before === undefined
          ? undefined
          : (input.before as Prisma.InputJsonValue),
      after:
        input.after === undefined
          ? undefined
          : (input.after as Prisma.InputJsonValue),
      evidence: input.evidence ?? null,
      sourceConversationId: input.sourceConversationId ?? null,
      sourceMessageId: input.sourceMessageId ?? null,
    },
  });
}

export async function listMemoryEvents(userId: string, memoryId?: string) {
  return prisma.memoryEvent.findMany({
    where: { userId, ...(memoryId ? { memoryId } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

// ---- 候选队列 ----

export interface CreateCandidateInput {
  userId: string;
  conversationId: string | null;
  messageId: string;
}

/**
 * 入队。messageId 唯一约束保证同一条助手消息只抽取一次。
 * 返回 created=false 表示已经存在（并发/重试），调用方应直接跳过。
 */
export async function createCandidate(
  input: CreateCandidateInput
): Promise<{ created: boolean; candidateId: string | null }> {
  try {
    const row = await prisma.memoryCandidate.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
      },
      select: { id: true },
    });
    return { created: true, candidateId: row.id };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return { created: false, candidateId: null };
    }
    throw error;
  }
}

export async function findCandidateById(id: string) {
  return prisma.memoryCandidate.findUnique({ where: { id } });
}

export async function findCandidateByMessageId(messageId: string) {
  return prisma.memoryCandidate.findUnique({ where: { messageId } });
}

export async function markCandidate(
  id: string,
  data: {
    status?: MemoryCandidateStatus;
    attempts?: number;
    model?: string | null;
    rawOutput?: unknown;
    operations?: unknown;
    error?: string | null;
    processedAt?: Date | null;
  },
  db: Db = prisma
): Promise<void> {
  await db.memoryCandidate.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.attempts !== undefined ? { attempts: data.attempts } : {}),
      ...(data.model !== undefined ? { model: data.model } : {}),
      ...(data.rawOutput !== undefined
        ? { rawOutput: data.rawOutput as Prisma.InputJsonValue }
        : {}),
      ...(data.operations !== undefined
        ? { operations: data.operations as Prisma.InputJsonValue }
        : {}),
      ...(data.error !== undefined ? { error: data.error } : {}),
      ...(data.processedAt !== undefined
        ? { processedAt: data.processedAt }
        : {}),
    },
  });
}

/**
 * 取出可继续处理的候选：待处理、失败可重试、以及已抽取待提交。
 *
 * 不按 userId 过滤时给每日全量任务用；传 userId 则只处理单个用户。
 */
export async function listResumableCandidates(options?: {
  userId?: string;
  limit?: number;
}) {
  const limit = options?.limit ?? 20;
  return prisma.memoryCandidate.findMany({
    where: {
      ...(options?.userId ? { userId: options.userId } : {}),
      OR: [
        { status: "pending" },
        { status: "running" },
        { status: "ready" },
        { status: "failed", attempts: { lt: 3 } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
