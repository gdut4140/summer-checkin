/* ============================================================
 * Memory v2 全链路验证（真实模型 + 真实数据库，临时用户，结束后清理）
 *
 * 和 verify-memory.ts 的区别：
 *   verify-memory 手工构造 candidate，只验证 Manager；
 *   本脚本从 scheduleExtraction 开始，完整走：
 *     门控 → 候选入队 → LOW 档 LLM 抽取 → validation → Manager → 事件
 *     然后 buildMemoryContext / recallMemories 读回来。
 *
 * 用法:
 *   npx tsx scripts/verify-memory-e2e.ts
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

const TERMINAL = ["done", "noop", "failed", "skipped"];

async function waitForCandidate(
  prisma: Awaited<typeof import("../src/lib/prisma")>["prisma"],
  messageId: string,
  timeoutMs = 90_000
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const candidate = await prisma.memoryCandidate.findUnique({
      where: { messageId },
    });
    if (candidate && TERMINAL.includes(candidate.status)) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return prisma.memoryCandidate.findUnique({ where: { messageId } });
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { scheduleExtraction } = await import("../src/lib/memory/extraction");
  const { buildMemoryContext } = await import(
    "../src/lib/memory/context-builder"
  );
  const { recallMemories } = await import("../src/lib/tools/memory-tools");

  const email = `memory-e2e-${Date.now()}@example.test`;
  const user = await prisma.user.create({
    data: { name: "Memory E2E", email },
    select: { id: true },
  });

  try {
    const conversation = await prisma.conversation.create({
      data: { userId: user.id, title: "memory e2e", surface: "agent" },
      select: { id: true },
    });

    // ---- 第 1 轮：显式披露 → 抽取 ADD ----
    console.log("\n① 第 1 轮：用户说“我之前主要使用 Vue，已经用了两年”");
    const user1 = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "我之前主要使用 Vue，已经用了两年。",
      },
      select: { id: true },
    });
    const assistant1 = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "了解，Vue 用了两年。",
      },
      select: { id: true },
    });

    const gate1 = await scheduleExtraction({
      userId: user.id,
      conversationId: conversation.id,
      messageId: assistant1.id,
      userMessage: "我之前主要使用 Vue，已经用了两年。",
    });
    check(
      "门控命中（correction）",
      gate1.shouldExtract && gate1.reason === "correction",
      gate1.reason
    );

    const candidate1 = await waitForCandidate(prisma, assistant1.id);
    check(
      "候选处理完成",
      candidate1?.status === "done",
      `${candidate1?.status ?? "missing"}${candidate1?.error ? ` / ${candidate1.error}` : ""}`
    );

    const after1 = await prisma.memory.findMany({
      where: { userId: user.id, status: "active" },
      select: { id: true, kind: true, content: true },
    });
    check(
      "写入了 Vue 技能记忆",
      after1.some((m) => m.kind === "skill" && m.content.includes("Vue")),
      after1.map((m) => `[${m.kind}] ${m.content}`).join(" | ") || "(空)"
    );

    // ---- 第 2 轮：修正 → 抽取 UPDATE ----
    console.log("\n② 第 2 轮：用户说“我现在改成主要使用 React 了”");
    const user2 = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "我现在改成主要使用 React 了。",
      },
      select: { id: true },
    });
    const assistant2 = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "好的，后续按 React 来。",
      },
      select: { id: true },
    });

    const gate2 = await scheduleExtraction({
      userId: user.id,
      conversationId: conversation.id,
      messageId: assistant2.id,
      userMessage: "我现在改成主要使用 React 了。",
    });
    check(
      "门控命中（correction）",
      gate2.shouldExtract && gate2.reason === "correction",
      gate2.reason
    );

    const candidate2 = await waitForCandidate(prisma, assistant2.id);
    if (candidate2?.rawOutput) {
      console.log(`   rawOutput: ${JSON.stringify(candidate2.rawOutput)}`);
    }
    check(
      "候选处理完成",
      candidate2?.status === "done",
      `${candidate2?.status ?? "missing"}${candidate2?.error ? ` / ${candidate2.error}` : ""}`
    );

    const after2 = await prisma.memory.findMany({
      where: { userId: user.id },
      select: { id: true, status: true, kind: true, content: true, supersedesId: true },
    });
    const active2 = after2.filter((m) => m.status === "active");
    const superseded2 = after2.filter((m) => m.status === "superseded");
    check(
      "出现 React 的 active 记忆",
      active2.some((m) => m.content.includes("React")),
      active2.map((m) => m.content).join(" | ") || "(空)"
    );
    check("旧 Vue 记忆变为 superseded", superseded2.length >= 1);
    check(
      "新记忆带 supersedesId",
      active2.some((m) => Boolean(m.supersedesId))
    );

    // ---- 读链路：Context Builder ----
    console.log("\n③ 读链路：buildMemoryContext(query=React)");
    const context = await buildMemoryContext({
      userId: user.id,
      surface: "agent",
      task: "chat",
      query: "React 学得怎么样",
    });
    check("上下文非空", context.prompt.length > 0);
    check(
      "上下文包含 React",
      context.prompt.includes("React"),
      context.prompt.replace(/\n/g, " ")
    );
    check(
      "上下文不包含被覆盖的 Vue 旧状态",
      !/主要使用 Vue/.test(context.prompt)
    );
    check("记录了 injectedIds", context.injectedIds.length > 0);
    check(
      "token 在预算内",
      context.stats.tokens <= 600,
      `${context.stats.tokens} tokens`
    );

    // ---- 读链路：工具 ----
    console.log("\n④ 读链路：recallMemories(kinds=[skill])");
    const recalled = await recallMemories(user.id, {
      query: "React",
      kinds: ["skill"],
      limit: 5,
    });
    check("工具返回了记忆", recalled.count > 0, `${recalled.count} 条`);
    check(
      "工具返回的是 active 当前状态",
      recalled.memories.some((m) => m.content.includes("React"))
    );
    check(
      "工具返回带置信度/来源",
      recalled.memories.every(
        (m) => typeof m.confidence === "number" && typeof m.sourceType === "string"
      )
    );

    // ---- 第 3 轮：寒暄 → 不抽取 ----
    console.log("\n⑤ 第 3 轮：用户说“谢谢”");
    const assistant3 = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: "不客气。",
      },
      select: { id: true },
    });
    const gate3 = await scheduleExtraction({
      userId: user.id,
      conversationId: conversation.id,
      messageId: assistant3.id,
      userMessage: "谢谢",
    });
    check(
      "寒暄被门控拦下",
      !gate3.shouldExtract && gate3.reason === "too_short",
      gate3.reason
    );
    const candidate3 = await prisma.memoryCandidate.findUnique({
      where: { messageId: assistant3.id },
    });
    check("没有创建候选", candidate3 === null);

    // ---- 事件完整性 ----
    const events = await prisma.memoryEvent.findMany({
      where: { userId: user.id },
      select: { action: true },
    });
    const actions = events.map((e) => e.action);
    check("有 add 事件", actions.includes("add"));
    check("有 supersede 事件", actions.includes("supersede"));

    check("用户消息创建成功", Boolean(user1.id && user2.id));
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch((error) => {
      console.error("[verify-memory-e2e] 清理临时用户失败:", error);
    });
    await prisma.$disconnect();
  }

  console.log(
    `\n${fail === 0 ? "✅ 全链路通过" : "❌ 有失败项"} — ${pass} passed, ${fail} failed`
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("❌ 全链路验证异常:", error);
  process.exit(1);
});
