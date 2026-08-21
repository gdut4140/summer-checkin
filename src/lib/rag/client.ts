// ============================================================
// Embedding 服务客户端 — 对接 OpenAI 兼容 Embedding API
//
// 默认使用 DeepSeek deepseek-embed（2048 维），
// 也可切换为 OpenAI text-embedding-3-small 等任意兼容模型。
//
// 之前依赖本地 Python 微服务（bge-m3），现已替换为线上 API。
// ============================================================

import { cosineSimilarity } from "./retriever";
import { embeddingWithFallback } from "@/lib/model-pool";

/**
 * 批量文本 → 向量
 * 走模型池 embedding 档（text-embedding-v4 优先，v2 兜底），不计入用户 token 精力条。
 * 自动分批，每批最多 25 条（DashScope 限制）。
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH_SIZE = 25;

  // 小批量直接请求
  if (texts.length <= BATCH_SIZE) {
    const { data } = await embeddingWithFallback(texts);
    return data;
  }

  // 大批量分批请求
  console.log(`[Embed] 分批: ${texts.length} 条 → ${Math.ceil(texts.length / BATCH_SIZE)} 批`);
  const allResults: { index: number; embedding: number[] }[] = [];
  let offset = 0;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { data } = await embeddingWithFallback(batch);
    // 恢复全局 index
    data.forEach((emb, j) => {
      allResults.push({ index: offset + j, embedding: emb });
    });
    offset += batch.length;
  }

  allResults.sort((a, b) => a.index - b.index);
  return allResults.map((item) => item.embedding);
}

/**
 * 单条文本 → 向量
 */
export async function embedText(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  return results[0];
}

// ---- Rerank（本地余弦相似度，无需远程服务）----

/**
 * Rerank：对候选文档按与 query 的余弦相似度重新排序
 *
 * 之前依赖 Python 微服务的 bge-reranker，现在改为：
 * ① query → embedding
 * ② 每个文档 → embedding
 * ③ 计算 cosineSimilarity → 排序
 *
 * 对于个人知识库（几百条 chunk），这个性能完全够用。
 *
 * @param query     用户查询文本
 * @param documents 候选文档文本列表
 * @returns 按相似度降序排列的结果
 */
export async function rerank(
  query: string,
  documents: string[]
): Promise<{ scores: number[]; indices: number[] }> {
  if (documents.length === 0) {
    return { scores: [], indices: [] };
  }

  // query + documents 一起 embedding（一次 API 调用）
  const allTexts = [query, ...documents];
  const allVectors = await embedTexts(allTexts);
  const queryVec = allVectors[0];
  const docVecs = allVectors.slice(1);

  // 计算余弦相似度
  const scored = docVecs.map((vec, i) => ({
    index: i,
    score: cosineSimilarity(queryVec, vec),
  }));

  // 按分数降序
  scored.sort((a, b) => b.score - a.score);

  return {
    scores: scored.map((s) => s.score),
    indices: scored.map((s) => s.index),
  };
}
