// ============================================================
// Memory v2 读工具实现
//
// 工具本身（schema / 描述）在 study-tools.ts；
// 这里只负责查询与访问信号，方便单测与复用。
//
// 工具是只读的：不提供 ADD/UPDATE/DELETE。
// 记忆写入只能走抽取 → Manager，避免模型无约束改库。
// ============================================================

import { embedText } from "@/lib/rag/client";
import {
  findMemoriesByIds,
  listActiveMemories,
  searchActiveMemoryIdsByVector,
} from "@/lib/memory/store";
import { touchToolRead } from "@/lib/memory/access";
import { isQueryWorthEmbedding } from "@/lib/memory/retrieval";
import type { MemoryKind, MemoryRecord } from "@/lib/memory/types";

export interface RecallMemoriesInput {
  query?: string;
  kinds?: MemoryKind[];
  limit?: number;
}

export interface RecallMemoriesResult {
  success: true;
  count: number;
  query: string;
  kinds: MemoryKind[] | null;
  limit: number;
  hasMore: boolean;
  /** 给模型的停止提示：信息够用就不要再换关键词重复查 */
  guidance: string;
  memories: Array<{
    id: string;
    kind: MemoryKind;
    content: string;
    importance: number;
    confidence: number;
    updatedAt: string;
    sourceType: string;
    sourceMessageId: string | null;
    similarity?: number;
  }>;
  message?: string;
}

function toView(memory: MemoryRecord, similarity?: number) {
  return {
    id: memory.id,
    kind: memory.kind,
    content: memory.content,
    importance: memory.importance,
    confidence: memory.confidence,
    updatedAt: memory.updatedAt.toISOString(),
    sourceType: memory.sourceType,
    sourceMessageId: memory.sourceMessageId,
    ...(similarity !== undefined ? { similarity } : {}),
  };
}

export async function recallMemories(
  userId: string,
  input: RecallMemoriesInput = {}
): Promise<RecallMemoriesResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 8, 20));
  const kinds = input.kinds?.length ? new Set(input.kinds) : null;
  const query = input.query?.trim() ?? "";

  let memories: MemoryRecord[] = [];
  let similarityById: Map<string, number> | undefined;

  if (isQueryWorthEmbedding(query)) {
    const embedding = await embedText(query);
    const hits = await searchActiveMemoryIdsByVector(userId, embedding, 30);
    if (hits.length > 0) {
      memories = await findMemoriesByIds(
        hits.map((hit) => hit.id),
        userId
      );
      similarityById = new Map(hits.map((hit) => [hit.id, hit.similarity]));
    }
  } else {
    // 无 query / 短 query：返回按重要度排序的 active 记忆
    const all = await listActiveMemories(userId);
    memories = all.sort(
      (a, b) =>
        b.importance - a.importance || b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  if (kinds) {
    memories = memories.filter((m) => kinds.has(m.kind));
  }
  const matched = memories.length;
  const hasMore = matched > limit;
  memories = memories.slice(0, limit);

  const ids = memories.map((m) => m.id);
  void touchToolRead(ids);

  const guidance =
    memories.length === 0
      ? "没有匹配的长期记忆。不要重复换关键词查询；直接根据当前对话回答，或说明你没有这条记录。"
      : hasMore
        ? `已返回最相关的 ${memories.length} 条；如果信息足够请直接回答，不要为同一问题连续换词重复查询。`
        : "已返回全部匹配的记忆；如果信息足够请直接回答，不要重复查询。";

  return {
    success: true,
    count: memories.length,
    query,
    kinds: input.kinds ?? null,
    limit,
    hasMore,
    guidance,
    memories: memories.map((m) => toView(m, similarityById?.get(m.id))),
    ...(memories.length === 0
      ? { message: "我目前还没有关于你的长期记忆。多和我聊聊吧！" }
      : {}),
  };
}
