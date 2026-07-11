import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ChatInterface } from "@/components/ai/chat-interface";
import type { ChatMessage } from "@/types";

export default async function AIPage() {
  const user = await requireAuth();

  // 获取对话列表
  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  // 自动选择最近更新的对话
  const activeConversation = conversations[0] ?? null;

  // 加载活跃对话的消息
  let activeMessages: ChatMessage[] = [];
  if (activeConversation) {
    const fullMessages = await prisma.conversationMessage.findMany({
      where: { conversationId: activeConversation.id },
      orderBy: { createdAt: "asc" },
    });
    activeMessages = fullMessages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  // 序列化对话列表数据给客户端组件
  const serializedConversations = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt.toISOString(),
    messages: c.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          AI 学习助手
        </h1>
        <p className="text-muted-foreground mt-1">
          有问题随时问，AI 帮你总结学习内容、制定计划、给出建议。
        </p>
      </div>

      <ChatInterface
        initialMessages={activeMessages}
        conversations={serializedConversations}
        activeConversationId={activeConversation?.id ?? null}
      />
    </div>
  );
}
