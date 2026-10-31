/* ============================================================
 * Memory v2 端到端验证（会写库，用临时用户，结束后清理）
 *
 * 覆盖：
 *   ① 候选 → Manager 提交（含向量写入、部分唯一索引、advisory lock）
 *   ② ADD 后 UPDATE：旧记忆 superseded，新记忆带 supersedesId
 *   ③ MemoryEvent 有 add / supersede 记录
 *   ④ retrieveMemories 只返回 active，不返回 superseded
 *
 * 用法:
 *   npx tsx scripts/verify-memory.ts
 * ============================================================ */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { commitCandidate } = await import("../src/lib/memory/manager");
  const { retrieveMemories } = await import("../src/lib/memory/retrieval");

  const email = `memory-verify-${Date.now()}@example.test`;
  const user = await prisma.user.create({
    data: { name: "Memory Verify", email },
    select: { id: true },
  });

  try {
    const conversation = await prisma.conversation.create({
      data: { userId: user.id, title: "memory verify", surface: "agent" },
      select: { id: true },
    });

    const userMessage = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "我现在主要使用 React，已经用了两年。",
      },
      select: { id: true },
    });
    await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "了解，你的 React 经验比较扎实。",
      },
    });

    const firstAssistant = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "了解。",
      },
      select: { id: true },
    });

    // ---- ① ADD ----
    const addCandidate = await prisma.memoryCandidate.create({
      data: {
        userId: user.id,
        conversationId: conversation.id,
        messageId: firstAssistant.id,
        status: "ready",
        attempts: 1,
        operations: [
          {
            op: "ADD",
            kind: "skill",
            content: "主要使用 React，用了两年",
            normalizedKey: "skill:verify-react",
            importance: 0.7,
            confidence: 0.9,
            validFrom: null,
            validTo: null,
            evidence: "我现在主要使用 React",
            sourceType: "user_statement",
          },
        ] as never,
      },
      select: { id: true },
    });

    await commitCandidate(addCandidate.id);

    const afterAdd = await prisma.memory.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        content: true,
        status: true,
        supersedesId: true,
        embeddingModel: true,
      },
    });
    check("ADD 后只有一条 active", afterAdd.filter((m) => m.status === "active").length === 1);
    check(
      "ADD 写入了向量",
      Boolean(afterAdd[0]?.embeddingModel),
      afterAdd[0]?.embeddingModel ?? "null"
    );
    const candidateAfterAdd = await prisma.memoryCandidate.findUnique({
      where: { id: addCandidate.id },
      select: { status: true },
    });
    check("候选状态为 done", candidateAfterAdd?.status === "done");

    const firstId = afterAdd[0].id;

    // ---- ② UPDATE ----
    const secondAssistant = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "好的。",
      },
      select: { id: true },
    });
    const updateCandidate = await prisma.memoryCandidate.create({
      data: {
        userId: user.id,
        conversationId: conversation.id,
        messageId: secondAssistant.id,
        status: "ready",
        attempts: 1,
        operations: [
          {
            op: "UPDATE",
            targetId: firstId,
            kind: "skill",
            content: "主要使用 React，已经非常熟练",
            normalizedKey: "skill:verify-react",
            importance: 0.8,
            confidence: 0.95,
            validFrom: null,
            validTo: null,
            evidence: "我 React 非常熟练",
            sourceType: "user_correction",
          },
        ] as never,
      },
      select: { id: true },
    });

    await commitCandidate(updateCandidate.id);

    const afterUpdate = await prisma.memory.findMany({
      where: { userId: user.id },
      select: { id: true, content: true, status: true, supersedesId: true },
    });
    const oldMemory = afterUpdate.find((m) => m.id === firstId);
    const newMemory = afterUpdate.find((m) => m.status === "active");
    check("旧记忆变为 superseded", oldMemory?.status === "superseded");
    check(
      "新记忆指向旧 id",
      newMemory?.supersedesId === firstId,
      newMemory?.supersedesId ?? "null"
    );

    const eventActions = await prisma.memoryEvent.findMany({
      where: { userId: user.id },
      select: { action: true },
    });
    const actions = eventActions.map((e) => e.action);
    check("存在 add 事件", actions.includes("add"));
    check("存在 supersede 事件", actions.includes("supersede"));

    // ---- ④ 检索不返回 superseded ----
    const retrieved = await retrieveMemories({
      userId: user.id,
      surface: "agent",
      task: "chat",
      query: "React 熟练度怎么样",
    });
    check(
      "检索返回新记忆",
      retrieved.memories.some((m) => m.id === newMemory?.id)
    );
    check(
      "检索不返回被覆盖的旧记忆",
      !retrieved.memories.some((m) => m.id === firstId)
    );

    check(
      "用户消息存在（用于 evidence）",
      Boolean(userMessage.id)
    );
  } finally {
    // 级联删除 memory / memorycandidate / memoryevent / conversation
    await prisma.user.delete({ where: { id: user.id } }).catch((error) => {
      console.error("[verify-memory] 清理临时用户失败:", error);
    });
    await prisma.$disconnect();
  }

  console.log(
    `\n${fail === 0 ? "✅ 全部通过" : "❌ 有失败项"} — ${pass} passed, ${fail} failed`
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("❌ 验证脚本异常:", error);
  process.exit(1);
});
