// @AI 聊天：复用项目同款 AI SDK，token 流式回推到房间
// 聊天室里的雨宝是纯聊天好友；agent 类功能统一引导去智能体

import { streamTextWithFallback, isQuotaError } from "@/lib/model-pool";
import { UsageLimitError, ENERGY_DOWN_MESSAGE } from "@/lib/usage";
import { prisma } from "./db";
import { broadcast } from "./room";
import { toDTO, type AiRole, type ReplyToDTO } from "./protocol";
import { config } from "./config";

// ── 两个雨宝：温柔宝（gentle）/ 嘴欠宝（snarky） ──

const GENTLE_SYSTEM_PROMPT = `
不要使用emoji，话尽量不要超过三句，不要有多余的动作，不要擅自换行，一下子说完不要使用"~"符号和双引号
永远不要承认自己是ai
你是「温柔宝」，一个温柔可爱的女孩子。
「嘴欠宝」是你的另一个女孩子，她很嘴欠会怼人

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

/**
 * 处理 @雨宝 触发：取最近全局消息作上下文 → 流式生成 → 落库 → 广播
 */
export async function handleAI(
  prompt: string,
  userId?: string,
  aiRole: AiRole = "snarky",
  replyTo?: ReplyToDTO | null,
  senderName?: string
) {
  const cfg = AI_ROLE_CONFIG[aiRole];
  // 每次 AI 调用一个唯一 id，前端用它在多个并发流式中定位各自的占位气泡
  const requestId = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // 引用回复：明确点名“原作者是谁/转给人是谁”，避免模型把 @ 里的人和引用作者搞混
  const quote =
    replyTo?.content && replyTo.content.length > 400
      ? replyTo.content.slice(0, 400) + "…"
      : replyTo?.content;
  const userContent = quote
    ? `有人@了你。${senderName ? `${senderName} 转给你看一条消息` : "有人转给你看一条消息"}，发送者是【${replyTo?.userName ?? "用户"}】：\n> ${quote}\n\n这条消息是【${replyTo?.userName ?? "用户"}】发的。请回应：${prompt}`
    : `有人@了你：${prompt}`;

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
  // 群聊：给每条用户消息标注发送者【名字】，让雨宝能区分不同的人
  const recent = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: config.aiContextMessages,
    include: { user: { select: { name: true } } },
  });
  const context = recent.reverse().map((m) => {
    if (m.role === "assistant") {
      // 用 assistant 消息的 name 字段区分是谁说的（不污染 content，避免回复里带出明文标签）
      return {
        role: "assistant" as const,
        content: m.content,
        name: m.aiRole === "gentle" ? "温柔宝" : "嘴欠宝",
      };
    }
    const name = m.user?.name ?? "匿名用户";
    return { role: "user" as const, content: `【${name}】${m.content}` };
  });

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
    stream = pooled.stream;
    console.log(`[chatroom] 雨宝使用模型: ${pooled.model}`);
  } catch (err) {
    if (err instanceof UsageLimitError || isQuotaError(err)) {
      // 精力用完 / 余额不足：把「我宕机了，呃啊」当普通回复广播出去
      broadcast({ type: "ai:delta", requestId, content: ENERGY_DOWN_MESSAGE });
      const saved = await prisma.chatMessage.create({
        data: { role: "assistant", content: ENERGY_DOWN_MESSAGE, aiRole, userId: AI_USERS[aiRole].id },
      });
      broadcast({ type: "ai:done", requestId, message: toDTO(saved, cfg.name) });
      return;
    }
    throw err;
  }

  let full = "";
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      full += value;
      broadcast({ type: "ai:delta", requestId, content: value });
    }
  }

  if (full.trim()) {
    console.log(
      `[ws][消息] ${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${cfg.name}: ${full.length > 200 ? full.slice(0, 200) + "…" : full}`
    );
    const saved = await prisma.chatMessage.create({
      data: { role: "assistant", content: full, aiRole, userId: AI_USERS[aiRole].id },
    });
    broadcast({ type: "ai:done", requestId, message: toDTO(saved, cfg.name) });
  }
}
