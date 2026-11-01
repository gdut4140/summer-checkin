// ============================================================
// 历史原文回溯
//
// 只搜索当前 Conversation，服务端校验 userId 归属。
// 第一版用 PostgreSQL ILIKE 做全文匹配，同时搜索 content、展示 parts 和 rawParts；
// 不引入新的检索框架。返回最多 5 条。
// ============================================================

import { prisma } from "@/lib/prisma";
import { CONTEXT_CONFIG } from "./config";
import { messageSearchableText } from "./summarizer";

export interface HistorySearchResult {
  success: boolean;
  count: number;
  query: string;
  results: Array<{
    messageId: string;
    role: string;
    content: string;
    createdAt: string;
  }>;
  message?: string;
  error?: string;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function searchConversationHistory(input: {
  userId: string;
  conversationId: string;
  query: string;
  limit?: number;
}): Promise<HistorySearchResult> {
  const query = input.query.trim().slice(0, CONTEXT_CONFIG.historySearchQueryMaxChars);
  if (!query) {
    return {
      success: true,
      count: 0,
      query: "",
      results: [],
      message: "搜索词为空。",
    };
  }

  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, userId: input.userId },
    select: { id: true },
  });
  if (!conversation) {
    return {
      success: false,
      count: 0,
      query,
      results: [],
      error: "Conversation not found",
    };
  }

  const limit = Math.max(
    1,
    Math.min(input.limit ?? CONTEXT_CONFIG.historySearchLimit, CONTEXT_CONFIG.historySearchLimit)
  );
  const pattern = `%${escapeLike(query)}%`;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      role: string;
      content: string;
      parts: unknown;
      createdAt: Date;
    }>
  >(
    `SELECT id, role, content, parts, "createdAt"
     FROM conversationmessage
     WHERE "conversationId" = $1
       AND (
         content ILIKE $2 ESCAPE '\\'
         OR parts::text ILIKE $2 ESCAPE '\\'
         OR "rawParts"::text ILIKE $2 ESCAPE '\\'
       )
     ORDER BY "createdAt" DESC
     LIMIT $3`,
    input.conversationId,
    pattern,
    limit
  );

  const results = rows.map((row) => ({
    messageId: row.id,
    role: row.role,
    content:
      messageSearchableText({
        content: row.content,
        parts: row.parts,
      }).slice(0, 500) || row.content.slice(0, 500),
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    success: true,
    count: results.length,
    query,
    results,
    ...(results.length === 0
      ? { message: "没有找到匹配的历史消息。" }
      : {}),
  };
}
