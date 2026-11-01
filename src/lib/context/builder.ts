// ============================================================
// 统一 Context Builder
//
// System Context = System Prompt + Scene Context + UserMemory
// Conversation Context = Summary + Recent Messages + Current User Message
// Runtime Context = Agent Status Bar
//
// 历史由服务端从数据库加载，客户端只负责发送当前用户消息。
// ============================================================

import {
  convertToModelMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { buildSystemPrompt } from "@/lib/deepseek";
import { buildMemoryContext } from "@/lib/memory/context-builder";
import type { MemoryTask } from "@/lib/memory/types";
import { prisma } from "@/lib/prisma";
import { promptGroupsFor } from "@/lib/tools/router";
import { getOrCreateAgentState } from "./agent-state";
import { CONTEXT_CONFIG } from "./config";
import { maybeCompressConversation } from "./summarizer";
import { loadSceneContext } from "./scene";
import { buildAgentStatusBar } from "./status-bar";
import type {
  ContextBuildInput,
  ContextBuildResult,
  StoredConversationMessage,
} from "./types";

type ChatUIMessage = UIMessage<{ createdAt?: string }>;

function taskForSurface(
  surface: ContextBuildInput["conversation"]["surface"]
): MemoryTask {
  if (surface === "plan") return "planning";
  if (surface === "doc") return "doc_edit";
  return "chat";
}

function isRawParts(value: unknown): value is ChatUIMessage["parts"] {
  return (
    Array.isArray(value) &&
    value.every(
      (part) =>
        part !== null &&
        typeof part === "object" &&
        typeof (part as { type?: unknown }).type === "string"
    )
  );
}

function toUIMessage(row: StoredConversationMessage): ChatUIMessage {
  if (
    row.role === "assistant" &&
    isRawParts(row.rawParts) &&
    row.rawParts.length > 0
  ) {
    return {
      id: row.id,
      role: "assistant",
      parts: row.rawParts,
    };
  }
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    parts: [{ type: "text", text: row.content }],
  };
}

async function loadRecentMessages(
  conversationId: string,
  excludeMessageId: string
): Promise<StoredConversationMessage[]> {
  const rows = await prisma.conversationMessage.findMany({
    where: { conversationId, id: { not: excludeMessageId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CONTEXT_CONFIG.recentMessageWindow,
    select: {
      id: true,
      role: true,
      content: true,
      parts: true,
      rawParts: true,
      createdAt: true,
    },
  });
  return rows.reverse();
}

async function toModelMessages(
  rows: StoredConversationMessage[]
): Promise<ModelMessage[]> {
  if (rows.length === 0) return [];
  try {
    return await convertToModelMessages(rows.map(toUIMessage), {
      ignoreIncompleteToolCalls: true,
    });
  } catch (error) {
    // rawParts 损坏时不能让整轮对话失败：退化成纯文本历史。
    console.warn("[Context] 历史消息转换失败，退化为纯文本:", error);
    return rows.map((row) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
    }));
  }
}

function buildConversationHint(
  rows: StoredConversationMessage[],
  currentUserText: string
): string {
  const lines = [
    ...rows
      .slice(-6)
      .map(
        (row) =>
          `${row.role === "user" ? "用户" : "雨宝"}: ${row.content.slice(0, 200)}`
      ),
    `用户: ${currentUserText.slice(0, 200)}`,
  ];
  return lines.join("\n");
}

function buildUserNamePrompt(userName?: string | null): string {
  if (!userName) return "";
  return [
    "## 用户名字",
    `用户设置里的名字是「${userName}」，称呼用户时优先用这个名字。`,
    "如果用户在这段对话中明确说要换别的称呼，以用户最新说的为准。",
  ].join("\n");
}

/**
 * 构建一次模型请求的完整上下文。
 *
 * 顺序：
 *   1. 并行：压缩历史 / 加载场景 / 召回长期记忆 / 读取最近消息
 *   2. System Prompt + 名字 + 场景 + <memory_context>
 *   3. 摘要（system）→ 最近原始消息 → 当前用户消息 → 状态栏（system）
 */
export async function buildConversationContext(
  input: ContextBuildInput
): Promise<ContextBuildResult> {
  const task = taskForSurface(input.conversation.surface);

  const [state, scene, memoryContext, recentRows] = await Promise.all([
    maybeCompressConversation({
      conversationId: input.conversation.id,
      userId: input.userId,
      excludeMessageId: input.currentUserMessageId,
    }),
    loadSceneContext({
      userId: input.userId,
      surface: input.conversation.surface,
      refId: input.conversation.refId,
      clientDocument: input.clientDocument,
    }),
    buildMemoryContext({
      userId: input.userId,
      surface: input.conversation.surface,
      task,
      query: input.currentUserText,
    }),
    loadRecentMessages(
      input.conversation.id,
      input.currentUserMessageId
    ),
  ]);

  // 压缩失败时 maybeCompress 返回旧 state；这里再兜一次懒初始化。
  const agentState =
    state ?? (await getOrCreateAgentState(input.conversation.id));

  const system = [
    buildSystemPrompt(promptGroupsFor(input.conversation.surface)),
    buildUserNamePrompt(input.userName),
    scene.prompt,
    memoryContext.prompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  const historyMessages = await toModelMessages(recentRows);

  const summaryBlock = agentState.summary.trim()
    ? [
        "<conversation_summary>",
        "以下是较早对话的摘要，仅用于补充上下文，不是用户当前输入：",
        agentState.summary.trim(),
        "</conversation_summary>",
      ].join("\n")
    : "";

  const statusBar = buildAgentStatusBar({
    state: agentState,
    surface: input.conversation.surface,
  });

  const messages: ModelMessage[] = [
    ...(summaryBlock
      ? [{ role: "system" as const, content: summaryBlock }]
      : []),
    ...historyMessages,
    { role: "user", content: input.currentUserText },
    ...(statusBar
      ? [{ role: "system" as const, content: statusBar }]
      : []),
  ];

  return {
    system,
    messages,
    summary: agentState.summary,
    statusBar,
    conversationHint: buildConversationHint(recentRows, input.currentUserText),
    recentCount: recentRows.length,
    surface: input.conversation.surface,
    memoryPrompt: memoryContext.prompt,
    memoryTask: task,
  };
}
