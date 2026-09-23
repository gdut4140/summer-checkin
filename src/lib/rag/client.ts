// ============================================================
// Embedding 服务客户端 — 对接 OpenAI 兼容 Embedding API
//
// 走模型池 embedding 档（text-embedding-v4 优先，v2 兜底），
// 维度 1024，与 documentchunk.embedding / usermemory.embedding
// 的 vector(1024) 列对齐。
//
// 历史：曾依赖本地 Python 微服务（bge-m3 向量 + bge-reranker 重排），
// 后替换为线上 API。原先还有一个 rerank()，但它是"召回阶段用过的那套
// 余弦再算一遍"——同一模型、同一公式、同一候选集，确定性函数重复应用
// 不可能改变排序，属于纯粹的数学空转，每次搜索白烧 3 批 embedding
// 调用。已移除。真正的重排已于 2026-09-23 接入，见 rag/rerank.ts 与
// model-pool 的 rerankWithFallback——用的是 cross-encoder（qwen3-rerank），
// query 与 document 联合编码，而不是各自 embedding 后算余弦。
// （注意别写成 gte-rerank：官方公告它 2026-05-30 已停服。）
// ============================================================

import { embeddingWithFallback } from "@/lib/model-pool";

/**
 * 批量文本 → 向量
 * 走模型池 embedding 档（text-embedding-v4 优先，v3 兜底，均为 1024 维），不计入用户 token 精力条。
 * 自动分批，每批最多 10 条（DashScope text-embedding-v4 单次 batch 上限为 10）。
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH_SIZE = 10;

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
