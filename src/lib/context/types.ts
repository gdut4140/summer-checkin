import type { ModelMessage } from "ai";
import type { MemorySurface, MemoryTask } from "@/lib/memory/types";

export type WorkingMemoryImportance = "high" | "medium" | "low";

export interface WorkingMemoryItem {
  content: string;
  importance: WorkingMemoryImportance;
}

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

/** AgentState 的领域对象（JSON 字段已解析） */
export interface AgentStateData {
  id: string;
  conversationId: string;
  summary: string;
  workingMemory: WorkingMemoryItem[];
  todoList: TodoItem[];
  compressedThroughMessageId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** 一次请求解析出的会话归属 */
export interface ConversationRef {
  id: string;
  surface: MemorySurface;
  refId: string | null;
}

export interface ContextBuildInput {
  userId: string;
  conversation: ConversationRef;
  /** 本轮用户消息在数据库里的 id（构建历史时排除，避免重复） */
  currentUserMessageId: string;
  /** 本轮用户消息纯文本 */
  currentUserText: string;
  userName?: string | null;
  /** 工作台编辑器的当前内容（可选；没有则用数据库里的最新内容） */
  clientDocument?: string | null;
}

export interface ContextBuildResult {
  system: string;
  messages: ModelMessage[];
  summary: string;
  statusBar: string;
  conversationHint: string;
  recentCount: number;
  surface: MemorySurface;
  memoryPrompt: string;
  memoryTask: MemoryTask;
}

/** 从 DB 行构造 UIMessage 时使用的最小形状 */
export interface StoredConversationMessage {
  id: string;
  role: string;
  content: string;
  parts: unknown;
  rawParts: unknown;
  createdAt: Date;
}
