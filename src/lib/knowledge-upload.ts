// ============================================================
// 知识库上传管道：chunk → embed → store
// 供 API route 调用，不直接暴露给客户端
// ============================================================

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { splitText, splitMarkdown } from "@/lib/rag/chunk";
import { embedTexts } from "@/lib/rag/client";

interface ProcessOptions {
  userId: string;
  text: string;
  sourceName: string;
  sourceType: "text" | "markdown" | "pdf";
}

/**
 * 处理上传文本的完整管道：
 * 1. 按文档类型分片（Markdown 按标题，其他固定大小）
 * 2. 批量生成 embedding
 * 3. 事务写入数据库
 *
 * 返回 { success, sourceName, chunks }
 */
export async function processKnowledgeText(opts: ProcessOptions) {
  const { userId, text, sourceName, sourceType } = opts;

  // 1. Chunk
  const chunks =
    sourceType === "markdown" ? splitMarkdown(text) : splitText(text);

  if (chunks.length === 0) {
    return { success: false, error: "No content to process", chunks: 0 };
  }

  console.log(
    `[Knowledge] 分片完成: ${text.length} 字 → ${chunks.length} 个 chunk`
  );

  // 2. Embed（一次 API 调用批量处理）
  const embeddings = await embedTexts(chunks);
  console.log(`[Knowledge] Embedding 完成: ${embeddings.length} 个向量`);

  // 3. 写库 — 用 raw SQL（embedding 是 Unsupported 字段，Prisma 无法生成 create 方法）
  await prisma.$transaction(
    chunks.map((content, i) =>
      prisma.$executeRawUnsafe(
        `INSERT INTO documentchunk (id, "userId", "sourceName", "sourceType", "chunkIndex", content, embedding, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        randomUUID(),
        userId,
        sourceName,
        sourceType,
        i,
        content,
        JSON.stringify(embeddings[i]),
        new Date(),
      )
    )
  );

  console.log(
    `[Knowledge] ✅ 已存储: user=${userId} "${sourceName}" (${chunks.length} chunks)`
  );

  return { success: true, sourceName, chunks: chunks.length };
}
