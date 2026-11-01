/* ============================================================
 * Context / AgentState / Rolling Summary 端到端验证
 *
 * 会创建临时用户，结束后级联清理。
 * 覆盖：
 *   ① AgentState 懒初始化与更新
 *   ② 超过 20 条消息触发滚动摘要，原始消息不删除
 *   ③ Context Builder 的顺序：摘要 → 最近消息 → 当前消息 → 状态栏
 *   ④ rawParts 能重建 tool-call/tool-result 配对
 *   ⑤ searchConversationHistory 能找到已压缩的原文
 *   ⑥ 计划/文档 Scene Context
 *   ⑦ 真实模型接受 allowSystemInMessages + 末尾状态栏
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
  const { getOrCreateAgentState, updateAgentStateWithRetry } = await import(
    "../src/lib/context/agent-state"
  );
  const { maybeCompressConversation } = await import(
    "../src/lib/context/summarizer"
  );
  const { buildConversationContext } = await import(
    "../src/lib/context/builder"
  );
  const { searchConversationHistory } = await import(
    "../src/lib/context/history-search"
  );
  const { loadSceneContext } = await import("../src/lib/context/scene");
  const { streamTextWithFallback } = await import("../src/lib/model-pool");

  const email = `context-verify-${Date.now()}@example.test`;
  const user = await prisma.user.create({
    data: { name: "Context Verify", email },
    select: { id: true },
  });

  try {
    const conversation = await prisma.conversation.create({
      data: { userId: user.id, title: "context verify", surface: "agent" },
      select: { id: true, surface: true, refId: true },
    });

    // 25 条历史：其中一条包含可检索的参数，一条包含完整 tool part
    const base = Date.now() - 60 * 60_000;
    for (let i = 0; i < 25; i++) {
      const isUser = i % 2 === 0;
      await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: isUser ? "user" : "assistant",
          content:
            i === 0
              ? "之前确定的 RAG 参数是 Top-20 召回、Top-5 精排。"
              : `历史消息-${i}：这是第 ${i} 条对话。`,
          rawParts:
            !isUser && i === 5
              ? [
                  { type: "text", text: "我查一下今天的任务。" },
                  {
                    type: "tool-getTodayTasks",
                    toolCallId: "call-1",
                    state: "output-available",
                    input: {},
                    output: { count: 3 },
                  },
                ]
              : undefined,
          createdAt: new Date(base + i * 60_000),
        },
      });
    }

    // ① AgentState
    const initial = await getOrCreateAgentState(conversation.id);
    check("AgentState 懒初始化", initial.summary === "" && initial.version === 0);
    const updated = await updateAgentStateWithRetry(conversation.id, {
      workingMemory: [
        { content: "保留原有文档结构", importance: "high" },
        { content: "不要删除已确认内容", importance: "medium" },
      ],
      todoList: [
        { id: "t1", content: "分析原文", status: "completed" },
        { id: "t2", content: "调整学习阶段", status: "in_progress" },
      ],
    });
    check(
      "AgentState 更新 workingMemory/todoList",
      updated.workingMemory.length === 2 && updated.todoList.length === 2
    );

    // ② 滚动摘要
    const beforeCount = await prisma.conversationMessage.count({
      where: { conversationId: conversation.id },
    });
    const afterCompress = await maybeCompressConversation({
      conversationId: conversation.id,
      userId: user.id,
    });
    const afterCount = await prisma.conversationMessage.count({
      where: { conversationId: conversation.id },
    });
    check(
      "超过窗口后生成了摘要",
      afterCompress.summary.length > 0,
      `${afterCompress.summary.length} 字`
    );
    check(
      "压缩边界已推进",
      Boolean(afterCompress.compressedThroughMessageId),
      afterCompress.compressedThroughMessageId ?? "null"
    );
    check("原始消息没有被删除", beforeCount === afterCount, `${afterCount} 条`);

    // ③ Context Builder
    const current = await prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: "我们继续刚才的话题。",
      },
      select: { id: true },
    });

    const context = await buildConversationContext({
      userId: user.id,
      conversation: {
        id: conversation.id,
        surface: "agent",
        refId: null,
      },
      currentUserMessageId: current.id,
      currentUserText: "我们继续刚才的话题。",
      userName: "Verifier",
    });

    check("System 非空", context.system.length > 0);
    check(
      "摘要以 system 消息放在历史之前",
      context.messages[0]?.role === "system" &&
        JSON.stringify(context.messages[0].content).includes("conversation_summary")
    );
    check(
      "当前用户消息在上下文里",
      context.messages.some(
        (m) =>
          m.role === "user" &&
          JSON.stringify(m.content).includes("我们继续刚才的话题")
      )
    );
    check(
      "状态栏在最后且是 system",
      context.messages.at(-1)?.role === "system" &&
        JSON.stringify(context.messages.at(-1)?.content).includes(
          "保留原有文档结构"
        )
    );
    check(
      "tool-call/tool-result 被保留（history 转换未退化）",
      context.messages.some(
        (m) =>
          m.role === "assistant" &&
          JSON.stringify(m.content).includes("getTodayTasks")
      )
    );
    check(
      "最近消息数不超过窗口",
      context.recentCount <= 20,
      `${context.recentCount} 条`
    );

    // ④ 历史原文回溯
    const history = await searchConversationHistory({
      userId: user.id,
      conversationId: conversation.id,
      query: "Top-20",
    });
    check("历史检索能找到已压缩的原文", history.count > 0, `${history.count} 条`);
    const otherUser = await prisma.user.create({
      data: { name: "Other", email: `context-other-${Date.now()}@example.test` },
      select: { id: true },
    });
    try {
      const denied = await searchConversationHistory({
        userId: otherUser.id,
        conversationId: conversation.id,
        query: "Top-20",
      });
      check("跨用户历史检索被拒绝", denied.success === false);
    } finally {
      await prisma.user.delete({ where: { id: otherUser.id } }).catch(() => {});
    }

    // ⑤ Scene Context
    const plan = await prisma.plan.create({
      data: {
        userId: user.id,
        name: "验证计划",
        goal: "验证场景上下文",
        document: "# 验证计划正文",
      },
      select: { id: true },
    });
    const planScene = await loadSceneContext({
      userId: user.id,
      surface: "plan",
      refId: plan.id,
    });
    check("计划 Scene Context 加载正文", planScene.prompt.includes("# 验证计划正文"));

    const doc = await prisma.document.create({
      data: { userId: user.id, title: "验证文档", content: "# 验证文档正文" },
      select: { id: true },
    });
    const docScene = await loadSceneContext({
      userId: user.id,
      surface: "doc",
      refId: doc.id,
    });
    check("文档 Scene Context 加载正文", docScene.prompt.includes("# 验证文档正文"));

    // ⑥ 真实模型接受 system 消息与末尾状态栏
    try {
      const { stream } = await streamTextWithFallback("low", (_entry, model) => ({
        model,
        system: context.system,
        messages: context.messages,
        allowSystemInMessages: true,
      }));
      const reader = stream.getReader();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "error") throw value.error;
        if (value.type === "text-delta") text += value.text;
      }
      check("真实模型接受 allowSystemInMessages", text.length > 0, text.slice(0, 40));
    } catch (error) {
      check(
        "真实模型接受 allowSystemInMessages",
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch((error) => {
      console.error("[verify-context] 清理临时用户失败:", error);
    });
    await prisma.$disconnect();
  }

  console.log(
    `\n${fail === 0 ? "✅ 上下文链路通过" : "❌ 有失败项"} — ${pass} passed, ${fail} failed`
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("❌ 上下文验证异常:", error);
  process.exit(1);
});
