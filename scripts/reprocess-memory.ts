/* ============================================================
 * 补跑某条助手回复的记忆抽取
 *
 * 用途：门控规则调整后，把之前漏掉的消息重新走一遍
 *       scheduleExtraction → 候选 → LLM → Manager。
 *
 * 用法:
 *   npx tsx scripts/reprocess-memory.ts <assistantMessageId>
 * ============================================================ */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const TERMINAL = ["done", "noop", "failed", "skipped"];

async function main() {
  const messageId = process.argv[2];
  if (!messageId) {
    console.error("用法: npx tsx scripts/reprocess-memory.ts <assistantMessageId>");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");
  const { scheduleExtraction } = await import("../src/lib/memory/extraction");

  const assistant = await prisma.conversationMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      role: true,
      createdAt: true,
      conversationId: true,
      conversation: { select: { userId: true } },
    },
  });

  if (!assistant) {
    console.error(`消息不存在: ${messageId}`);
    process.exit(1);
  }
  if (assistant.role !== "assistant") {
    console.error(`该消息不是助手回复（role=${assistant.role}）`);
    process.exit(1);
  }

  const userMessage = await prisma.conversationMessage.findFirst({
    where: {
      conversationId: assistant.conversationId,
      role: "user",
      createdAt: { lt: assistant.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { content: true },
  });

  if (!userMessage) {
    console.error("找不到对应的用户消息");
    process.exit(1);
  }

  console.log(`用户消息: ${userMessage.content}`);
  const gate = await scheduleExtraction({
    userId: assistant.conversation.userId,
    conversationId: assistant.conversationId,
    messageId: assistant.id,
    userMessage: userMessage.content,
  });
  console.log(`门控: shouldExtract=${gate.shouldExtract}, reason=${gate.reason}`);

  if (!gate.shouldExtract) {
    await prisma.$disconnect();
    return;
  }

  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const candidate = await prisma.memoryCandidate.findUnique({
      where: { messageId: assistant.id },
    });
    if (candidate && TERMINAL.includes(candidate.status)) {
      console.log(`\n候选状态: ${candidate.status}`);
      if (candidate.error) console.log(`错误: ${candidate.error}`);
      if (candidate.rawOutput) {
        console.log(`模型输出: ${JSON.stringify(candidate.rawOutput)}`);
      }
      if (candidate.operations) {
        console.log(`校验后操作: ${JSON.stringify(candidate.operations)}`);
      }
      const memories = await prisma.memory.findMany({
        where: { userId: assistant.conversation.userId, status: "active" },
        orderBy: { updatedAt: "desc" },
        select: { kind: true, content: true, updatedAt: true },
        take: 5,
      });
      console.log("\n最近 active 记忆:");
      for (const memory of memories) {
        console.log(`  - [${memory.kind}] ${memory.content}`);
      }
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
