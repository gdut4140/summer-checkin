// ============================================================
// RAG: 个人知识库搜索工具
//
// searchKnowledgeBase — 仅搜索当前用户上传的文档
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { searchKnowledge } from "@/lib/rag";
import { safeExecute } from "./utils";

export function createRAGTool(userId: string) {
  const searchKnowledgeBase = tool({
    description:
      "搜索当前用户的个人知识库。当用户询问关于其上传的文档、资料内容时，调用此工具。" +
      "知识库中的内容是该用户上传的文档（Markdown、PDF、文本等）。",

    inputSchema: z.object({
      query: z.string().describe("搜索查询，用自然语言描述你想查找的内容"),
    }),

    execute: async ({ query }) => {
      return safeExecute("searchKnowledge", async () => {
        console.log(`[RAG Tool] 用户 ${userId} 搜索知识库: "${query.slice(0, 80)}"`);

        const result = await searchKnowledge(query, userId);

        if (result.results.length === 0) {
          return {
            success: true,
            query: result.query,
            found: false,
            message: "知识库中未找到与你的问题相关的内容。",
            results: [],
          };
        }

        console.log(
          `[RAG Tool] ✅ 找到 ${result.results.length} 条结果 (搜索了 ${result.searchedChunks} 个文档块)`
        );

        return {
          success: true,
          query: result.query,
          found: true,
          count: result.results.length,
          searchedChunks: result.searchedChunks,
          message: `从知识库中找到了 ${result.results.length} 条相关内容`,
          results: result.results.map((r) => ({
            content: r.content,
            source: r.sourceName,
            relevanceScore: Math.round(r.score * 100) / 100,
          })),
        };
      });
    },
  });

  return { searchKnowledgeBase };
}
