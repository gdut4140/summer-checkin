import { prisma } from "./db";

const messageInclude = {
  user: { select: { name: true, image: true } },
  replyTo: { include: { user: { select: { name: true } } } },
} as const;

export interface UserMessageInput {
  userId: string;
  clientId: string;
  content: string;
  replyToId: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function findMessageByIdempotencyKey(userId: string, clientId: string) {
  return prisma.chatMessage.findUnique({
    where: { userId_clientId: { userId, clientId } },
    include: messageInclude,
  });
}

/**
 * 唯一约束负责裁决并发请求；P2002 表示另一个相同操作已经先落库。
 * 不能只依赖调用前查询，因为两个 sidecar/连接可能同时查到不存在。
 */
export async function createMessageIdempotently(input: UserMessageInput) {
  try {
    const message = await prisma.chatMessage.create({
      data: {
        userId: input.userId,
        clientId: input.clientId,
        role: "user",
        content: input.content,
        replyToId: input.replyToId,
      },
      include: messageInclude,
    });
    return { status: "created" as const, message };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const message = await findMessageByIdempotencyKey(input.userId, input.clientId);
    // 若唯一冲突并非来自目标键，不能把真实数据库错误伪装成一次成功重试。
    if (!message) throw error;
    return { status: "duplicate" as const, message };
  }
}

export function hasSameMessagePayload(
  message: { content: string; replyToId: string | null },
  input: Pick<UserMessageInput, "content" | "replyToId">
): boolean {
  return message.content === input.content && message.replyToId === input.replyToId;
}
