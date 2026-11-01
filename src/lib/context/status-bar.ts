// ============================================================
// Agent Status Bar
//
// 由代码从 AgentState 生成，不调用 LLM、不重新统计历史。
// 每次请求动态生成，作为最后一条 system 消息注入，不持久化到消息表。
// ============================================================

import type { MemorySurface } from "@/lib/memory/types";
import { sanitizeMemoryContent } from "@/lib/memory/render";
import type { AgentStateData, TodoItem } from "./types";

const SURFACE_LABEL: Record<MemorySurface, string> = {
  agent: "智能体",
  plan: "计划工作台",
  doc: "文档工作台",
};

function todoLabel(status: TodoItem["status"]): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "in_progress":
      return "进行中";
    default:
      return "待完成";
  }
}

/**
 * 生成 <agent_status> 块。
 *
 * 没有 workingMemory / todoList 时返回空字符串，避免每轮注入空壳。
 */
export function buildAgentStatusBar(input: {
  state: AgentStateData;
  surface: MemorySurface;
}): string {
  const { state, surface } = input;
  const workingMemory = state.workingMemory;
  const todoList = state.todoList;
  if (workingMemory.length === 0 && todoList.length === 0) return "";

  const currentTask =
    workingMemory.find((item) => item.importance === "high")?.content ??
    workingMemory[0]?.content;

  const constraints = workingMemory
    .filter((item) => item.importance !== "low")
    .map((item) => sanitizeMemoryContent(item.content))
    .filter(Boolean);

  const progress = todoList.map(
    (item) => `- ${todoLabel(item.status)}：${sanitizeMemoryContent(item.content)}`
  );

  const sections: string[] = [`当前场景：${SURFACE_LABEL[surface]}`];

  if (currentTask) {
    sections.push(`当前任务：${sanitizeMemoryContent(currentTask)}`);
  }

  if (progress.length > 0) {
    sections.push(`任务进度：\n${progress.join("\n")}`);
  }

  if (constraints.length > 0) {
    sections.push(
      `重要约束：\n${constraints.map((item) => `- ${item}`).join("\n")}`
    );
  }

  return `<agent_status>\n${sections.join("\n\n")}\n</agent_status>`;
}
