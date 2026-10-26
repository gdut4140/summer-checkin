// ============================================================
// 知识库上传管道：chunk → embed → 覆盖写库
// 供 API route 调用，不直接暴露给客户端
//
// 产品行为：同一用户上传同名文档 = 覆盖旧文档（用户通常会修订学习资料）。
// 「同名」以 (userId, sourceName) 为键，不同用户上传同名文件互不影响。
//
// 一致性要求 —— 这条管道最容易出的错就是新旧混杂：
//   1. embedding 必须在事务外生成。它最慢、也最可能失败；放进事务会长时间
//      占住连接，而且一旦失败，旧分片已经被删了 —— 一次失败的上传变成数据丢失。
//   2. 删旧分片 + 插新分片 + 更新原文记录必须在同一个事务里。任何一步失败都
//      整体回滚，读者只会看到旧版本或新版本，不会看到两者拼接出来的半成品。
//   3. 同一 (userId, sourceName) 的并发上传用事务级 advisory lock 串行化。
//      否则两次几乎同时的覆盖会各自 DELETE 再 INSERT，READ COMMITTED 下互相
//      看不见对方未提交的行，最后两批分片都留在库里 —— 这正是「重复上传留下
//      旧分片」的并发版本。锁键里带 userId，不同用户/不同文档互不阻塞。
// ============================================================

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { splitText, splitMarkdown } from "@/lib/rag/chunk";
import { embedTexts } from "@/lib/rag/client";
import { toPgVector } from "@/lib/rag/retriever";
import { assertChunkLimit, assertTextLimit } from "@/lib/knowledge-upload-guard";

interface ProcessOptions {
  userId: string;
  text: string;
  sourceName: string;
  sourceType: "text" | "markdown" | "pdf" | "docx";
}

export interface ProcessResult {
  success: boolean;
  error?: string;
  sourceName?: string;
  /** 本次写入的分片数 */
  chunks: number;
  /** 被本次覆盖掉的旧分片数；0 表示首次上传 */
  replacedChunks: number;
}

/**
 * 处理上传文本的完整管道：
 * 1. 按文档类型分片（Markdown 按标题，其他固定大小）
 * 2. 批量生成 embedding（事务外）
 * 3. 事务内覆盖写入：删旧分片 → 插新分片 → 更新原文
 *
 * 失败时抛错，且保证库里的旧文档原样保留。
 */
export async function processKnowledgeText(
  opts: ProcessOptions
): Promise<ProcessResult> {
  const { userId, text, sourceName, sourceType } = opts;

  // 上限检查放在切片和 embedding 之前：超限时一次 API 调用都不发
  assertTextLimit(text);

  // 1. Chunk（纯本地计算，不碰库）
  const chunks =
    sourceType === "markdown" ? splitMarkdown(text) : splitText(text);

  if (chunks.length === 0) {
    return {
      success: false,
      error: "No content to process",
      chunks: 0,
      replacedChunks: 0,
    };
  }

  assertChunkLimit(chunks.length);

  console.log(
    `[Knowledge] 分片完成: ${text.length} 字 → ${chunks.length} 个 chunk`
  );

  // 2. Embed（事务外）。失败直接抛，旧数据原封不动。
  const embeddings = await embedTexts(chunks);
  if (embeddings.length !== chunks.length) {
    // 数量对不上时继续写会把 undefined 塞进 vector 列（或错位配对），
    // 宁可在这里失败，也不要在库里留下内容与向量错位的分片。
    throw new Error(
      `向量数量与分片数量不一致：${embeddings.length} / ${chunks.length}`
    );
  }
  console.log(`[Knowledge] Embedding 完成: ${embeddings.length} 个向量`);

  // 3. 事务内覆盖写入。
  //    embedding 是 Unsupported 字段，Prisma 无法生成 create 方法，只能走 raw SQL；
  //    向量以 JSON 数组字符串传参，$7::vector 由 pgvector 解析。
  //    timeout 显式放宽：Prisma 交互式事务默认 5s，大文档逐个 INSERT 可能不够。
  const now = new Date();
  const replacedChunks = await prisma.$transaction(
    async (tx) => {
      // 同一用户同名文档串行化；事务结束（提交或回滚）自动释放。
      // 用双参数形式而不是把两个值拼成一个字符串：PostgreSQL 的 text 不能包含
      // 0x00（报 "invalid byte sequence for encoding UTF8: 0x00"），
      // 任何分隔符方案都得先确保分隔符不会出现在值里；分开传就没有这个问题。
      //
      // 必须用 $executeRaw 而不是 $queryRaw：该函数返回 void，
      // Prisma 驱动适配器无法反序列化 void 列
      // （"Failed to deserialize column of type 'void'"）。
      // 锁只需要副作用（等锁/加锁），我们不需要它的返回值。
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
        userId,
        sourceName
      );

      const removed = await tx.documentChunk.deleteMany({
        where: { userId, sourceName },
      });

      for (let i = 0; i < chunks.length; i++) {
        await tx.$executeRawUnsafe(
          `INSERT INTO documentchunk (id, "userId", "sourceName", "sourceType", "chunkIndex", content, embedding, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8)`,
          randomUUID(),
          userId,
          sourceName,
          sourceType,
          i,
          chunks[i],
          toPgVector(embeddings[i]),
          now
        );
      }

      // 存原文（查看时直接展示，不做切片反推；旧数据无此行则回退切片拼接）。
      // 与分片同进同退 —— 之前它在事务外，分片写成功、原文写失败就会留下
      // 「能搜到但查看的是旧内容」的文档。
      await tx.knowledgeDoc.upsert({
        where: { userId_sourceName: { userId, sourceName } },
        update: { sourceType, content: text, createdAt: now },
        create: { userId, sourceName, sourceType, content: text },
      });

      return removed.count;
    },
    { maxWait: 10_000, timeout: 60_000 }
  );

  console.log(
    `[Knowledge] ✅ 已存储: user=${userId} "${sourceName}" (${chunks.length} chunks` +
      `${replacedChunks > 0 ? `，覆盖旧分片 ${replacedChunks} 个` : ""})`
  );

  return {
    success: true,
    sourceName,
    chunks: chunks.length,
    replacedChunks,
  };
}
