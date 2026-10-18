// ============================================================
// Day 7 新增：
// ① isStepCount       — 控制多步调用，Tool Calling 需要 ≥2 步
// ② createStudyTools  — 工厂函数，为当前用户创建学习助手工具
// ③ tools             — streamText 的 tools 参数，让 LLM 调用项目功能
//
// Day 13 新增：长期记忆
// ④ 注入记忆          — streamText 前查询 UserMemory 拼入 system prompt
// ⑤ 提取记忆          — onEnd 中 fire-and-forget 用 AI 提取新记忆
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
import { getAuthUser } from "@/lib/auth-utils";
import { getDeepThinkOptions, generateChatTitle, buildSystemPrompt } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";
import {
  createTextStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  isStepCount,
  toTextStream,
  toUIMessageStream,
} from "ai";
import { streamTextWithFallback, isQuotaError } from "@/lib/model-pool";
import { assertInteractiveUsageAllowed, UsageLimitError, ENERGY_DOWN_MESSAGE } from "@/lib/usage";
import { createStudyTools, createRAGTool, createAgentTools, createTodoTools } from "@/lib/tools";
import { createStudioTools } from "@/lib/tools/studio-tools";
import { pickTools, promptGroupsFor, surfaceOf } from "@/lib/tools/router";
import { messageText, toViewParts, type ChatUIMessage, type ViewPart } from "@/lib/ai/parts";
import {
  getRelevantMemories,
  formatMemoriesForPrompt,
  extractAndSaveMemories,
  touchMemories,
} from "@/lib/memory";

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

    // 来源界面 + 归属对象：智能体页 / 文档工作台 / 计划工作台三者严格分开。
    // studioContext.kind 本身就是 "doc" | "plan"，与 surface 取值一一对应；
    // refId 钉住具体文档或计划，工作台据此取回自己的历史（不再依赖 localStorage）。
    //
    // ⚠️ 必须在「新建会话」分支之外求值：工具集与系统提示词都要按它裁剪，
    // 而老会话的后续消息不带 conversationId 分支、也要拿到同一个 surface。
    const surface = surfaceOf(studioContext);

    // 最后一条消息 = 本次要处理的用户消息。两种协议都从 parts 里取纯文本，
    // 于是标题、落库、记忆提取三处都只有这一种读法。
    const lastUserMsg = uiMessages[uiMessages.length - 1];
    const lastUserText = messageText(lastUserMsg);

    // 如果没有 conversationId，自动创建一个新对话
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const title = await generateChatTitle(lastUserText, user.id);

      const conversation = await prisma.conversation.create({
        data: {
          userId: user.id,
          title,
          surface,
          refId: studioContext?.refId ?? null,
        },
      });
      activeConversationId = conversation.id;
    }

    // 保存用户消息
    await prisma.conversationMessage.create({
      data: {
        conversationId: activeConversationId,
        role: "user",
        content: lastUserText,
      },
    });

    // ============================================================
    // Day 12 新增：短期记忆 — 后端兜底截断
    // 只取最近 20 轮（40 条消息），超出部分被省略
    // （前端已做截断，后端再做一层保险）
    // ============================================================
    const MAX_CONTEXT_ROUNDS = 20;
    const MAX_CONTEXT_MESSAGES = MAX_CONTEXT_ROUNDS * 2;
    const truncatedUiMessages =
      uiMessages.length > MAX_CONTEXT_MESSAGES
        ? uiMessages.slice(-MAX_CONTEXT_MESSAGES)
        : uiMessages;

    if (uiMessages.length > MAX_CONTEXT_MESSAGES) {
      console.log(
        `[AI] 后端截断: ${uiMessages.length} → ${MAX_CONTEXT_MESSAGES} 条消息`
      );
    }

    // UIMessage → 模型消息。
    // ignoreIncompleteToolCalls：被中断的一轮里可能只有 tool-call 没有 tool-result，
    // 那是非法消息，忽略掉而不是让整轮请求失败。
    const modelMessages = await convertToModelMessages(truncatedUiMessages, {
      ignoreIncompleteToolCalls: true,
    });

    // ============================================================
    // Day 13 新增：注入长期记忆到 system prompt
    // ============================================================
    const memories = await getRelevantMemories(user.id);
    const memoryPrompt = formatMemoriesForPrompt(memories);

    // 标记记忆被检索使用（用于冷淘汰：不用的记忆会被清理）
    touchMemories(memories.map((m) => m.id)).catch(() => {});

    // 最近对话摘要：createPlan 后台生成计划文档时作为个性化上下文（截断，控制成本）
    const conversationHint = truncatedUiMessages
      .slice(-6)
      .map((m) => `${m.role === "user" ? "用户" : "雨宝"}: ${messageText(m).slice(0, 200)}`)
      .join("\n");

    // ============================================================
    // Day 16 知识库检索：不再主动注入
    // 交给 AI 通过 searchKnowledgeBase 工具自行判断是否检索，
    // 避免寒暄/闲聊消息也白白做向量检索拖慢回复
    // ============================================================

    // ============================================================
    // Phase 3/4 文档工作室：注入当前文档上下文 + 文档修改工具
    // ============================================================
    let studioPrompt = "";
    let studioTools = {};
    const studioKind = studioContext?.kind;
    const studioRefId = studioContext?.refId;
    if (
      (studioKind === "plan" || studioKind === "doc") &&
      studioRefId &&
      typeof studioContext?.document === "string"
    ) {
      if (studioKind === "plan") {
        const plan = await prisma.plan.findFirst({
          where: { id: studioRefId, userId: user.id },
          select: { id: true, name: true },
        });
        if (plan) {
          studioTools = createStudioTools(user.id, {
            kind: "plan",
            id: plan.id,
          });
          studioPrompt = [
            `用户正在文档工作室里编辑学习计划「${plan.name}」的 Markdown 文档，完整内容如下：`,
            "",
            studioContext.document,
            "",
            "你可以调用工具直接修改它：调整计划信息用 updatePlanInfo；修改文档内容用 updateDocument（必须传完整的修改后文档）。",
            "涉及任务时，请同步修改文档中「## 任务安排」段落的任务行。",
          ].join("\n");
        }
      } else {
        const doc = await prisma.document.findFirst({
          where: { id: studioRefId, userId: user.id },
          select: { id: true, title: true },
        });
        if (doc) {
          studioTools = createStudioTools(user.id, { kind: "doc", id: doc.id });
          studioPrompt = [
            `用户正在文档工作室里编辑文档「${doc.title}」的 Markdown 内容，完整内容如下：`,
            "",
            studioContext.document,
            "",
            "你可以用 updateDocument 工具直接修改这份文档（必须传完整的修改后文档）。",
          ].join("\n");
        }
      }
    }

    // ============================================================
    // 用户个人资料名字注入
    // 聊天系统提示词带上用户设置的名字，设置页改名立即生效；
    // 用户在当前对话里明确要求换称呼时，以用户最新说的为准。
    // ============================================================
    const userNamePrompt = user.name
      ? [
          `## 用户名字`,
          `用户设置里的名字是「${user.name}」，称呼用户时优先用这个名字。`,
          `如果用户在这段对话中明确说要换别的称呼，以用户最新说的为准。`,
        ].join("\n")
      : "";

    // 系统提示词同样按场景拼：只注入「该场景真的注册了对应工具」的段落。
    // 提示词与工具白名单必须一起裁——只裁工具会让模型反复去调不存在的工具。
    const fullSystem = [
      buildSystemPrompt(promptGroupsFor(surface)),
      userNamePrompt,
      studioPrompt,
      memoryPrompt,
    ]
      .filter(Boolean)
      .join("\n\n");

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
          userText: lastUserText,
          userId: user.id,
        });
      },
    }), {
      userId: user.id,
      // 记账口径：文档与计划合并为 studio（与 conversation.surface 的三值口径不同，
      // 那边要区分到具体文档/计划，这边只需按界面统计；历史数据也按这个口径落库）
      surface: studioContext ? "studio" : "agent",
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
  userText,
  userId,
}: {
  conversationId: string;
  content: string;
  /** null = 文本协议，没有结构化片段可存 */
  parts: ViewPart[] | null;
  userText: string;
  userId: string;
}) {
  if (!content && !parts?.length) {
    console.warn("[AI] onEnd: 没有可保存的内容，跳过");
    return;
  }

  console.log(
    `[AI] onEnd: 保存 AI 回复 (${content.length} 字符, ${parts?.length ?? 0} parts) → conversation:${conversationId}`
  );

  try {
    await prisma.conversationMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content,
        // undefined = 不写这一列（保持 NULL），而不是写 JSON null
        parts: parts ?? undefined,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    console.log("[AI] onEnd: 保存成功 ✅");

    // ============================================================
    // Day 13: fire-and-forget 提取长期记忆
    // ============================================================
    extractAndSaveMemories(userId, userText, content).catch((err) =>
      console.error("[Memory] 后台提取失败:", err)
    );
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
