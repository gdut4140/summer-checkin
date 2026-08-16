// @AI 聊天：复用项目同款 AI SDK，token 流式回推到房间
// 支持「总结讨论」和「转待办」（createTodos 工具）

import { createOpenAI } from "@ai-sdk/openai";
import { streamText, toTextStream, tool, isStepCount } from "ai";
import { z } from "zod";
import { prisma } from "./db";
import { broadcast } from "./room";
import { toDTO } from "./protocol";
import { config } from "./config";

const aiProvider = createOpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.DASHSCOPE_BASE_URL ?? "https://apihub.agnes-ai.com/v1",
});

const CHATROOM_SYSTEM_PROMPT = `你是「探索雨林」学习社区里的 AI 助教「雨宝」，和一群学生一起聊天。
风格：温暖、简洁，像学长学姐，用中文回复。

## 行为
- 平时 1~3 句话，不要长篇大论，除非大家在深入讨论一个具体问题。
- 学习相关的问题，结合知识认真回答；纯闲聊，就轻松自然地参与。
- 不编造，不确定就诚实说明。

## 你的额外能力
1. 总结讨论：当有人 @你 说「总结一下」「总结讨论」时，阅读最近的消息，提炼出要点、结论和待办事项，用简洁的列表呈现。
2. 转待办：当有人 @你 说「整理成待办」「转待办」「创建待办」时，调用 createTodos 工具，把讨论中提到的行动项/学习任务创建为该用户的学习待办，然后简短确认创建了几个。
3. 如果没有明确让你总结或转待办，就正常参与聊天，不要擅自创建待办。`;

/**
 * 处理 @雨宝 触发：取最近房间消息作上下文 → 流式生成 → 落库 → 广播
 * @param userId 触发者的用户 id（用于转待办）
 */
export async function handleAI(roomId: string, prompt: string, userId: string) {
  // 取最近 N 条消息作上下文
  const recent = await prisma.chatMessage.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take: config.aiContextMessages,
  });
  const context = recent.reverse().map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  broadcast(roomId, { type: "ai:start", roomId });

  const result = streamText({
    model: aiProvider.chat(process.env.DASHSCOPE_MODEL ?? "agnes-2.5-flash"),
    system: CHATROOM_SYSTEM_PROMPT,
    messages: [...context, { role: "user" as const, content: prompt }],
    tools: {
      createTodos: tool({
        description: "把讨论中提到的行动项/学习任务创建为该用户的学习待办",
        parameters: z.object({
          items: z.array(
            z.object({
              title: z.string().describe("待办标题，简洁具体"),
            })
          ),
        }),
        execute: async ({ items }) => {
          if (!items.length) return { created: 0 };
          await prisma.todo.createMany({
            data: items.map((i) => ({ userId, title: i.title })),
          });
          return { created: items.length };
        },
      }),
    },
    // 允许多步：调用工具后再生成自然语言回复
    stopWhen: isStepCount(6),
  });

  let full = "";
  const textStream = toTextStream({ stream: result.stream });
  const reader = textStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      full += value;
      broadcast(roomId, { type: "ai:delta", roomId, content: value });
    }
  }

  if (full.trim()) {
    const saved = await prisma.chatMessage.create({
      data: { roomId, role: "assistant", content: full },
    });
    broadcast(roomId, { type: "ai:done", roomId, message: toDTO(saved, null) });
  }
}
