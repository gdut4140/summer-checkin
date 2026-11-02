import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({
  prisma: {
    chatMessage: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../server/db";
import {
  createMessageIdempotently,
  hasSameMessagePayload,
} from "../server/message-idempotency";

const mockCreate = vi.mocked(prisma.chatMessage.create);
const mockFindUnique = vi.mocked(prisma.chatMessage.findUnique);

const input = {
  userId: "user-1",
  clientId: "request-1",
  content: "hello",
  replyToId: null,
};

const stored = {
  id: "message-1",
  ...input,
  role: "user",
  aiRole: null,
  createdAt: new Date("2026-11-02T00:00:00.000Z"),
  user: { name: "Alice", image: null },
  replyTo: null,
};

function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

describe("WebSocket message idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("首次写入返回 created，并把 clientId 作为幂等键落库", async () => {
    mockCreate.mockResolvedValue(stored as never);

    await expect(createMessageIdempotently(input)).resolves.toEqual({
      status: "created",
      message: stored,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining(input) })
    );
  });

  it("并发重复写入撞 P2002 后读取原消息，不重复创建业务结果", async () => {
    mockCreate.mockRejectedValue(uniqueViolation());
    mockFindUnique.mockResolvedValue(stored as never);

    await expect(createMessageIdempotently(input)).resolves.toEqual({
      status: "duplicate",
      message: stored,
    });
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_clientId: { userId: "user-1", clientId: "request-1" } },
      })
    );
  });

  it("非唯一冲突原样抛出，不能误报成幂等命中", async () => {
    const error = new Error("database unavailable");
    mockCreate.mockRejectedValue(error);

    await expect(createMessageIdempotently(input)).rejects.toBe(error);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("同一幂等键只有载荷一致才算合法重试", () => {
    expect(hasSameMessagePayload(stored, input)).toBe(true);
    expect(hasSameMessagePayload(stored, { ...input, content: "changed" })).toBe(false);
  });
});
