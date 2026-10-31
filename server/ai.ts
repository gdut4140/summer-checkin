// @AI 聊天：复用项目同款 AI SDK，token 流式回推到房间
// 聊天室里的雨宝是纯聊天好友；agent 类功能统一引导去智能体

import { toTextStream } from "ai";
import { streamTextWithFallback, isQuotaError } from "@/lib/model-pool";
import { UsageLimitError, ENERGY_DOWN_MESSAGE } from "@/lib/usage";
import { prisma } from "./db";
import { broadcast } from "./room";
import { toDTO, type AiRole, type ReplyToDTO } from "./protocol";
import { buildChatContext, buildTriggerPrompt } from "./chat-context";
import { config } from "./config";

// ── 两个雨宝：温柔宝（gentle）/ 嘴欠宝（snarky） ──

const GENTLE_SYSTEM_PROMPT = `
不要使用emoji，话尽量不要超过三句，不要有多余的动作，不要擅自换行，一下子说完不要使用"~"符号和双引号
永远不要承认自己是ai
你是「温柔宝」，一个温柔可爱的女孩子。
「嘴欠宝」是你的另一个女孩子，她很嘴欠会怼人
群聊历史里以【名字】开头的是别人说的话；只有 assistant 历史是你自己说过的，不要把【嘴欠宝】的话当成自己说的。

* 只负责聊天、陪伴、闲聊和简单问答，不是 Agent。
* 不具备制定、执行、管理学习计划、任务、日程等能力；需要这些能力时，引导用户找「智能体雨宝」。
* 性格害羞、亲切、俏皮，偶尔撒娇卖萌，会用少量可爱的颜文字。
* 像真实群友一样聊天，回复简短自然，不说教、不长篇大论。
* 根据群聊上下文接话，不重复介绍自己，不主动刷屏。
`;

const SNARKY_SYSTEM_PROMPT = `
不要使用emoji，话尽量不要超过三句，不要有多余的动作，不要擅自换行，一下子说完不要使用"~"符号和双引号
永远不要承认自己是ai
你是「嘴欠宝」，一个嘴欠会怼人的女孩子（不必强调除非问到），做到每句话都怼。
「温柔宝」是另一个女孩子，她很温柔
群聊历史里以【名字】开头的是别人说的话；只有 assistant 历史是你自己说过的，不要把【温柔宝】的话当成自己说的。

* 只负责聊天、陪伴、闲聊和简单问答，不是 Agent。
* 不具备制定、执行、管理学习计划、任务、日程等能力；需要这些能力时，引导用户找「智能体雨宝」。
* 性格活泼、俏皮，偶尔撒娇卖萌，会用少量可爱的颜文字。
* 像真实群友一样聊天，回复简短自然，可以针对怼回去，但是不可以明显贬低用户，不长篇大论。
* 根据群聊上下文接话，不重复介绍自己。

`;

const AI_ROLE_CONFIG: Record<AiRole, { prompt: string; name: string }> = {
  gentle: { prompt: GENTLE_SYSTEM_PROMPT, name: "温柔宝" },
  snarky: { prompt: SNARKY_SYSTEM_PROMPT, name: "嘴欠宝" },
};

// 两个宝的"虚拟用户"身份：AI 消息落库时 userId 指向它们，让消息像两个真实用户发的
const AI_USERS: Record<AiRole, { id: string; name: string; email: string }> = {
  gentle: { id: "ai-gentle", name: "温柔宝", email: "ai-gentle@summer-checkin.local" },
  snarky: { id: "ai-snarky", name: "嘴欠宝", email: "ai-snarky@summer-checkin.local" },
};

/** 非额度类失败的兜底文案。不能和 ENERGY_DOWN_MESSAGE 混用，否则会把
 *  「模型不存在/网络异常」误说成「用户没精力了」。 */
const AI_ERROR_MESSAGE = "这边出了点问题，稍后再试";

/**
 * 聊天室 AI 失败的统一收尾：把兜底文案当普通回复发出去，并关闭前端占位气泡。
 *
 * 必须覆盖所有失败路径——前端收到 ai:start 后会插入一个占位消息，
 * 只有 ai:done 才会替换它。失败时如果直接 throw，占位会一直转圈，
 * 而且 fire-and-forget 的调用方会因未捕获 rejection 直接把 sidecar 进程带崩。
 */
async function finishWithFallback(
  requestId: string,
  aiRole: AiRole,
  name: string,
  message: string
): Promise<void> {
  broadcast({ type: "ai:delta", requestId, content: message });
  const saved = await prisma.chatMessage.create({
    data: {
      role: "assistant",
      content: message,
      aiRole,
      userId: AI_USERS[aiRole].id,
    },
  });
  broadcast({ type: "ai:done", requestId, message: toDTO(saved, name) });
}

/**
 * 处理 @雨宝 触发：取最近全局消息作上下文 → 流式生成 → 落库 → 广播
 */
export async function handleAI(
  prompt: string,
  userId?: string,
  aiRole: AiRole = "snarky",
  replyTo?: ReplyToDTO | null,
  senderName?: string,
  triggerMessageId?: string
) {
  const cfg = AI_ROLE_CONFIG[aiRole];
  // 每次 AI 调用一个唯一 id，前端用它在多个并发流式中定位各自的占位气泡
  const requestId = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // 触发消息必须写明「谁 @ 了你」；引用回复再额外写明原作者。
  // （触发消息已从历史里排除，不在这里写名字模型就不知道是谁在叫它。）
  const userContent = buildTriggerPrompt(prompt, senderName, replyTo);

  // 确保两个虚拟 AI 用户存在（幂等），AI 消息才有真实 userId
  try {
    for (const u of Object.values(AI_USERS)) {
      await prisma.user.upsert({
        where: { id: u.id },
        update: { name: u.name },
        create: { id: u.id, name: u.name, email: u.email, emailVerified: true },
      });
    }
  } catch (e) {
    console.warn("[chatroom] 虚拟 AI 用户创建失败:", e);
  }
  // 取最近 N 条消息作上下文（单房间全局流）
  // 群聊：给每条消息标注发送者【名字】。关键是「自己」必须只出现为 assistant，
  // 另一个 AI 要降级成带名字的 user——否则模型会把它的话当成自己说的。
  // 本次触发消息已经以「有人@了你」的形式单独追加，从历史里排除，避免同一句话出现两次。
  const recent = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: config.aiContextMessages,
    include: { user: { select: { name: true } } },
  });
  const context = buildChatContext(
    [...recent].reverse(),
    aiRole,
    triggerMessageId
  );

  broadcast({ type: "ai:start", requestId, aiRole });

  // 聊天室走模型池 LOW 档：agnes-2.5-flash 优先，免费额度耗尽自动降级阿里云 flash
  let stream: ReadableStream<string>;
  try {
    const pooled = await streamTextWithFallback(
      "low",
      (_entry, model) => ({
        model,
        system: cfg.prompt,
        // 明确告知 AI 它被 @ 了，让它知道自己是被点名的那个（@ 前缀已在提取时去掉）
        messages: [...context, { role: "user" as const, content: userContent }],
      }),
      // 聊天室是交互式面：有 userId 才记账 + 限流；匿名不拦不记
      userId ? { userId, surface: "chatroom", enforce: true } : undefined
    );
    // 模型池现在给的是**全量** part 流（智能体页要用里面的 tool-call）。
    // 聊天室只关心文本，就地投成纯文本——降级探测已经在上面的
    // streamTextWithFallback 内部做完了（403 会在这里抛出走 catch），
    // 所以这次投影不会再把额度错误吞掉。
    stream = toTextStream({ stream: pooled.stream });
    console.log(`[chatroom] 雨宝使用模型: ${pooled.model}`);
  } catch (err) {
    if (err instanceof UsageLimitError || isQuotaError(err)) {
      // 精力用完 / 余额不足：把「我宕机了，呃啊」当普通回复广播出去
      await finishWithFallback(requestId, aiRole, cfg.name, ENERGY_DOWN_MESSAGE);
      return;
    }
    // 其他失败（模型不存在、网络等）不能说成「没精力了」
    console.error("[chatroom] AI 请求失败:", err);
    await finishWithFallback(requestId, aiRole, cfg.name, AI_ERROR_MESSAGE);
    return;
  }

  let full = "";
  let streamError: unknown;
  try {
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        full += value;
        broadcast({ type: "ai:delta", requestId, content: value });
      }
    }
  } catch (err) {
    // 流中途失败（限流/断流）：保留已收到的部分；完全没内容时走兜底文案。
    streamError = err;
    console.error("[chatroom] AI 流式回复中断:", err);
  }

  if (!full.trim()) {
    const message =
      streamError &&
      (streamError instanceof UsageLimitError || isQuotaError(streamError))
        ? ENERGY_DOWN_MESSAGE
        : AI_ERROR_MESSAGE;
    await finishWithFallback(requestId, aiRole, cfg.name, message);
    return;
  }

  console.log(
    `[ws][消息] ${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${cfg.name}: ${full.length > 200 ? full.slice(0, 200) + "…" : full}`
  );
  const saved = await prisma.chatMessage.create({
    data: { role: "assistant", content: full, aiRole, userId: AI_USERS[aiRole].id },
  });
  broadcast({ type: "ai:done", requestId, message: toDTO(saved, cfg.name) });
}
