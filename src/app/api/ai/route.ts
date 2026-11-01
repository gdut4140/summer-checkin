// ============================================================
// Day 7 新增：
// ① isStepCount       — 控制多步调用，Tool Calling 需要 ≥2 步
// ② createStudyTools  — 工厂函数，为当前用户创建学习助手工具
// ③ tools             — streamText 的 tools 参数，让 LLM 调用项目功能
//
// Day 13 新增：长期记忆
// ④ 注入记忆          — streamText 前构建 memory_context 拼入 system prompt
// ⑤ 抽取记忆          — onEnd 中排入候选任务，异步抽取后由 Manager 写库
//
// Day 16 新增：RAG 知识库
// ⑥ RAG 工具          — searchKnowledgeBase 搜索知识库文档
// ⑦ RAG 注入          — 主动检索知识库，结果拼入 system prompt
//
// Day 22 新增：Agent Workflow
// ⑧ Agent 工具        — breakdownPlanTasks, getPlanTasks, updateTaskStatus, getTodayTasks
// ⑨ 增至 10 步        — Agent 工作流需要更多 LLM 步骤
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma-generated/client";
import { getAuthUser } from "@/lib/auth-utils";
import { getDeepThinkOptions, generateChatTitle } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";
import {
  createTextStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  toTextStream,
  toUIMessageStream,
} from "ai";
import { streamTextWithFallback, isQuotaError, isTransientNetworkError } from "@/lib/model-pool";
import { assertInteractiveUsageAllowed, UsageLimitError, ENERGY_DOWN_MESSAGE } from "@/lib/usage";
import { createStudyTools, createRAGTool, createAgentTools, createTodoTools } from "@/lib/tools";
import { createStudioTools } from "@/lib/tools/studio-tools";
import { pickTools, surfaceOf, AI_SURFACES, type AiSurface } from "@/lib/tools/router";
import {
  messageText,
  toViewParts,
  sanitizeRawParts,
  buildRawPartsFromSteps,
  type ChatUIMessage,
  type ViewPart,
} from "@/lib/ai/parts";
import { buildConversationContext } from "@/lib/context/builder";
import { createContextTools } from "@/lib/tools/context-tools";
import { scheduleExtraction } from "@/lib/memory/extraction";
import { readableAIError } from "@/lib/ai-error";

/**
 * 传输协议。
 *
 * - `ui`   AI SDK 的 UI Message Stream：助手消息是一组 part（text / tool），
 *          工具调用才有信道抵达浏览器。智能体页用它。
 * - `text` 纯文本流（历史行为）。studio 面板尚未迁移，暂时还走这条。
 *
 * 两种协议**只差三处**：请求里 messages 的形状、助手消息落库的时机、
 * 响应的编码方式。认证 / 限额 / 建会话 / 记忆 / 提示词 / 工具白名单 / 模型池
 * 全部共用。studio 迁完之后 `text` 分支连同这个类型一起删掉即可。
 */
type ChatProtocol = "ui" | "text";


/**
 * Tool Calling 循环的步数上限。
 *
 * ⚠️ 这是「防跑飞」的保险丝，不是编排策略：模型从十几个工具里选错、
 * 拿到结果再自我纠正，最多烧这么多步。烧完了 AI SDK 不给任何标记
 * （finish 事件复用最后一步的 finishReason，见 ai@7 的 stopWhen 实现），
 * 所以下面 onEnd 里显式判定并告警，否则「正常回答」和「被砍断的回答」
 * 在日志里长得一模一样。
 */
const MAX_STEPS = 10;

export async function POST(request: NextRequest) {
  // 协议在解析 body 时才确定。提前声明是为了**外层 catch 也能按对的协议回错**：
  // 每日限额早检发生在解析 body 之前，那时拿不到 protocol，只能先用默认值兜着，
  // 等 body 解析出来再覆盖。回错用错协议的表现是 useChat 解析不了 text/plain，
  // 用户看到通用报错而不是「没精力了」。
  let protocol: ChatProtocol = "text";
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    protocol = body.protocol === "ui" ? "ui" : "text";

    // 交互式面：每日限额早检（超限抛 UsageLimitError，由外层 catch 按协议返回友好提示；
    // 不建会话不写库）。放在 body 解析之后，是为了错误响应能走对的协议。
    await assertInteractiveUsageAllowed(user.id);

    const rawMessages = body.messages as unknown[] | undefined;
    const conversationId = body.conversationId as string | undefined;
    const deepThink = body.deepThink as boolean | undefined;
    const studioContext = body.studioContext as
      | { kind?: "plan" | "doc"; refId?: string; document?: string }
      | undefined;

    if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
      return NextResponse.json(
        { error: "Messages are required" },
        { status: 400 }
      );
    }

    // 两种协议在服务端统一成 UIMessage，下游只认一种形状。
    // 文本协议（studio 面板）的 { role, content } 就地补成单个 text part。
    const uiMessages: ChatUIMessage[] =
      protocol === "ui"
        ? (rawMessages as ChatUIMessage[])
        : (rawMessages as { role: "user" | "assistant"; content: string }[])
            .filter((m) => typeof m?.content === "string" && m.content.trim() !== "")
            .map((m, i) => ({
              id: `legacy-${i}`,
              role: m.role,
              parts: [{ type: "text" as const, text: m.content }],
            }));

    // 最后一条消息 = 本次要处理的用户消息。两种协议都从 parts 里取纯文本，
    // 于是标题、落库、记忆提取三处都只有这一种读法。
    const lastUserMsg = uiMessages[uiMessages.length - 1];
    const lastUserText = messageText(lastUserMsg);

    // 会话归属：已有会话必须属于当前用户；新会话按 studioContext 创建。
    // 历史由服务端从 DB 加载，客户端只负责发当前这一条。
    let activeConversation: {
      id: string;
      surface: string;
      refId: string | null;
    };
    if (conversationId) {
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: user.id },
        select: { id: true, surface: true, refId: true },
      });
      if (!existing) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
      activeConversation = existing;
    } else {
      const title = await generateChatTitle(lastUserText, user.id);
      activeConversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          title,
          surface: surfaceOf(studioContext),
          refId: studioContext?.refId ?? null,
        },
        select: { id: true, surface: true, refId: true },
      });
    }

    const activeConversationId = activeConversation.id;
    const surface: AiSurface = (AI_SURFACES as readonly string[]).includes(
      activeConversation.surface
    )
      ? (activeConversation.surface as AiSurface)
      : "agent";

    // 保存当前用户消息（只保存最后一条；历史由服务端从 DB 加载）
    const savedUser = await prisma.conversationMessage.create({
      data: {
        conversationId: activeConversationId,
        role: "user",
        content: lastUserText,
      },
      select: { id: true },
    });

    // 统一 Context Builder：
    //   滚动摘要 → 最近原始消息 → 当前用户消息 → 状态栏
    //   System Prompt + Scene Context + UserMemory
    const context = await buildConversationContext({
      userId: user.id,
      conversation: {
        id: activeConversationId,
        surface,
        refId: activeConversation.refId,
      },
      currentUserMessageId: savedUser.id,
      currentUserText: lastUserText,
      userName: user.name,
      clientDocument: studioContext?.document ?? null,
    });

    const modelMessages = context.messages;
    const fullSystem = context.system;
    const conversationHint = context.conversationHint;
    const memoryPrompt = context.memoryPrompt;

    // ============================================================
    // Day 16 知识库检索：不再主动注入
    // 交给 AI 通过 searchKnowledgeBase 工具自行判断是否检索，
    // 避免寒暄/闲聊消息也白白做向量检索拖慢回复
    // ============================================================

    // ============================================================
    // 工作台工具：只依赖当前会话的 surface + refId。
    // 文档正文由 Context Builder 的 Scene Context 从数据库加载，不再信任
    // 客户端传来的整篇文档。
    // ============================================================
    let studioTools = {};
    if ((surface === "plan" || surface === "doc") && activeConversation.refId) {
      studioTools = createStudioTools(user.id, {
        kind: surface,
        id: activeConversation.refId,
      });
    }

    // ============================================================
    // Day 3 核心：streamText 替代 getAIResponse
    // ① streamText() 返回一个流式结果，AI 的每个 token 实时产出
    // ② onEnd 回调 — 流+工具全部完成后触发，保存 AI 回复到 DB
    // ③ toTextStreamResponse() — 将流包装成 HTTP Response 返回给前端
    //
    // Day 7 新增：Tool Calling — 让 AI 操作项目已有功能
    // ④ tools      — createStudyTools(userId) 为当前用户创建工具
    //                 AI 可以：创建计划、查询计划、查询打卡记录
    // ⑤ stopWhen   — isStepCount(10) 允许多步调用：
    //                 Step 1: LLM 判断 → 调用 tool → execute 写入 DB
    //                 Step 2: LLM 基于 tool 结果 → 生成自然语言回复
    //                 （默认 isStepCount(1) 无法完成 Tool Calling 闭环；
    //                   Day 7 起为 5，Day 22 因 Agent Workflow 增至 10）
    // ============================================================
    // 走模型池 HIGH 档（agent/文档），免费额度耗尽自动降级到下一个模型
    const { stream } = await streamTextWithFallback("high", (_entry, model) => ({
      model,
      system: fullSystem,
      // 摘要与状态栏是独立的 system 消息，不是用户输入；需要显式允许
      // messages 中出现 system role。
      allowSystemInMessages: true,
      providerOptions: getDeepThinkOptions(deepThink ?? false),
      messages: modelMessages,
      // Day 7: 学习工具 + Day 16: RAG 知识库工具 + Day 22: Agent Workflow 工具
      // Phase 1: Coach 工具（学习分析 + 计划调整）
      // 工具集按场景裁剪（白名单见 lib/tools/router.ts）。
      // 工作台不持有「改非当前对象」的写工具——文档编辑器里不该能顺手删掉待办。
      //
      // 先建全部候选再过滤：conversation/memories 只被 createPlan 用到，而 createPlan
      // 只在智能体场景入选，所以工作台多建一次没有副作用（纯对象构造，不碰数据库）。
      tools: pickTools(
        {
          ...createStudyTools(user.id, {
            conversation: conversationHint,
            memories: memoryPrompt,
          }),
          ...createRAGTool(user.id),
          ...createContextTools(user.id, activeConversationId),
          ...createAgentTools(user.id),
          ...createTodoTools(user.id),
          ...studioTools,
        },
        surface
      ),
      // Day 7: 允许多步 — 默认 1 步不够 Tool Calling 闭环
      // Day 22: 增至 10 步 — Agent Workflow 需要更多步骤（规划→拆分→检查）
      stopWhen: isStepCount(MAX_STEPS),
      // Day 7 调试：观察每一步的执行情况。
      // 带上**工具名**而不只是数量——这是判断「模型有没有选错工具」的唯一原始数据。
      // 只打数量的话，拿不到「同一轮里调了两个以上同簇工具」这类信号。
      onStepEnd: (step) => {
        const called = (step.toolCalls ?? []).map((c) => c.toolName).join(",");
        console.log(
          `[AI] Step | surface=${surface} | finishReason=${step.finishReason} | ` +
          `text=${step.text?.length ?? 0}chars | ` +
          `toolCalls=[${called}] | ` +
          `toolResults=${step.toolResults?.length ?? 0}`
        );
      },
      // Day 7 修复：onEnd 替代废弃的 onFinish
      // ① onEnd 确保所有 tool execution 完成后才回调
      // ② 拼接所有步的文本（不能只用 text，见下方说明）
      // ③ try-catch 避免单个 DB 失败导致静默中断
      onEnd: async ({ text, steps, finalStep }) => {
        // ⚠️ 步数耗尽检测。AI SDK 不提供「因 stopWhen 而停」的标记
        //    （finish 事件直接复用最后一步的 finishReason），只能自己判：
        //    跑满上限 **且** 最后一步仍在请求工具调用才算跑飞。
        //    只判步数会把「模型恰好在第 10 步自然收尾」误报成故障。
        //    只做日志——用户已在流里看到原文，在 onEnd 里往 finalText 追加会
        //    造成 DB 与 UI 不一致（正是下面那段注释在防的事）。
        if (steps.length >= MAX_STEPS && finalStep?.finishReason === "tool-calls") {
          console.warn(
            `[AI] ⚠️ 步数耗尽(${MAX_STEPS}) | conversation=${activeConversationId} | ` +
              `最后一步仍在请求工具调用，回答可能被截断`
          );
        }

        // UI 协议的落库在下面 toUIMessageStream 的 onEnd 里 —— 只有那里拿得到
        // responseMessage.parts。这里是文本协议（studio 面板）的唯一落库点。
        // （步数告警不搬走：那边给不了 steps/finalStep。）
        if (protocol !== "text" || !activeConversationId) return;

        // ⚠️ onEnd 拿到的 text 只是「最后一步」的文本（SDK 类型注释：
        //    "The text that was generated in the final step"），
        //    而 toTextStream 推给前端的是**所有步**的文本增量。
        //    只存最后一步会造成 UI 与 DB 不一致：模型在中间步说的话
        //    （如"我先查一下你的学习记录"）前端看得到、刷新后却没了。
        //    多步 Tool Calling 时必现。这里显式拼接所有步，与前端
        //    rainforest-explorer 的 accumulated 严格对齐。
        const finalText = steps?.length
          ? steps.map((step) => step.text ?? "").join("")
          : text ?? "";

        await saveAssistantMessage({
          conversationId: activeConversationId,
          content: finalText,
          parts: null,
          rawParts: buildRawPartsFromSteps(steps ?? []),
          userText: lastUserText,
          userId: user.id,
        });
      },
    }), {
      userId: user.id,
      // 记账口径：文档与计划合并为 studio（与 conversation.surface 的三值口径不同，
      // 那边要区分到具体文档/计划，这边只需按界面统计；历史数据也按这个口径落库）
      surface: surface === "agent" ? "agent" : "studio",
      enforce: true,
    });

    const streamHeaders = {
      "X-Conversation-Id": activeConversationId,
      "Access-Control-Expose-Headers": "X-Conversation-Id",
    };

    // 文本协议（studio 面板）：维持历史行为，把全量 part 流投影回纯文本
    if (protocol === "text") {
      return createTextStreamResponse({
        stream: toTextStream({ stream }),
        headers: streamHeaders,
      });
    }

    // UI 协议：全量 part 流 → UI message 流，工具调用随之抵达浏览器。
    //
    // onEnd 在所有步跑完之后回调，responseMessage.parts 就是这条助手消息的完整
    // 形状（text + tool），正是要落库的东西。比文本协议手工拼
    // steps.map(s => s.text) 更准——那个老写法只是在绕开「onEnd 的 text 只是
    // 最后一步」这个 SDK 行为，现在有了 parts 就不需要绕了。
    //
    // originalMessages 让 SDK 给响应消息定一个 id（客户端历史末尾总是 user 消息，
    // 所以 isContinuation 为 false）。
    return createUIMessageStreamResponse({
      // 注意泛型顺序是 <TOOLS, UI_MESSAGE>，第一个不是消息类型——这里靠
      // originalMessages 把 UI_MESSAGE 推断成 ChatUIMessage，不显式传。
      //
      // ⚠️ 不要在这里挂 messageMetadata。ai@7 的 .d.ts 说它「Called on start and
      // finish events」，但 index.js:7477-7500 的实现是**对每个 part 都调一次**、
      // 并额外 enqueue 一个 message-metadata chunk（start/finish 除外）。挂上去
      // 等于给线上每个 chunk 都加一份元数据，chunk 数近乎翻倍。客户端的时间戳
      // 因此改在本地打（见 rainforest-explorer 的 stamp 逻辑）。
      stream: toUIMessageStream({
        stream,
        originalMessages: uiMessages,
        // 不传 onError 时 AI SDK 会统一返回 "An error occurred."，真实原因
        // （限流 / 模型调了不存在的工具 / 网络）全被吞掉。这里至少把它
        // 变成一句能看懂的提示，并把原始错误留在服务端日志。
        onError: (error) => {
          console.error("[AI] stream error:", error);
          const raw = error instanceof Error ? error.message : String(error);

          if (isQuotaError(error)) {
            return "模型暂时限流了，请稍后重试。";
          }
          if (/unavailable tool|NoSuchTool|tool.*not found/i.test(raw)) {
            return "当前没有可用的记忆修改工具。请直接把要记住或修改的内容告诉我，系统会在回复后自动处理。";
          }
          return readableAIError(error, "AI 回复失败");
        },
        onEnd: async ({ responseMessage, isAborted }) => {
          if (isAborted) {
            console.warn(
              `[AI] 客户端中断，落库已生成的部分 | conversation=${activeConversationId}`
            );
          }
          if (!activeConversationId) return;
          await saveAssistantMessage({
            conversationId: activeConversationId,
            content: messageText(responseMessage),
            parts: toViewParts(responseMessage.parts),
            rawParts: sanitizeRawParts(responseMessage.parts),
            userText: lastUserText,
            userId: user.id,
          });
        },
      }),
      headers: streamHeaders,
    });
  } catch (error) {
    // 每日精力用完（UsageLimitError）或余额/配额不足（isQuotaError）：
    // 按协议返回「没精力了」。UI 协议下不能用 text/plain——useChat 解析不了，
    // 用户会看到通用报错而不是这条文案。
    if (error instanceof UsageLimitError || isQuotaError(error)) {
      return limitStreamResponse(ENERGY_DOWN_MESSAGE, protocol);
    }
    // 所有模型都连不上时不要伪装成「没精力了」，也不要给空 body 的 500
    if (isTransientNetworkError(error)) {
      return NextResponse.json(
        { error: "AI 服务暂时不可用，请稍后重试" },
        { status: 503 }
      );
    }
    console.error("AI API error:", error);
    return NextResponse.json(
      { error: "Failed to get AI response" },
      { status: 500 }
    );
  }
}

/**
 * 落一条助手消息。
 *
 * content 与 parts 一起写：content 是标题生成与 conversationHint 的读取契约
 * （它们按字符串读它），parts 是界面渲染工具卡片用的结构化形状。
 * 两者从同一份 parts 派生，不会漂移。
 */
async function saveAssistantMessage({
  conversationId,
  content,
  parts,
  rawParts,
  userText,
  userId,
}: {
  conversationId: string;
  content: string;
  /** null = 文本协议，没有结构化片段可存 */
  parts: ViewPart[] | null;
  /** AI SDK 原始 parts，用于后续轮次重建 tool-call/tool-result */
  rawParts: unknown[] | null;
  userText: string;
  userId: string;
}) {
  if (!content && !parts?.length && !rawParts?.length) {
    console.warn("[AI] onEnd: 没有可保存的内容，跳过");
    return;
  }

  console.log(
    `[AI] onEnd: 保存 AI 回复 (${content.length} 字符, ${parts?.length ?? 0} parts, ${rawParts?.length ?? 0} rawParts) → conversation:${conversationId}`
  );

  try {
    const saved = await prisma.conversationMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content,
        // undefined = 不写这一列（保持 NULL），而不是写 JSON null
        parts: parts ?? undefined,
        rawParts: rawParts
          ? (rawParts as unknown as Prisma.InputJsonValue)
          : undefined,
      },
      select: { id: true },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    console.log("[AI] onEnd: 保存成功 ✅");

    // ============================================================
    // Memory v2：把抽取排成候选任务（messageId 唯一，天然幂等）
    //
    // 门控 + 入队是轻量的；真正的 LLM 抽取在 scheduleExtraction 内部
    // fire-and-forget，失败/重启由每日任务继续处理。
    // ============================================================
    void scheduleExtraction({
      userId,
      conversationId,
      messageId: saved.id,
      userMessage: userText,
    }).catch((err) => console.error("[Memory] 排入抽取失败:", err));
  } catch (err) {
    console.error("[AI] onEnd: 数据库写入失败", err);
  }
}

/** 雨宝没精力时的友好提示，按协议包装 */
function limitStreamResponse(message: string, protocol: ChatProtocol) {
  if (protocol === "text") {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(message);
        controller.close();
      },
    });
    return createTextStreamResponse({ stream });
  }

  // UI 协议：手工拼一条只含一段文本的 UI message 流。
  // chunk 序列抄自 ai@7 的 transformTextToUiMessageStream（dist/index.js:16908）。
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: "text-1" });
      writer.write({ type: "text-delta", id: "text-1", delta: message });
      writer.write({ type: "text-end", id: "text-1" });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
