// ============================================================
// Day 16 RAG: 高级搜索（召回 + 重排）
//
// searchKnowledge(userId, query)
//   1. query → Embedding
//   2. 召回: 向量相似度 Top-K (默认 20)
//   3. 重排: bge-reranker-v2-m3 精排 → Top-N (默认 5)
//   4. 返回格式化结果
// ============================================================

import { embedText } from "./client";
import { rerank } from "./client";
import { searchSimilarChunks, type DocChunk } from "./retriever";

// ---- 结果类型 ----

export interface KnowledgeResult {
  content: string;
  sourceName: string;
  score: number;      // 重排后的分数
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
 * @param userId       当前用户 ID
 * @param query        用户查询文本
 * @param recallTopK   召回阶段取多少条（默认 20）
 * @param finalTopN    最终返回多少条（默认 5）
 * @param sourceFilter 可选：限定来源
 */
export async function searchKnowledge(
  query: string,
  recallTopK = 20,
  finalTopN = 5,
  sourceFilter?: string
): Promise<SearchResult> {
  console.log(`[Search] 查询: "${query.slice(0, 80)}"`);

  // 1. Query → Embedding
  const queryEmbedding = await embedText(query);

  // 2. 召回：向量相似度 Top-K
  const recalled = await searchSimilarChunks(queryEmbedding, recallTopK, sourceFilter);

  if (recalled.length === 0) {
    console.log("[Search] 未找到相关结果");
    return { query, results: [], searchedChunks: 0 };
  }

  // 3. 重排：bge-reranker-v2-m3
  // 先查有多少 chunks
  const { prisma } = await import("@/lib/prisma");
  const totalChunks = await prisma.documentChunk.count();

  const documents = recalled.map((c) => c.content);

  let reranked: DocChunk[];
  try {
    const rerankResult = await rerank(query, documents);

    // 按重排分数重新排序
    reranked = rerankResult.indices.slice(0, finalTopN).map((idx) => ({
      ...recalled[idx],
    }));

    // 附加重排分数
    const rerankScores = rerankResult.scores;

    console.log(
      `[Search] 召回 ${recalled.length}/${totalChunks} → 重排 → Top-${finalTopN}`
    );

    return {
      query,
      results: reranked.map((c, i) => ({
        content: c.content,
        sourceName: c.sourceName,
        score: rerankScores[rerankResult.indices[i]] ?? 0,
        chunkIndex: c.chunkIndex,
      })),
      searchedChunks: totalChunks,
    };
  } catch (err) {
    // 重排失败时回退到只用相似度排序
    console.warn("[Search] Rerank 失败，回退到纯向量排序:", err);

    return {
      query,
      results: recalled.slice(0, finalTopN).map((c, i) => ({
        content: c.content,
        sourceName: c.sourceName,
        score: 0, // 无重排分数
        chunkIndex: c.chunkIndex,
      })),
      searchedChunks: totalChunks,
    };
  }
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
