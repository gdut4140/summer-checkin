import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ChatInterface } from "@/components/ai/chat-interface";
import type { ChatMessage } from "@/types";

export default async function AIPage() {
  const user = await requireAuth();

  const history = await prisma.aIHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const initialMessages: ChatMessage[] = history.flatMap((h) => [
    {
      id: `${h.id}-user`,
      role: "user" as const,
      content: h.message,
      createdAt: h.createdAt,
    },
    {
      id: `${h.id}-ai`,
      role: "assistant" as const,
      content: h.response,
      createdAt: h.createdAt,
    },
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          AI 学习助手
        </h1>
        <p className="text-muted-foreground mt-1">
          有问题随时问，AI 帮你总结学习内容、制定计划、给出建议。
        </p>
      </div>

      <ChatInterface initialMessages={initialMessages} />
    </div>
  );
}
