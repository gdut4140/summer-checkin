// ============================================================
// RAG 向量检索 — JS 余弦相似度版
//
// 由于 DocumentChunk 的 embedding 列在 db 中是 jsonb 类型
// （pgvector 未安装或不兼容时 Prisma Unsupported 退回 jsonb），
// 改为全量加载后在 JS 中计算余弦相似度排序。
// 文档块数量通常不超过几百条，性能足够。
// ============================================================

import { prisma } from "@/lib/prisma";

// ---- 类型 ----

export interface DocChunk {
  id: string;
  sourceName: string;
  sourceType: string;
  chunkIndex: number;
  content: string;
  createdAt: Date;
}

// ---- 余弦相似度 ----

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

// ---- 检索 ----

interface PgRow {
  id: string;
  sourceName: string;
  sourceType: string;
  chunkIndex: number;
  content: string;
  createdAt: Date;
  embedding: unknown;
}

/**
 * 从 jsonb 值中提取 number[] 向量
 */
export function parseEmbedding(raw: unknown): number[] {
  if (raw == null) return [];
  // 数据库返回的 jsonb 可能是字符串（如 "[0.1, 0.2, ...]"）或已解析的数组
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  if (typeof raw === "object" && raw !== null) {
    // 某些驱动将向量返回为 { value: [...] } 或类数组对象
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.value)) return obj.value as number[];
    if (Array.isArray(obj.data)) return obj.data as number[];
    // 尝试直接取数字值
    const vals = Object.values(obj).filter(v => typeof v === "number");
    if (vals.length > 0) return vals as number[];
  }
  return [];
}

/**
 * 向量语义搜索（JS 内存计算）
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  topK = 5,
  sourceFilter?: string,
  userId?: string
): Promise<DocChunk[]> {
  let params: string[] = [];
  const conditions: string[] = [`"embedding" IS NOT NULL`];

  // userId 过滤
  if (userId) {
    params.push(userId);
    conditions.push(`"userId" = $${params.length}`);
  }

  if (sourceFilter) {
    params.push(sourceFilter);
    conditions.push(`"sourceName" = $${params.length}`);
  }

  // 1. 全量加载有 embedding 的文档块
  let sql = `
    SELECT id, "userId", "sourceName", "sourceType", "chunkIndex", content, "createdAt", "embedding"
    FROM documentchunk
    WHERE ${conditions.join(" AND ")}
    ORDER BY "createdAt" DESC LIMIT 1000
  `;

  const rows = await prisma.$queryRawUnsafe<PgRow[]>(sql, ...params);
  return rankAndReturn(rows, queryEmbedding, topK);
}

function rankAndReturn(
  rows: PgRow[],
  queryEmbedding: number[],
  topK: number
): DocChunk[] {
  if (rows.length === 0) {
    console.log("[Retriever] 无文档块数据");
    return [];
  }

  // 2. 计算相似度并排序
  const scored = rows.map((r) => {
    const vec = parseEmbedding(r.embedding);
    const similarity = vec.length > 0 ? cosineSimilarity(queryEmbedding, vec) : 0;
    return { row: r, similarity };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  const top = scored.slice(0, topK);

  console.log(
    `[Retriever] JS 余弦相似度搜索 → ${top.length}/${rows.length} 条 (top=${top[0]?.similarity?.toFixed(4) ?? "N/A"})`
  );

  return top.map(({ row: r }) => ({
    id: r.id,
    sourceName: r.sourceName,
    sourceType: r.sourceType,
    chunkIndex: r.chunkIndex,
    content: r.content,
    createdAt: r.createdAt,
  }));
}
