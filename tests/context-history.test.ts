import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { findFirst: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { searchConversationHistory } from "@/lib/context/history-search";

const mockFindConversation = vi.mocked(prisma.conversation.findFirst);
const mockQuery = vi.mocked(prisma.$queryRawUnsafe);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchConversationHistory", () => {
  it("会话不属于当前用户 → 拒绝", async () => {
    mockFindConversation.mockResolvedValue(null);
    const result = await searchConversationHistory({
      userId: "u1",
      conversationId: "c-other",
      query: "React",
    });
    expect(result.success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("空搜索词 → 不查询，明确返回空结果", async () => {
    const result = await searchConversationHistory({
      userId: "u1",
      conversationId: "c1",
      query: "   ",
    });
    expect(result.count).toBe(0);
    expect(mockFindConversation).not.toHaveBeenCalled();
  });

  it("只查当前会话，返回 messageId/role/content/createdAt", async () => {
    mockFindConversation.mockResolvedValue({ id: "c1" } as never);
    mockQuery.mockResolvedValue([
      {
        id: "m1",
        role: "user",
        content: "RAG Top-20 和 Top-5",
        parts: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ] as never);

    const result = await searchConversationHistory({
      userId: "u1",
      conversationId: "c1",
      query: "Top-20",
    });

    expect(result.count).toBe(1);
    expect(result.results[0]).toEqual({
      messageId: "m1",
      role: "user",
      content: "RAG Top-20 和 Top-5",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const [, conversationId, pattern] = mockQuery.mock.calls[0];
    expect(conversationId).toBe("c1");
    expect(String(pattern)).toContain("Top-20");
  });

  it("limit 最大 5", async () => {
    mockFindConversation.mockResolvedValue({ id: "c1" } as never);
    mockQuery.mockResolvedValue([] as never);
    await searchConversationHistory({
      userId: "u1",
      conversationId: "c1",
      query: "React",
      limit: 100,
    });
    const args = mockQuery.mock.calls[0];
    expect(args[3]).toBe(5);
  });

  it("无结果时明确返回空结果", async () => {
    mockFindConversation.mockResolvedValue({ id: "c1" } as never);
    mockQuery.mockResolvedValue([] as never);
    const result = await searchConversationHistory({
      userId: "u1",
      conversationId: "c1",
      query: "不存在",
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.message).toContain("没有找到");
  });
});
