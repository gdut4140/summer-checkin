// ============================================================
// RAG 向量检索 — pgvector 版
//
// 检索完全在数据库内完成：ORDER BY embedding <=> $query LIMIT k
// 向量不再出库，只回传命中的行。
//
// 历史：embedding 列原为 jsonb（项目最初是 MySQL，无 vector 类型，
// 迁到 PostgreSQL 时列类型直接平移，未启用 pgvector）。检索曾靠
// 应用层全量拉回 + JS 余弦，且有 LIMIT 1000 静默截断——超出窗口的
// 文档永远搜不到且不报错。迁移脚本见 prisma/migrate-to-pgvector.sql
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
  /** 余弦相似度 = 1 - 余弦距离，越大越相似，取值 [-1, 1] */
  similarity: number;
}

interface PgRow {
  id: string;
  sourceName: string;
  sourceType: string;
  chunkIndex: number;
  content: string;
  createdAt: Date;
  distance: number;
}

// ---- 检索 ----

/**
 * 将 number[] 序列化为 pgvector 的输入格式。
 *
 * pgvector 的 vector 输入格式就是 JSON 数组字面量（"[0.1,0.2,...]"），
 * 与 JSON.stringify(number[]) 的输出一致，因此可以直接作为文本参数
 * 传给 `$n::vector` 由 pgvector 解析。
 *
 * 显式命名而非各处散落裸 JSON.stringify：这是一层跨语言的格式契约，
 * 一旦上游换了序列化方式（比如加了空格或换成 Float32Array），
 * 所有写入都会失败或写进错误的值，而这里是有测试兜住的地方。
 */
export function toPgVector(vec: number[]): string {
  return JSON.stringify(vec);
}

/**
 * 向量语义搜索（pgvector，库内排序）
 *
 * `<=>` 是余弦**距离**（= 1 - 余弦相似度），升序即最相似。
 *
 * @param queryEmbedding 查询向量
 * @param topK           返回条数
 * @param sourceFilter   可选：限定来源文档
 * @param userId         当前用户，用于数据隔离
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  topK = 5,
  sourceFilter?: string,
  userId?: string
): Promise<DocChunk[]> {
  const params: unknown[] = [toPgVector(queryEmbedding)];
  const conditions: string[] = ["embedding IS NOT NULL"];

  if (userId) {
    params.push(userId);
    conditions.push(`"userId" = $${params.length}`);
  }

  if (sourceFilter) {
    params.push(sourceFilter);
    conditions.push(`"sourceName" = $${params.length}`);
  }

  params.push(topK);
  const limitParam = `$${params.length}`;

  const rows = await prisma.$queryRawUnsafe<PgRow[]>(
    `SELECT id, "sourceName", "sourceType", "chunkIndex", content, "createdAt",
            (embedding <=> $1::vector) AS distance
     FROM documentchunk
     WHERE ${conditions.join(" AND ")}
     ORDER BY embedding <=> $1::vector
     LIMIT ${limitParam}`,
    ...params
  );

  console.log(
    `[Retriever] pgvector 检索 → ${rows.length} 条` +
      ` (top distance=${rows[0]?.distance?.toFixed(4) ?? "N/A"})`
  );

  return rows.map((r) => ({
    id: r.id,
    sourceName: r.sourceName,
    sourceType: r.sourceType,
    chunkIndex: r.chunkIndex,
    content: r.content,
    createdAt: r.createdAt,
    similarity: 1 - r.distance,
  }));
}
