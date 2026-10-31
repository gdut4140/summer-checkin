// ============================================================
// Memory v2 检索
//
// 两路召回 + 结构化配额：
//   1. 稳定画像：goal / preference，按 importance + lastConfirmedAt
//   2. 查询相关：query embedding → pgvector（SQL 内过滤相似度阈值）
//
// 刻意不做：
//   · 关键词/BM25 分支（评估证明需要再加，见方案文档）
//   · cross-encoder rerank（短句 + 小候选池，收益不抵延迟）
//   · 单一固定权重公式
// ============================================================

import { embedText } from "@/lib/rag/client";
import {
  findMemoriesByIds,
  listStableMemories,
  searchActiveMemoryIdsByVector,
  type Db,
} from "./store";
import { touchRetrieved } from "./access";
import { selectByQuotas } from "./selection";
import type {
  MemoryKind,
  MemoryRecord,
  MemorySurface,
  MemoryTask,
} from "./types";

export interface RetrievalInput {
  userId: string;
  surface: MemorySurface;
  task: MemoryTask;
  query: string | null;
  /** 最终返回上限；不传则用 task 配置 */
  limit?: number;
  db?: Db;
}

export interface RetrievalResult {
  memories: MemoryRecord[];
  candidateIds: string[];
  queryUsed: boolean;
  embeddingFailed: boolean;
}

interface TaskConfig {
  stableKinds: MemoryKind[];
  stableLimit: number;
  quotas: Record<MemoryKind, number>;
  total: number;
}

const DEFAULT_QUOTAS: Record<MemoryKind, number> = {
  goal: 3,
  skill: 2,
  weakness: 2,
  preference: 3,
  habit: 1,
  fact: 1,
};

/**
 * 按任务给类型先验。
 *
 * 这些是**配额**，不是加权总分：先过滤，再按 kind 封顶，
 * 避免某一类（例如大量 fact）挤掉目标与偏好。
 */
export const TASK_CONFIG: Record<MemoryTask, TaskConfig> = {
  chat: {
    stableKinds: ["goal", "preference"],
    stableLimit: 14,
    quotas: { ...DEFAULT_QUOTAS, preference: 7 },
    total: 14,
  },
  planning: {
    stableKinds: ["goal", "preference"],
    stableLimit: 14,
    quotas: { ...DEFAULT_QUOTAS, goal: 3, skill: 3, weakness: 2, preference: 6 },
    total: 14,
  },
  analysis: {
    stableKinds: ["goal", "preference"],
    stableLimit: 12,
    quotas: { ...DEFAULT_QUOTAS, goal: 2, habit: 2, weakness: 3, preference: 5 },
    total: 12,
  },
  doc_edit: {
    stableKinds: ["preference", "fact"],
    stableLimit: 10,
    quotas: { ...DEFAULT_QUOTAS, preference: 5, fact: 4, goal: 1 },
    total: 10,
  },
};

/** 这些消息不值得为查询相关召回付一次 embedding。 */
const TRIVIAL_QUERY =
  /^(你好|您好|hi|hello|hey|谢谢|谢了|好的|好|嗯|嗯嗯|在吗|继续|ok|okay|收到|明白了)[\s!！。.~～]*$/i;

export function isQueryWorthEmbedding(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length < 6) return false;
  return !TRIVIAL_QUERY.test(trimmed);
}

export async function retrieveMemories(
  input: RetrievalInput
): Promise<RetrievalResult> {
  const config = TASK_CONFIG[input.task];
  const db = input.db;

  // ---- 路 1：稳定画像 ----
  // 按 kind 分别取，避免目标多的时候把偏好挤出稳定区。
  const perKindLimit = Math.max(
    3,
    Math.ceil(config.stableLimit / config.stableKinds.length)
  );
  const stableGroups = await Promise.all(
    config.stableKinds.map((kind) =>
      listStableMemories(input.userId, [kind], perKindLimit, db)
    )
  );
  const stable = stableGroups.flat();

  // ---- 路 2：查询相关 ----
  const relevant: MemoryRecord[] = [];
  let queryUsed = false;
  let embeddingFailed = false;

  const query = input.query?.trim() ?? "";
  if (isQueryWorthEmbedding(query)) {
    try {
      const embedding = await embedText(query);
      queryUsed = true;
      const hits = await searchActiveMemoryIdsByVector(
        input.userId,
        embedding,
        30
      );
      if (hits.length > 0) {
        const records = await findMemoriesByIds(
          hits.map((hit) => hit.id),
          input.userId,
          db
        );
        // findMemoriesByIds 已按 hits 顺序返回，这里再按相似度显式排序
        const similarity = new Map(hits.map((hit) => [hit.id, hit.similarity]));
        records.sort(
          (a, b) =>
            (similarity.get(b.id) ?? 0) - (similarity.get(a.id) ?? 0)
        );
        relevant.push(...records);
      }
    } catch (error) {
      embeddingFailed = true;
      console.warn("[Memory] 查询向量生成/检索失败:", error);
    }
  }

  const candidates = [...stable, ...relevant];
  const candidateIds = [...new Set(candidates.map((m) => m.id))];
  const total = input.limit ?? config.total;
  const selected = selectByQuotas(candidates, config.quotas, total);

  // “进入候选池”是独立信号，不阻塞主流程
  void touchRetrieved(candidateIds);

  return { memories: selected, candidateIds, queryUsed, embeddingFailed };
}
