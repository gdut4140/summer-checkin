// ============================================================
// Memory v2 生命周期与每日维护
//
// 每日任务按顺序执行：
//   1. 继续处理抽取候选（重试 failed / 提交 ready / 遗留 running）
//   2. 给 embedding 缺失的 active 记忆补向量
//   3. 过期目标 → expired
//   4. 长期未确认的 habit / weakness / fact → archived
//   5. 软删超过 30 天 → 物理删除
//
// 原则：不静默硬删 active 记忆；每个状态变化都写 MemoryEvent。
// ============================================================

import { prisma } from "@/lib/prisma";
import { embeddingWithFallback } from "@/lib/model-pool";
import { toPgVector } from "@/lib/rag/retriever";
import {
  insertMemoryEvent,
  listMemoriesMissingEmbedding,
} from "./store";
import { runCandidateQueue } from "./extraction";
import type { MemoryKind } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 各类记忆的归档阈值（天）。goal 走有效期，skill/preference 不自动归档。 */
const ARCHIVE_RULES: Array<{ kinds: MemoryKind[]; days: number }> = [
  { kinds: ["habit", "weakness"], days: 180 },
  { kinds: ["fact"], days: 365 },
];

/** 软删后的保留期：这段时间内仍可通过未来 UI 恢复。 */
const PURGE_GRACE_DAYS = 30;

export interface MemoryMaintenanceResult {
  candidates: { examined: number; processed: number; failed: number };
  reembedded: number;
  expired: number;
  archived: number;
  purged: number;
}

/** 给缺失向量的 active 记忆补 vector（每批最多 10 条）。 */
export async function reembedMissingMemories(
  userId: string,
  limit = 10
): Promise<number> {
  const memories = await listMemoriesMissingEmbedding(userId, limit);
  if (memories.length === 0) return 0;

  try {
    const { data, model } = await embeddingWithFallback(
      memories.map((m) => m.content)
    );

    let updated = 0;
    for (const [index, memory] of memories.entries()) {
      const vector = data[index];
      if (!vector) continue;
      const count = await prisma.$executeRawUnsafe(
        `UPDATE memory
         SET embedding = $1::vector, "embeddingModel" = $2, "updatedAt" = now()
         WHERE id = $3 AND "userId" = $4`,
        toPgVector(vector),
        model,
        memory.id,
        userId
      );
      updated += count;
    }
    return updated;
  } catch (error) {
    console.warn("[Memory] 补向量失败:", error);
    return 0;
  }
}

/** validTo 已过的 active 记忆 → expired。 */
export async function expireMemories(userId: string): Promise<number> {
  const now = new Date();
  const rows = await prisma.memory.findMany({
    where: {
      userId,
      status: "active",
      validTo: { not: null, lte: now },
    },
    select: { id: true, kind: true, content: true, validTo: true },
  });

  let expired = 0;
  for (const row of rows) {
    const result = await prisma.memory.updateMany({
      where: { id: row.id, userId, status: "active" },
      data: { status: "expired" },
    });
    if (result.count === 0) continue;
    expired += result.count;
    await insertMemoryEvent(prisma, {
      userId,
      memoryId: row.id,
      action: "expire",
      actor: "system",
      before: {
        ...row,
        validTo: row.validTo?.toISOString() ?? null,
      },
      after: { status: "expired" },
    });
  }
  return expired;
}

/** 长期未确认的中低价值记忆 → archived（只归档，不删除）。 */
export async function archiveStaleMemories(userId: string): Promise<number> {
  let archived = 0;
  const now = Date.now();

  for (const rule of ARCHIVE_RULES) {
    const cutoff = new Date(now - rule.days * DAY_MS);
    const rows = await prisma.memory.findMany({
      where: {
        userId,
        status: "active",
        kind: { in: rule.kinds },
        lastConfirmedAt: { lt: cutoff },
      },
      select: { id: true, kind: true, content: true, lastConfirmedAt: true },
    });

    for (const row of rows) {
      const result = await prisma.memory.updateMany({
        where: { id: row.id, userId, status: "active" },
        data: { status: "archived" },
      });
      if (result.count === 0) continue;
      archived += result.count;
      await insertMemoryEvent(prisma, {
        userId,
        memoryId: row.id,
        action: "archive",
        actor: "system",
        before: {
          ...row,
          lastConfirmedAt: row.lastConfirmedAt?.toISOString() ?? null,
        },
        after: { status: "archived", reason: `${rule.days}d_unconfirmed` },
      });
    }
  }

  return archived;
}

/** 软删超过保留期的记忆 → 物理删除。事件保留（memoryId 无外键）。 */
export async function purgeDeletedMemories(
  userId: string,
  graceDays = PURGE_GRACE_DAYS
): Promise<number> {
  const cutoff = new Date(Date.now() - graceDays * DAY_MS);
  const rows = await prisma.memory.findMany({
    where: {
      userId,
      status: "deleted",
      deletedAt: { not: null, lte: cutoff },
    },
    select: { id: true, kind: true, content: true, deletedAt: true },
  });
  if (rows.length === 0) return 0;

  await insertMemoryEvent(prisma, {
    userId,
    action: "purge",
    actor: "system",
    before: {
      memories: rows.map((row) => ({
        ...row,
        deletedAt: row.deletedAt?.toISOString() ?? null,
      })),
    },
    after: { purged: rows.length },
  });

  const result = await prisma.memory.deleteMany({
    where: { id: { in: rows.map((row) => row.id) }, userId },
  });
  return result.count;
}

/** 每日维护入口。任何一步失败都不阻断后续步骤。 */
export async function runMemoryMaintenance(
  userId: string
): Promise<MemoryMaintenanceResult> {
  let candidates: MemoryMaintenanceResult["candidates"] = {
    examined: 0,
    processed: 0,
    failed: 0,
  };
  try {
    candidates = await runCandidateQueue({ userId, limit: 20 });
  } catch (error) {
    console.error("[Memory] 候选队列处理失败:", error);
  }

  const reembedded = await reembedMissingMemories(userId).catch((error) => {
    console.error("[Memory] 补向量失败:", error);
    return 0;
  });

  const expired = await expireMemories(userId).catch((error) => {
    console.error("[Memory] 过期处理失败:", error);
    return 0;
  });

  const archived = await archiveStaleMemories(userId).catch((error) => {
    console.error("[Memory] 归档失败:", error);
    return 0;
  });

  const purged = await purgeDeletedMemories(userId).catch((error) => {
    console.error("[Memory] 清理软删失败:", error);
    return 0;
  });

  return { candidates, reembedded, expired, archived, purged };
}
