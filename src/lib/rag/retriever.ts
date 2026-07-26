// ============================================================
// Day 16 RAG: 向量检索 + 余弦相似度
//
// ① cosineSimilarity  — 余弦相似度计算
// ② searchSimilarChunks — 从 DB 加载所有 chunks，计算相似度排序
//
// 设计决策：数据量 < 1000 chunks 时，全部加载+内存计算
// 远快于 MySQL 中逐条 JSON 比对（MySQL 不支持向量索引）
// 未来数据量增长后可迁移到 Chroma / pgvector
// ============================================================

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

// ---- 类型 ----

/** DocumentChunk 的 TypeScript 类型 */
export interface DocChunk {
  id: string;
  sourceName: string;
  sourceType: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  createdAt: Date;
}

// ---- 相似度计算 ----

/**
 * 余弦相似度
 *
 * cos(θ) = A·B / (|A| × |B|)
 * 返回 [-1, 1]，1 表示完全相同方向（最相似）
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`向量维度不一致: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

// ---- 检索 ----

/**
 * 在用户可访问的 chunks 中检索与 query 最相似的 topK 条
 *
 * @param userId         当前用户 ID
 * @param queryEmbedding 查询文本的向量
 * @param topK           返回数量
 * @param sourceFilter   可选：按来源过滤（如 "Agent 开发学习路线.pdf"）
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  topK = 5,
  sourceFilter?: string
): Promise<DocChunk[]> {
  // 加载所有 chunks（当前阶段数据量小，全量加载）
  const where: Record<string, unknown> = {};
  if (sourceFilter) where.sourceName = sourceFilter;

  const chunks = await prisma.documentChunk.findMany({ where });

  console.log(`[Retriever] 从 ${chunks.length} 个 chunks 中检索...`);

  if (chunks.length === 0) return [];

  // 计算余弦相似度
  const scored = chunks.map((chunk) => {
    const embedding = chunk.embedding as unknown as number[];
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    return { chunk, similarity };
  });

  // 按相似度降序排序
  scored.sort((a, b) => b.similarity - a.similarity);

  // 取 topK
  const top = scored.slice(0, topK);

  console.log(
    `[Retriever] Top-${topK} 相似度: ${top.map((s) => s.similarity.toFixed(4)).join(", ")}`
  );

  return top.map((s) => ({
    id: s.chunk.id,
    sourceName: s.chunk.sourceName,
    sourceType: s.chunk.sourceType,
    chunkIndex: s.chunk.chunkIndex,
    content: s.chunk.content,
    embedding: s.chunk.embedding as unknown as number[],
    createdAt: s.chunk.createdAt,
  }));
}
