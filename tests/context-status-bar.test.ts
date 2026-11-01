import { describe, expect, it } from "vitest";
import { buildAgentStatusBar } from "@/lib/context/status-bar";
import type { AgentStateData } from "@/lib/context/types";

function state(overrides: Partial<AgentStateData> = {}): AgentStateData {
  return {
    id: "s1",
    conversationId: "c1",
    summary: "",
    workingMemory: [],
    todoList: [],
    compressedThroughMessageId: null,
    version: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("buildAgentStatusBar", () => {
  it("没有状态时返回空字符串", () => {
    expect(buildAgentStatusBar({ state: state(), surface: "agent" })).toBe("");
  });

  it("生成场景、当前任务、进度和约束", () => {
    const bar = buildAgentStatusBar({
      state: state({
        workingMemory: [
          { content: "保留原有文档结构", importance: "high" },
          { content: "不要删除已确认内容", importance: "medium" },
        ],
        todoList: [
          { id: "t1", content: "分析原文", status: "completed" },
          { id: "t2", content: "调整学习阶段", status: "in_progress" },
          { id: "t3", content: "检查修改结果", status: "pending" },
        ],
      }),
      surface: "doc",
    });

    expect(bar).toContain("<agent_status>");
    expect(bar).toContain("当前场景：文档工作台");
    expect(bar).toContain("当前任务：保留原有文档结构");
    expect(bar).toContain("已完成：分析原文");
    expect(bar).toContain("进行中：调整学习阶段");
    expect(bar).toContain("待完成：检查修改结果");
    expect(bar).toContain("重要约束：");
  });

  it("低重要性信息不进入约束区", () => {
    const bar = buildAgentStatusBar({
      state: state({
        workingMemory: [{ content: "随便看看", importance: "low" }],
      }),
      surface: "agent",
    });
    expect(bar).toContain("当前任务：随便看看");
    expect(bar).not.toContain("重要约束：");
  });
});
