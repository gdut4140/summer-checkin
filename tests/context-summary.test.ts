import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversationMessage: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/context/agent-state", () => ({
  getOrCreateAgentState: vi.fn(),
  saveConversationSummary: vi.fn(),
}));
vi.mock("@/lib/model-pool", () => ({
  completionsWithFallback: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { completionsWithFallback } from "@/lib/model-pool";
import {
  getOrCreateAgentState,
  saveConversationSummary,
} from "@/lib/context/agent-state";
import {
  formatMessagesForSummary,
  isMessageComplete,
  maybeCompressConversation,
} from "@/lib/context/summarizer";
import type { AgentStateData } from "@/lib/context/types";

const mockFindMany = vi.mocked(prisma.conversationMessage.findMany);
const mockFindUnique = vi.mocked(prisma.conversationMessage.findUnique);
const mockGetState = vi.mocked(getOrCreateAgentState);
const mockSaveSummary = vi.mocked(saveConversationSummary);
const mockComplete = vi.mocked(completionsWithFallback);

function state(overrides: Partial<AgentStateData> = {}): AgentStateData {
  return {
    id: "s1",
    conversationId: "c1",
    summary: "旧摘要：用户在准备面试",
    workingMemory: [],
    todoList: [],
    compressedThroughMessageId: null,
    version: 1,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function message(id: string, role: string, content: string, minutes: number) {
  return {
    id,
    role,
    content,
    parts: null,
    rawParts: null,
    createdAt: new Date(2026, 0, 1, 0, minutes),
  };
}

const recent = Array.from({ length: 20 }, (_, i) =>
  message(`r${i}`, i % 2 === 0 ? "user" : "assistant", `recent-${i}`, 100 + i)
);
const older = [
  message("o1", "user", "第一轮：我准备前端面试", 1),
  message("o2", "assistant", "好的，我们按面试准备", 2),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetState.mockResolvedValue(state());
  mockComplete.mockResolvedValue({
    data: { choices: [{ message: { content: "合并后的新摘要" } }] },
    model: "low-model",
  } as never);
  mockSaveSummary.mockResolvedValue(
    state({
      summary: "合并后的新摘要",
      compressedThroughMessageId: "o2",
      version: 2,
    })
  );
  mockFindUnique.mockResolvedValue(null);
});

describe("isMessageComplete", () => {
  it("未完成的 tool part 不能压缩", () => {
    expect(
      isMessageComplete({
        parts: null,
        rawParts: [{ type: "tool-getMyMemories", state: "input-available" }],
      })
    ).toBe(false);
  });

  it("已完成的 tool part 可以压缩", () => {
    expect(
      isMessageComplete({
        parts: null,
        rawParts: [{ type: "tool-getMyMemories", state: "output-available" }],
      })
    ).toBe(true);
  });

  it("没有 parts 的旧消息按完整处理", () => {
    expect(isMessageComplete({ parts: null, rawParts: null })).toBe(true);
  });
});

describe("formatMessagesForSummary", () => {
  it("保留正文与工具摘要，且区分角色", () => {
    const text = formatMessagesForSummary([
      message("m1", "user", "我喜欢 React", 1),
      {
        ...message("m2", "assistant", "", 2),
        parts: [
          { type: "text", text: "我查一下" },
          { type: "tool", toolName: "getMyMemories", summary: "返回 3 条" },
        ],
      },
    ]);
    expect(text).toContain("用户：我喜欢 React");
    expect(text).toContain("AI：我查一下");
    expect(text).toContain("[工具 getMyMemories] 返回 3 条");
  });
});

describe("maybeCompressConversation", () => {
  it("新摘要的输入同时包含旧摘要和新增对话（替换式，不是追加）", async () => {
    mockFindMany
      .mockResolvedValueOnce(recent as never)
      .mockResolvedValueOnce(older as never);

    let captured: {
      messages: Array<{ role: string; content: string }>;
    } | null = null;

    mockComplete.mockImplementationOnce(async (_tier, build) => {
      const client = {
        chat: {
          completions: {
            create: async (args: {
              messages: Array<{ role: string; content: string }>;
            }) => {
              captured = args;
              return { choices: [{ message: { content: "合并后的新摘要" } }] };
            },
          },
        },
      };
      const data = await build({} as never, client as never, {} as never);
      return { data, model: "low-model" } as never;
    });

    await maybeCompressConversation({
      conversationId: "c1",
      userId: "u1",
    });

    const prompt = captured!.messages[1].content;
    expect(prompt).toContain("旧摘要：用户在准备面试");
    expect(prompt).toContain("第一轮：我准备前端面试");
    expect(mockSaveSummary).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "合并后的新摘要" })
    );
  });

  it("超过近期窗口后压缩旧消息，使用旧摘要并替换边界", async () => {
    mockFindMany
      .mockResolvedValueOnce(recent as never)
      .mockResolvedValueOnce(older as never);

    const result = await maybeCompressConversation({
      conversationId: "c1",
      userId: "u1",
      excludeMessageId: "current",
    });

    expect(mockComplete).toHaveBeenCalledOnce();
    // 直接检查 save 的入参：摘要与边界必须一起写
    expect(mockSaveSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({ summary: "旧摘要：用户在准备面试" }),
        summary: "合并后的新摘要",
        compressedThroughMessageId: "o2",
      })
    );
    expect(result.compressedThroughMessageId).toBe("o2");
    // 原始消息没有被删除（prisma mock 根本没有 delete 方法）
    expect(
      (prisma.conversationMessage as unknown as { delete?: unknown }).delete
    ).toBeUndefined();
  });

  it("版本冲突时不覆盖新摘要，返回最新状态", async () => {
    mockFindMany
      .mockResolvedValueOnce(recent as never)
      .mockResolvedValueOnce(older as never);
    mockSaveSummary.mockResolvedValue(null);
    mockGetState
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(
        state({ summary: "别人刚写入的新摘要", version: 5 })
      );

    const result = await maybeCompressConversation({
      conversationId: "c1",
      userId: "u1",
    });

    expect(result.summary).toBe("别人刚写入的新摘要");
  });

  it("消息不足近期窗口时不调用模型", async () => {
    mockFindMany.mockResolvedValueOnce(recent.slice(0, 5) as never);
    const result = await maybeCompressConversation({
      conversationId: "c1",
      userId: "u1",
    });
    expect(mockComplete).not.toHaveBeenCalled();
    expect(result.summary).toBe("旧摘要：用户在准备面试");
  });
});
