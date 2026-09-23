// ============================================================
// RAG: 个人知识库工具
//
// searchKnowledgeBase — 语义检索，找「某段内容在哪」
// listKnowledgeDocs   — 列举，回答「我上传了哪些文档」
//
// 这两个必须分开，不能只留检索：用户问「我的知识库有什么」是**列举**问题，
// 拿去做语义检索会返回几个"和这句话语义最像"的片段（实测 top distance≈0.53，
// 匹配度很差），模型据此归纳就会给出"你的知识库只有一个文档"这种错误结论。
// 真实故障，所以描述里明确写了各自该用在哪。
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import { searchKnowledge } from "@/lib/rag";
import { listKnowledgeDocs, formatKnowledgeDocList } from "@/lib/knowledge-docs";
import { safeExecute } from "./utils";

export function createRAGTool(userId: string) {
  const searchKnowledgeBase = tool({
    description:
      "在用户个人知识库里做**语义检索**，找出与某个具体问题相关的文档片段。" +
      "返回结果已按相关性从高到低排序，relevanceScore 越高越相关。" +
      "⚠️ 只用于「找内容」。若用户问的是「知识库里有哪些文档」「我上传了什么」" +
      "这类**列举**问题，请改用 listKnowledgeDocs，不要用检索去猜。",

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

  const listKnowledgeDocsTool = tool({
    description:
      "列出用户知识库里的**全部文档**（文件名、类型、片段数、字数）。" +
      "当用户问「我的知识库有什么」「我上传了哪些文档/资料」「知识库里有几个文件」" +
      "「有没有 XX 这份文档」时用这个。返回的是完整清单，不需要也不应该再用检索去推断。",

    // 无需参数：这是列举，不是查询
    inputSchema: z.object({}),

    execute: async () => {
      return safeExecute("listKnowledgeDocs", async () => {
        console.log(`[RAG Tool] 用户 ${userId} 列出知识库文档`);

        const docs = await listKnowledgeDocs(userId);
        console.log(`[RAG Tool] ✅ 知识库共 ${docs.length} 个文档`);

        return {
          success: true,
          found: docs.length > 0,
          count: docs.length,
          message: formatKnowledgeDocList(docs),
          documents: docs.map((d) => ({
            name: d.sourceName,
            type: d.sourceType,
            chunks: d.chunkCount,
            chars: d.totalChars,
            uploadedAt: d.createdAt,
          })),
        };
      });
    },
  });

  return { searchKnowledgeBase, listKnowledgeDocs: listKnowledgeDocsTool };
}
