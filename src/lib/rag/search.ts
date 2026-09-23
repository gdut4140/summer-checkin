// ============================================================
// RAG 知识库搜索
//
// searchKnowledge(query, userId)
//   1. query → Embedding
//   2. pgvector 库内相似度召回 Top-K（K 大于最终返回数，给重排留余地）
//   3. cross-encoder 重排，取 Top-N
//   4. 返回格式化结果
//
// 第 3 步这里曾经有过一个"重排"、被删过一次，别把两者搞混：
//   · 被删的那个：把召回结果重新 embedding 一遍、再算一遍**同样的余弦**。同模型、
//     同公式、同候选集，确定性函数不可能改变排序——纯数学空转，每次搜索还白烧
//     一批 embedding 调用；而且回传的 score 取值下标错位（scores[indices[i]]），
//     喂给 AI 的相关性分数是错的。
//   · 现在的这个：真 cross-encoder（qwen3-rerank）。query 与 document **联合编码**，
//     打分不是两个 embedding 的函数，无法由余弦序推导出来。见 rag/rerank.ts。
//
// 重排失败会自动降级回向量序（scoreSource 会如实标成 "vector"），不影响搜索可用性。
// ============================================================

import { prisma } from "@/lib/prisma";
import { embedText } from "./client";
import { searchSimilarChunks } from "./retriever";
import { rerankChunks } from "./rerank";

// ---- 结果类型 ----

export interface KnowledgeResult {
  content: string;
  sourceName: string;
  /**
   * 相关性评分。取值取决于 scoreSource：
   *   "rerank" —— cross-encoder 的 relevance_score，0–1，越高越相关
   *   "vector" —— pgvector 余弦相似度，-1–1（重排被跳过或降级时的值）
   * 两者不同量纲，不要跨来源比较大小。
   */
  score: number;
  /** score 的来源。没有它就无法区分"重排跑了但给了低分"和"重排降级了、这其实是余弦" */
  scoreSource: "rerank" | "vector";
  /** 召回阶段的余弦相似度。重排会改写 score，但向量阶段的原始分始终留在这里 */
  recallScore: number;
  chunkIndex: number;
}

export interface SearchResult {
  query: string;
  results: KnowledgeResult[];
  /** 该用户文档块总数。注意它是全量计数，不代表本次检索了多少 */
  searchedChunks: number;
  /** 本次实际送入重排的候选数 */
  recalledChunks: number;
  /** 实际生效的重排模型；被跳过或降级为向量序时为 undefined */
  rerankModel?: string;
}

// ---- 搜索 ----

/**
 * 召回池大小。官方建议初次检索 50-100 条再精排 Top 5-10；
 * 本项目单用户语料通常只有几百个 chunk，20 条候选足以让重排发挥作用，
 * token 消耗与延迟都低。要调大先测延迟。
 */
const RERANK_RECALL_POOL = 20;

/**
 * 搜索知识库
 *
 * @param query        用户查询文本
 * @param userId       当前用户 ID（数据隔离）
 * @param topK         最终返回条数（默认 5）
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

  // 2. 召回。池子要比重排后想要的多，否则重排没有发挥空间；
  //    调用方传了更大的 topK 时不缩水。
  const recallSize = Math.max(topK, RERANK_RECALL_POOL);
  const recalled = await searchSimilarChunks(queryEmbedding, recallSize, sourceFilter, userId);

  const totalChunks = userId
    ? await prisma.documentChunk.count({ where: { userId } })
    : await prisma.documentChunk.count();

  if (recalled.length === 0) {
    console.log("[Search] 未找到相关结果");
    return { query, results: [], searchedChunks: totalChunks, recalledChunks: 0 };
  }

  // 3. 重排。候选不比 topK 多就无事可做（重排也变不出新候选），
  //    直接跳过，省一次网络往返。
  let ordered = recalled;
  let rerankModel: string | undefined;
  let rerankScoreById: Map<string, number> | undefined;
  if (recalled.length > topK) {
    const outcome = await rerankChunks(query, recalled);
    if (outcome) {
      ordered = outcome.ordered;
      rerankModel = outcome.model;
      rerankScoreById = outcome.scoreById;
    }
  }

  const returned = ordered.slice(0, topK);
  console.log(
    `[Search] 召回 ${recalled.length} 条 → ${rerankModel ? `重排(${rerankModel})` : "未重排"} → 返回 ${returned.length} 条` +
      `（知识库共 ${totalChunks} 块）`
  );

  return {
    query,
    results: returned.map((c) => {
      const rerankScore = rerankScoreById?.get(c.id);
      return {
        content: c.content,
        sourceName: c.sourceName,
        score: rerankScore ?? c.similarity,
        scoreSource: rerankScore === undefined ? ("vector" as const) : ("rerank" as const),
        recallScore: c.similarity,
        chunkIndex: c.chunkIndex,
      };
    }),
    searchedChunks: totalChunks,
    recalledChunks: recalled.length,
    rerankModel,
  };
}

/**
 * 将搜索结果格式化为 system prompt 片段
 *
 * 注意：当前**无调用方**。检索已改为纯工具驱动（见 api/ai/route.ts 的说明），
 * 知识内容由 searchKnowledgeBase 工具结果直接喂给模型，不再走 system prompt 注入。
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
