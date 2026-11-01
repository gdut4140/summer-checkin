// ============================================================
// 会话上下文工具
//
//   searchConversationHistory  找回被摘要压缩的历史原文
//   updateAgentState           维护当前会话的 workingMemory / todoList
//
// 两个工具都只作用于当前 conversationId，服务端校验 userId 归属。
// ============================================================

import { tool } from "ai";
import { z } from "zod";
import {
  getOrCreateAgentState,
  normalizeTodoList,
  normalizeWorkingMemory,
  updateAgentStateWithRetry,
} from "@/lib/context/agent-state";
import { searchConversationHistory } from "@/lib/context/history-search";
import { prisma } from "@/lib/prisma";
import { safeExecute } from "./utils";

async function ownsConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  return Boolean(conversation);
}

export function createContextTools(userId: string, conversationId: string) {
  const searchConversationHistoryTool = tool({
    description:
      "搜索当前对话的历史原文。当用户询问之前说过的具体参数、原话、代码、决策或细节，" +
      "而当前上下文和摘要无法提供足够依据时使用。只搜索当前对话，返回最多 5 条。" +
      "不要凭空猜测历史内容。",
    inputSchema: z.object({
      query: z.string().describe("搜索关键词或原话片段"),
      limit: z.number().optional().describe("返回条数，默认 5，最大 5"),
    }),
    execute: async ({ query, limit }) => {
      return safeExecute("searchConversationHistory", async () => {
        const result = await searchConversationHistory({
          userId,
          conversationId,
          query,
          limit,
        });
        console.log(
          `[searchConversationHistory] conversation=${conversationId} query="${query}" → ${result.count} 条`
        );
        return result;
      });
    },
  });

  const updateAgentStateTool = tool({
    description:
      "更新当前会话的短期状态：workingMemory 保存当前任务的重要信息/约束，" +
      "todoList 保存当前任务进度。只影响当前对话的状态栏，不修改用户长期记忆或业务数据。" +
      "当对话中出现新的任务、约束或进度变化时调用。",
    inputSchema: z.object({
      workingMemory: z
        .array(
          z.object({
            content: z.string().min(1).max(200),
            importance: z.enum(["high", "medium", "low"]),
          })
        )
        .max(10)
        .optional()
        .describe("当前任务的重要信息和约束，整体替换旧值"),
      todoList: z
        .array(
          z.object({
            id: z.string().optional(),
            content: z.string().min(1).max(200),
            status: z.enum(["pending", "in_progress", "completed"]),
          })
        )
        .max(20)
        .optional()
        .describe("当前任务进度，整体替换旧值"),
    }),
    execute: async ({ workingMemory, todoList }) => {
      return safeExecute("updateAgentState", async () => {
        if (workingMemory === undefined && todoList === undefined) {
          return {
            success: false as const,
            error: "至少提供 workingMemory 或 todoList",
          };
        }
        if (!(await ownsConversation(userId, conversationId))) {
          return { success: false as const, error: "Conversation not found" };
        }

        const state = await updateAgentStateWithRetry(conversationId, {
          ...(workingMemory !== undefined
            ? { workingMemory: normalizeWorkingMemory(workingMemory) }
            : {}),
          ...(todoList !== undefined
            ? { todoList: normalizeTodoList(todoList) }
            : {}),
        });

        console.log(
          `[updateAgentState] conversation=${conversationId} ` +
            `workingMemory=${state.workingMemory.length} todo=${state.todoList.length}`
        );

        return {
          success: true as const,
          workingMemory: state.workingMemory,
          todoList: state.todoList,
        };
      });
    },
  });

  return { searchConversationHistory: searchConversationHistoryTool, updateAgentState: updateAgentStateTool };
}

/** 只读版本：某些场景只需要回溯，不需要改状态。 */
export function createHistorySearchTool(userId: string, conversationId: string) {
  return createContextTools(userId, conversationId).searchConversationHistory;
}

/** 测试/调试用 */
export async function readAgentState(conversationId: string) {
  return getOrCreateAgentState(conversationId);
}
