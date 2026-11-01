import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentState: {
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  getOrCreateAgentState,
  parseTodoList,
  parseWorkingMemory,
  saveConversationSummary,
  updateAgentState,
} from "@/lib/context/agent-state";
import type { AgentStateData } from "@/lib/context/types";

const mockUpsert = vi.mocked(prisma.agentState.upsert);
const mockUpdateMany = vi.mocked(prisma.agentState.updateMany);
const mockFindUnique = vi.mocked(prisma.agentState.findUniqueOrThrow);

function state(overrides: Partial<AgentStateData> = {}): AgentStateData {
  return {
    id: "s1",
    conversationId: "c1",
    summary: "old",
    workingMemory: [],
    todoList: [],
    compressedThroughMessageId: null,
    version: 3,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentState 解析与限制", () => {
  it("按 conversationId 懒初始化，状态按会话隔离", async () => {
    mockUpsert.mockResolvedValue({
      ...state(),
      workingMemory: [],
      todoList: [],
    } as never);
    await getOrCreateAgentState("c1");
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { conversationId: "c1" },
      create: { conversationId: "c1" },
      update: {},
    });
  });

  it("workingMemory 截断到 10 条，非法 importance 降级为 medium", () => {
    const parsed = parseWorkingMemory(
      Array.from({ length: 12 }, (_, i) => ({
        content: `item-${i}`,
        importance: i === 0 ? "urgent" : "high",
      }))
    );
    expect(parsed).toHaveLength(10);
    expect(parsed[0].importance).toBe("medium");
  });

  it("todoList 截断到 20 条，缺失 id 自动生成，非法状态降级为 pending", () => {
    const parsed = parseTodoList(
      Array.from({ length: 25 }, (_, i) => ({
        content: `todo-${i}`,
        status: i === 0 ? "unknown" : "in_progress",
      }))
    );
    expect(parsed).toHaveLength(20);
    expect(parsed[0].status).toBe("pending");
    expect(parsed[0].id).toBeTruthy();
  });
});

describe("乐观锁", () => {
  it("saveConversationSummary 版本冲突时返回 null，不覆盖新摘要", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never);
    const result = await saveConversationSummary({
      state: state(),
      summary: "new",
      compressedThroughMessageId: "m3",
    });
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("保存成功时同一次写入 summary 与压缩边界", async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockFindUnique.mockResolvedValue({
      ...state(),
      summary: "new",
      compressedThroughMessageId: "m3",
      version: 4,
      workingMemory: [],
      todoList: [],
    } as never);

    const result = await saveConversationSummary({
      state: state(),
      summary: "new",
      compressedThroughMessageId: "m3",
    });

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1", version: 3 },
        data: expect.objectContaining({
          summary: "new",
          compressedThroughMessageId: "m3",
          version: { increment: 1 },
        }),
      })
    );
    expect(result?.compressedThroughMessageId).toBe("m3");
  });

  it("updateAgentState 版本冲突时返回 null", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never);
    const result = await updateAgentState(state(), {
      workingMemory: [{ content: "x", importance: "high" }],
    });
    expect(result).toBeNull();
  });
});
