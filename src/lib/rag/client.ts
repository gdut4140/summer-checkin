// ============================================================
// Day 16 RAG: Embedding 服务 HTTP 客户端
//
// 调用 Python 微服务:
//   POST /embed  — 文本 → 向量 (bge-m3)
//   POST /rerank — 查询+候选文档 → 余弦相似度重排 (bge-small-zh-v1.5)
//
// 服务地址通过环境变量配置，默认 localhost:8765
// ============================================================

const EMBEDDING_SERVICE_URL =
  process.env.EMBEDDING_SERVICE_URL ?? "http://localhost:8765";

interface EmbedResponse {
  embeddings: number[][];
  dimensions: number;
  model: string;
}

interface RerankResponse {
  scores: number[];
  indices: number[];
  model: string;
}

/**
 * 批量文本 → 向量
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const res = await fetch(`${EMBEDDING_SERVICE_URL}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding service error: ${res.status} ${err}`);
  }

  const data: EmbedResponse = await res.json();
  return data.embeddings;
}

/**
 * 单条文本 → 向量
 */
export async function embedText(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  return results[0];
}

/**
 * Rerank: 对召回的候选文档重新打分排序
 *
 * @param query - 用户查询
 * @param documents - 候选文档文本列表
 * @returns 按相关性降序排列的结果
 */
export async function rerank(
  query: string,
  documents: string[]
): Promise<{ scores: number[]; indices: number[] }> {
  if (documents.length === 0) {
    return { scores: [], indices: [] };
  }

  const res = await fetch(`${EMBEDDING_SERVICE_URL}/rerank`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, documents }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Rerank service error: ${res.status} ${err}`);
  }

  const data: RerankResponse = await res.json();
  return { scores: data.scores, indices: data.indices };
}
