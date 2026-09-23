// ============================================================
// 知识库「文档清单」
//
// 与「语义检索」是两件事，别混：
//   · 语义检索（rag/search.ts）：回答"某段内容在哪"，按相似度取 Top-N 个 chunk
//   · 本文档清单：回答"我上传了哪些文档"，是**列举**，不是相似度问题
//
// 为什么单独成模块：这个清单有两个消费方——知识库管理页的 API
// （app/api/knowledge/documents）和智能体的 listKnowledgeDocs 工具。
// 两边各写一份 GROUP BY 迟早会漂移，所以只留一份。
// ============================================================

import { prisma } from "@/lib/prisma";

export interface KnowledgeDocSummary {
  sourceName: string;
  sourceType: string;
  /** 该文档切出的 chunk 数 */
  chunkCount: number;
  totalChars: number;
  createdAt: Date;
}

/**
 * 列出某用户知识库里的全部文档
 *
 * **以 documentchunk 为准，而不是 knowledgedoc**。理由：
 *   1. 能被检索到的才是"知识库里真的有的"——chunk 是检索的实际单位；
 *   2. knowledgedoc 可能缺行。实测本地就有一个文档
 *      （「基于 IM 的办公协同智能助手（公开版）(2)(2).docx」）有 chunk 但无
 *      knowledgedoc 记录，只用后者会把它漏掉——而它明明能被搜到。
 *   管理页接口本来就是这个口径（含"旧数据无此行则回退切片拼接"的处理），此处保持一致。
 */
export async function listKnowledgeDocs(userId: string): Promise<KnowledgeDocSummary[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      sourceName: string;
      sourceType: string;
      chunkCount: number;
      totalChars: number;
      createdAt: Date;
    }>
  >(
    `SELECT
       "sourceName",
       "sourceType",
       COUNT(*)::int AS "chunkCount",
       SUM(LENGTH("content"))::int AS "totalChars",
       MAX("createdAt") AS "createdAt"
     FROM documentchunk
     WHERE "userId" = $1
     GROUP BY "sourceName", "sourceType"
     ORDER BY MAX("createdAt") DESC`,
    userId
  );

  return rows.map((r) => ({
    sourceName: r.sourceName,
    sourceType: r.sourceType,
    chunkCount: r.chunkCount,
    totalChars: r.totalChars,
    createdAt: new Date(r.createdAt),
  }));
}

/**
 * 把文档清单格式化成给模型看的一段话（纯函数，导出以便测试）
 *
 * 为什么要专门格式化而不是直接甩 JSON：这份文本是模型对"知识库里有什么"的
 * 唯一依据，漏一个文档就会让它给出"你只有一个文档"这种错误结论（真实故障）。
 * 所以条数写在开头、逐条编号，并在末尾再报一次总数——让模型没有数错的余地。
 */
export function formatKnowledgeDocList(docs: KnowledgeDocSummary[]): string {
  if (docs.length === 0) return "知识库是空的，用户还没有上传任何文档。";

  const lines = docs.map(
    (d, i) =>
      `${i + 1}. ${d.sourceName}（${d.sourceType}，${d.chunkCount} 个片段，约 ${d.totalChars} 字）`
  );

  return `知识库中共有 ${docs.length} 个文档：\n${lines.join("\n")}\n\n以上是全部 ${docs.length} 个文档。`;
}
