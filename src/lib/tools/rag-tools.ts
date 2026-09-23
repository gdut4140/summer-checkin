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
      "搜索用户个人知识库（其上传的文档/资料）。用户询问自己的文档内容时用。" +
      "返回结果已按相关性从高到低排序，relevanceScore 越高越相关。",

    inputSchema: z.object({
      query: z.string().describe("自然语言搜索内容"),
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
          `[RAG Tool] ✅ 找到 ${result.results.length} 条结果 ` +
            `(召回 ${result.recalledChunks} 条，${result.rerankModel ? `重排 ${result.rerankModel}` : "未重排"}，` +
            `知识库共 ${result.searchedChunks} 块)`
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
