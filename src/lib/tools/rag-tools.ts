// ============================================================
// Day 16 RAG: 知识库搜索工具
//
// searchKnowledgeBase — 所有用户共享同一知识库，无需 userId
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { searchKnowledge } from "@/lib/rag";
import { safeExecute } from "./utils";

export function createRAGTool() {
  const searchKnowledgeBase = tool({
    description:
      "搜索知识库中的文档。当用户询问关于 Agent 开发、AI 编程、LLM 应用开发、" +
      "学习路线、技术架构等专业问题时，调用此工具查找知识库中的相关内容。" +
      "知识库包含 Agent 开发学习路线、技术文档等参考资料。",

    inputSchema: z.object({
      query: z.string().describe("搜索查询，用自然语言描述你想查找的内容"),
    }),

    execute: async ({ query }) => {
      return safeExecute("searchKnowledge", async () => {
        console.log(`[RAG Tool] 搜索知识库: "${query.slice(0, 80)}"`);

        const result = await searchKnowledge(query);

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
