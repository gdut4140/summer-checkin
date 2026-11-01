// ============================================================
// Rolling Summary（替换式）
//
// 保留最近 N 条原始消息，更早的消息与旧摘要一起压缩成新的完整摘要。
// 原始 ConversationMessage 永不删除；摘要失败保留旧摘要；并发用 version 乐观锁。
// ============================================================

import type { Prisma } from "@prisma-generated/client";
import { completionsWithFallback } from "@/lib/model-pool";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateAgentState,
  saveConversationSummary,
} from "./agent-state";
import { CONTEXT_CONFIG } from "./config";
import type { AgentStateData, StoredConversationMessage } from "./types";

const SUMMARY_PROMPT = `你是会话摘要器。把「旧摘要」和「新增对话」合并成一份新的完整摘要。

必须保留：
- 用户目标和当前任务
- 已经确定的重要决策
- 关键数字、参数、技术方案
- 用户明确提出的约束
- 尚未解决的问题

要求：
- 不要逐句复述，简洁概括
- 不要编造对话中没有的信息
- 工具调用只保留结论和关键参数，不要复述完整参数
- 输出纯文本，不要 Markdown 代码块，不超过 1200 字`;

const COMPLETE_TOOL_STATES = new Set([
  "output-available",
  "output-error",
  "output-denied",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 一条消息能否参与压缩。
 *
 * tool call / tool result 都保存在同一条 assistant 消息的 parts 里；
 * 只要存在未完成的 tool part，就把压缩边界停在它之前，避免把调用和结果拆开。
 */
export function isMessageComplete(message: {
  parts: unknown;
  rawParts: unknown;
}): boolean {
  const parts = Array.isArray(message.rawParts)
    ? message.rawParts
    : Array.isArray(message.parts)
      ? message.parts
      : null;
  if (!parts) return true;

  for (const part of parts) {
    const record = asRecord(part);
    if (!record) continue;
    const type = typeof record.type === "string" ? record.type : "";
    if (!type.startsWith("tool-")) continue;
    const state = typeof record.state === "string" ? record.state : "";
    if (!COMPLETE_TOOL_STATES.has(state)) return false;
  }
  return true;
}

/** 从展示 parts 里提取可读文本：正文 + 工具摘要（正文为空时才补 text parts）。 */
export function messageSearchableText(message: {
  content: string;
  parts: unknown;
}): string {
  const chunks: string[] = [];
  const hasContent = Boolean(message.content.trim());
  if (hasContent) chunks.push(message.content);
  if (!Array.isArray(message.parts)) return chunks.join("\n");

  for (const part of message.parts) {
    const record = asRecord(part);
    if (!record) continue;
    if (record.type === "text" && typeof record.text === "string") {
      if (!hasContent) chunks.push(record.text);
    } else if (record.type === "tool") {
      const name = typeof record.toolName === "string" ? record.toolName : "tool";
      const summary = typeof record.summary === "string" ? record.summary : "";
      chunks.push(`[工具 ${name}] ${summary}`.trim());
    }
  }
  return chunks.join("\n");
}

function formatMessage(message: StoredConversationMessage): string {
  const label = message.role === "user" ? "用户" : "AI";
  const text = messageSearchableText(message).trim();
  return `${label}：${text.slice(0, CONTEXT_CONFIG.summaryMessageMaxChars)}`;
}

export function formatMessagesForSummary(
  messages: StoredConversationMessage[]
): string {
  let total = 0;
  const lines: string[] = [];
  for (const message of messages) {
    const line = formatMessage(message);
    if (total + line.length > CONTEXT_CONFIG.summaryInputMaxChars) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.join("\n");
}

async function compressHistory(input: {
  userId: string;
  previousSummary: string;
  messages: StoredConversationMessage[];
}): Promise<string> {
  const conversation = formatMessagesForSummary(input.messages);
  if (!conversation.trim()) return input.previousSummary;

  const { data: response } = await completionsWithFallback(
    "low",
    (entry, client, extraBody) =>
      client.chat.completions.create({
        model: entry.modelName,
        messages: [
          { role: "system", content: SUMMARY_PROMPT },
          {
            role: "user",
            content: [
              `## 旧摘要\n${input.previousSummary.trim() || "（暂无）"}`,
              `## 新增对话\n${conversation}`,
              "请输出合并后的完整摘要。",
            ].join("\n\n"),
          },
        ],
        temperature: 0.2,
        max_tokens: CONTEXT_CONFIG.summaryMaxChars,
        ...extraBody,
      }),
    { userId: input.userId, surface: "agent-bg" }
  );

  const summary = response.choices[0]?.message?.content?.trim();
  if (!summary) throw new Error("摘要模型返回空内容");
  return summary.slice(0, CONTEXT_CONFIG.summaryMaxChars);
}

/**
 * 检查并执行一次压缩。
 *
 * - 最近 N 条原始消息（不含当前用户消息）永远不压缩
 * - 从 compressedThroughMessageId 之后开始，遇到不完整 tool 消息就停止
 * - 每批最多 N 条 / M 字符，边界只推进到本批最后一条
 * - 失败返回旧 state，不阻塞对话
 */
export async function maybeCompressConversation(input: {
  conversationId: string;
  userId: string;
  excludeMessageId?: string;
}): Promise<AgentStateData> {
  const state = await getOrCreateAgentState(input.conversationId);

  try {
    const recent = await prisma.conversationMessage.findMany({
      where: {
        conversationId: input.conversationId,
        ...(input.excludeMessageId
          ? { id: { not: input.excludeMessageId } }
          : {}),
      },
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

    if (recent.length < CONTEXT_CONFIG.recentMessageWindow) return state;

    const cutoff = recent[recent.length - 1];

    const boundary = state.compressedThroughMessageId
      ? await prisma.conversationMessage.findUnique({
          where: { id: state.compressedThroughMessageId },
          select: { id: true, createdAt: true },
        })
      : null;

    const olderConditions: Prisma.ConversationMessageWhereInput[] = [
      {
        OR: [
          { createdAt: { lt: cutoff.createdAt } },
          { createdAt: cutoff.createdAt, id: { lt: cutoff.id } },
        ],
      },
    ];
    if (boundary) {
      olderConditions.push({
        OR: [
          { createdAt: { gt: boundary.createdAt } },
          { createdAt: boundary.createdAt, id: { gt: boundary.id } },
        ],
      });
    }

    const older = await prisma.conversationMessage.findMany({
      where: {
        conversationId: input.conversationId,
        AND: olderConditions,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        role: true,
        content: true,
        parts: true,
        rawParts: true,
        createdAt: true,
      },
    });

    if (older.length === 0) return state;

    const compressible: StoredConversationMessage[] = [];
    let characterBudget = CONTEXT_CONFIG.summaryInputMaxChars;
    for (const message of older) {
      if (!isMessageComplete(message)) break;
      if (
        compressible.length >= CONTEXT_CONFIG.summaryBatchMessages ||
        characterBudget <= 0
      ) {
        break;
      }
      compressible.push(message);
      characterBudget -= message.content.length;
    }

    if (compressible.length === 0) return state;

    const newSummary = await compressHistory({
      userId: input.userId,
      previousSummary: state.summary,
      messages: compressible,
    });

    const updated = await saveConversationSummary({
      state,
      summary: newSummary,
      compressedThroughMessageId: compressible[compressible.length - 1].id,
    });

    if (!updated) {
      console.warn(
        `[Context] 摘要版本冲突，保留更新后的状态 conversation=${input.conversationId}`
      );
      return getOrCreateAgentState(input.conversationId);
    }

    console.log(
      `[Context] 摘要已更新 conversation=${input.conversationId} ` +
        `messages=${compressible.length} chars=${newSummary.length}`
    );
    return updated;
  } catch (error) {
    console.warn("[Context] 摘要压缩失败，保留旧摘要:", error);
    return state;
  }
}
