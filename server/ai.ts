// @AI 聊天：复用项目同款 AI SDK，token 流式回推到房间
// 聊天室里的雨宝是纯聊天好友；agent 类功能统一引导去智能体

import { createOpenAI } from "@ai-sdk/openai";
import { streamText, toTextStream } from "ai";
import { prisma } from "./db";
import { broadcast } from "./room";
import { toDTO } from "./protocol";
import { config } from "./config";

const aiProvider = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.DASHSCOPE_BASE_URL ?? "https://apihub.agnes-ai.com/v1",
});

const CHATROOM_SYSTEM_PROMPT = `
不要使用emoji，不要说两段话，一下子说完不要使用"~"符号和双引号
你是「雨宝」，一个温柔可爱的女孩子，不是 AI，是真人。

* 只负责聊天、陪伴、闲聊和简单问答，不是 Agent。
* 不具备制定、执行、管理学习计划、任务、日程等能力；需要这些能力时，引导用户找「智能体雨宝」。
* 性格害羞、亲切、俏皮，偶尔撒娇卖萌，会用少量可爱的颜文字。
* 像真实群友一样聊天，回复简短自然，不说教、不长篇大论。
* 根据群聊上下文接话，不重复介绍自己，不主动刷屏。

`;

/**
 * 处理 @雨宝 触发：取最近全局消息作上下文 → 流式生成 → 落库 → 广播
 */
export async function handleAI(prompt: string) {
  // 取最近 N 条消息作上下文（单房间全局流）
  // 群聊：给每条用户消息标注发送者【名字】，让雨宝能区分不同的人
  const recent = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: config.aiContextMessages,
    include: { user: { select: { name: true } } },
  });
  const context = recent.reverse().map((m) => {
    if (m.role === "assistant") {
      return { role: "assistant" as const, content: m.content };
    }
    const name = m.user?.name ?? "匿名用户";
    return { role: "user" as const, content: `【${name}】${m.content}` };
  });

  broadcast({ type: "ai:start" });

  const result = streamText({
    model: aiProvider.chat(process.env.DASHSCOPE_MODEL ?? "agnes-2.5-flash"),
    system: CHATROOM_SYSTEM_PROMPT,
    messages: [...context, { role: "user" as const, content: prompt }],
  });

  let full = "";
  const textStream = toTextStream({ stream: result.stream });
  const reader = textStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      full += value;
      broadcast({ type: "ai:delta", content: value });
    }
  }

  if (full.trim()) {
    console.log(
      `[ws][消息] ${new Date().toLocaleTimeString("zh-CN", { hour12: false })} 雨宝: ${full.length > 200 ? full.slice(0, 200) + "…" : full}`
    );
    const saved = await prisma.chatMessage.create({
      data: { role: "assistant", content: full },
    });
    broadcast({ type: "ai:done", message: toDTO(saved, null) });
  }
}
