// ============================================================
// AgentState 读写服务
//
// 一个 Conversation 对应一条 AgentState：
//   summary                    滚动摘要
//   workingMemory / todoList   当前任务信息与进度
//   compressedThroughMessageId 压缩边界
//   version                    乐观锁
// ============================================================

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma-generated/client";
import { prisma } from "@/lib/prisma";
import { CONTEXT_CONFIG } from "./config";
import type {
  AgentStateData,
  TodoItem,
  TodoStatus,
  WorkingMemoryImportance,
  WorkingMemoryItem,
} from "./types";

const IMPORTANCE = new Set<WorkingMemoryImportance>(["high", "medium", "low"]);
const TODO_STATUS = new Set<TodoStatus>([
  "pending",
  "in_progress",
  "completed",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseWorkingMemory(value: unknown): WorkingMemoryItem[] {
  if (!Array.isArray(value)) return [];
  const out: WorkingMemoryItem[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.content !== "string") continue;
    const content = record.content.trim();
    if (!content) continue;
    const importance = IMPORTANCE.has(record.importance as WorkingMemoryImportance)
      ? (record.importance as WorkingMemoryImportance)
      : "medium";
    out.push({ content: content.slice(0, CONTEXT_CONFIG.itemMaxChars), importance });
  }
  return out.slice(0, CONTEXT_CONFIG.workingMemoryLimit);
}

export function parseTodoList(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) return [];
  const out: TodoItem[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.content !== "string") continue;
    const content = record.content.trim();
    if (!content) continue;
    const status = TODO_STATUS.has(record.status as TodoStatus)
      ? (record.status as TodoStatus)
      : "pending";
    out.push({
      id: typeof record.id === "string" && record.id ? record.id : randomUUID(),
      content: content.slice(0, CONTEXT_CONFIG.itemMaxChars),
      status,
    });
  }
  return out.slice(0, CONTEXT_CONFIG.todoLimit);
}

export function normalizeWorkingMemory(
  value: unknown
): WorkingMemoryItem[] {
  if (!Array.isArray(value)) throw new Error("workingMemory 必须是数组");
  if (value.length > CONTEXT_CONFIG.workingMemoryLimit) {
    throw new Error(`workingMemory 最多 ${CONTEXT_CONFIG.workingMemoryLimit} 条`);
  }
  return parseWorkingMemory(value);
}

export function normalizeTodoList(value: unknown): TodoItem[] {
  if (!Array.isArray(value)) throw new Error("todoList 必须是数组");
  if (value.length > CONTEXT_CONFIG.todoLimit) {
    throw new Error(`todoList 最多 ${CONTEXT_CONFIG.todoLimit} 条`);
  }
  return parseTodoList(value);
}

export function toAgentStateData(row: {
  id: string;
  conversationId: string;
  summary: string;
  workingMemory: unknown;
  todoList: unknown;
  compressedThroughMessageId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): AgentStateData {
  return {
    ...row,
    workingMemory: parseWorkingMemory(row.workingMemory),
    todoList: parseTodoList(row.todoList),
  };
}

/** 首次访问时懒初始化；并发 upsert 由 conversationId 唯一约束兜底。 */
export async function getOrCreateAgentState(
  conversationId: string
): Promise<AgentStateData> {
  const row = await prisma.agentState.upsert({
    where: { conversationId },
    create: { conversationId },
    update: {},
  });
  return toAgentStateData(row);
}

export interface AgentStatePatch {
  workingMemory?: WorkingMemoryItem[];
  todoList?: TodoItem[];
}

/**
 * 乐观锁更新。
 *
 * 返回 null 表示 version 已变化（另一个请求先写入），调用方应当重读后再决定
 * 是否重试；不要用无条件 update 覆盖别人的最新状态。
 */
export async function updateAgentState(
  state: AgentStateData,
  patch: AgentStatePatch
): Promise<AgentStateData | null> {
  const result = await prisma.agentState.updateMany({
    where: { id: state.id, version: state.version },
    data: {
      ...(patch.workingMemory
        ? {
            workingMemory: patch.workingMemory as unknown as Prisma.InputJsonValue,
          }
        : {}),
      ...(patch.todoList
        ? { todoList: patch.todoList as unknown as Prisma.InputJsonValue }
        : {}),
      version: { increment: 1 },
    },
  });
  if (result.count === 0) return null;

  const row = await prisma.agentState.findUniqueOrThrow({
    where: { id: state.id },
  });
  return toAgentStateData(row);
}

/** 工具入口用：冲突时重读一次再更新。 */
export async function updateAgentStateWithRetry(
  conversationId: string,
  patch: AgentStatePatch
): Promise<AgentStateData> {
  const current = await getOrCreateAgentState(conversationId);
  const updated = await updateAgentState(current, patch);
  if (updated) return updated;

  const latest = await getOrCreateAgentState(conversationId);
  const retried = await updateAgentState(latest, patch);
  if (!retried) throw new Error("会话状态正在被其他请求更新，请重试");
  return retried;
}

/** 摘要压缩专用：summary 与压缩边界必须同一次写入。 */
export async function saveConversationSummary(input: {
  state: AgentStateData;
  summary: string;
  compressedThroughMessageId: string;
}): Promise<AgentStateData | null> {
  const result = await prisma.agentState.updateMany({
    where: { id: input.state.id, version: input.state.version },
    data: {
      summary: input.summary.slice(0, CONTEXT_CONFIG.summaryMaxChars),
      compressedThroughMessageId: input.compressedThroughMessageId,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) return null;

  const row = await prisma.agentState.findUniqueOrThrow({
    where: { id: input.state.id },
  });
  return toAgentStateData(row);
}
