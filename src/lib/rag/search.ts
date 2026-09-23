// ============================================================
// RAG 知识库搜索
//
// searchKnowledge(userId, query)
//   1. query → Embedding
//   2. pgvector 库内相似度检索 Top-K
//   3. 返回格式化结果
//
// 历史：这里曾有过"召回 Top-20 → 重排 Top-5"的两级检索，但重排用的是
// 召回阶段同一套余弦（同模型、同公式、同候选集），确定性函数不可能改变
// 排序，属于数学空转；且回传的 score 取值下标错位，喂给 AI 的相关性分数
// 是错的。重排与错位下标已一并移除，现在的 score 直接来自 pgvector 的
// 余弦距离（1 - distance），是真实值。
// ============================================================

import { prisma } from "@/lib/prisma";
import { embedText } from "./client";
import { searchSimilarChunks } from "./retriever";

// ---- 结果类型 ----

export interface KnowledgeResult {
  content: string;
  sourceName: string;
  /** 余弦相似度 = 1 - 余弦距离，越大越相关，取值 [-1, 1] */
  score: number;
  chunkIndex: number;
}

export interface SearchResult {
  query: string;
  results: KnowledgeResult[];
  searchedChunks: number;
}

// ---- 搜索 ----

/**
 * 搜索知识库
 *
 * @param query        用户查询文本
 * @param userId       当前用户 ID（数据隔离）
 * @param topK         返回条数（默认 5）
 * @param sourceFilter 可选：限定来源文档
 */
export async function searchKnowledge(
  query: string,
  userId?: string,
  topK = 5,
  sourceFilter?: string
): Promise<SearchResult> {
  console.log(`[Search] 查询: "${query.slice(0, 80)}"${userId ? ` (user: ${userId})` : ""}`);

  // 1. Query → Embedding
  const queryEmbedding = await embedText(query);

  // 2. pgvector 库内检索
  const recalled = await searchSimilarChunks(queryEmbedding, topK, sourceFilter, userId);

  const totalChunks = userId
    ? await prisma.documentChunk.count({ where: { userId } })
    : await prisma.documentChunk.count();

  if (recalled.length === 0) {
    console.log("[Search] 未找到相关结果");
    return { query, results: [], searchedChunks: totalChunks };
  }

  console.log(
    `[Search] pgvector 检索 ${recalled.length} 条 (知识库共 ${totalChunks} 块)`
  );

  return {
    query,
    results: recalled.map((c) => ({
      content: c.content,
      sourceName: c.sourceName,
      score: c.similarity,
      chunkIndex: c.chunkIndex,
    })),
    searchedChunks: totalChunks,
  };
}

/**
 * 将搜索结果格式化为 system prompt 片段
 */
export function formatKnowledgeForPrompt(result: SearchResult): string {
  if (result.results.length === 0) return "";

  const lines = result.results.map(
    (r, i) => `[参考${i + 1}] （来源: ${r.sourceName}）\n${r.content}`
  );

  return `[知识库检索结果 — 请优先基于以下参考资料回答]
${lines.join("\n\n")}
`;
}
