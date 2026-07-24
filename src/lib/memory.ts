// ============================================================
// Day 13: 长期记忆系统
//
// ① extractAndSaveMemories — 用 AI 从对话中提取用户关键信息，存入 DB
// ② getRelevantMemories    — 查询用户最近的记忆
// ③ formatMemoriesForPrompt — 格式化记忆注入 system prompt
//
// 设计决策：
//   - 不在此阶段引入 embedding/向量（那在 Day 16-19 RAG）
//   - 记忆量少（< 50 条）时全文注入 system prompt 完全可行
//   - 提取是 fire-and-forget 的，不阻塞主对话流
// ============================================================

import { prisma } from "@/lib/prisma";
import { createAIClient } from "@/lib/deepseek";
import type { Prisma } from "@/lib/generated/prisma/client";

// ---- 类型 ----
export interface UserMemory {
  id: string;
  content: string;
  category: string;
  createdAt: Date;
}

export interface MemoryExtraction {
  content: string;
  category: "preference" | "goal" | "skill" | "fact";
}

// ---- 查询 ----

/**
 * 获取用户最近的记忆，按时间倒序
 */
export async function getRelevantMemories(
  userId: string,
  limit = 20
): Promise<UserMemory[]> {
  const memories = await prisma.userMemory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return memories;
}

/**
 * 将记忆列表格式化为 system prompt 片段
 */
export function formatMemoriesForPrompt(memories: UserMemory[]): string {
  if (memories.length === 0) return "";

  const lines = memories.map(
    (m) => `- （${m.category}）${m.content}`
  );

  return `[关于用户的长期记忆]
${lines.join("\n")}
`;
}

// ---- 提取与保存 ----

/**
 * 从一轮对话中提取用户信息，存入数据库。
 *
 * 设计为 fire-and-forget：调用方不应 await 结果，避免阻塞主请求。
 * 提取失败只记日志，不影响对话流。
 */
export async function extractAndSaveMemories(
  userId: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  try {
    const extracted = await extractMemoriesWithAI(userMessage, aiResponse);
    if (extracted.length === 0) return;

    // 逐个保存（跳过完全重复的）
    const existing = await prisma.userMemory.findMany({
      where: { userId },
      select: { content: true },
    });
    const existingContents = new Set(existing.map((m) => m.content));

    let saved = 0;
    for (const item of extracted) {
      if (existingContents.has(item.content)) continue;
      try {
        await prisma.userMemory.create({
          data: {
            userId,
            content: item.content,
            category: item.category,
          },
        });
        existingContents.add(item.content);
        saved++;
      } catch {
        // 并发写入可能造成唯一约束冲突，跳过即可
      }
    }

    if (saved > 0) {
      console.log(`[Memory] 为用户 ${userId} 保存了 ${saved} 条新记忆`);
    }
  } catch (error) {
    // 记忆提取失败不影响主对话流程
    console.error("[Memory] 提取记忆失败:", error);
  }
}

// ---- 内部 AI 调用 ----

const EXTRACTION_PROMPT = `你是信息提取助手。根据以下对话，提取关于用户的 1-2 条关键事实。

规则：
1. 只提取用户明确说出的信息（偏好、目标、技能、背景），不要推测
2. 每条事实用简短中文表述（不超过 30 字）
3. category 取：preference（偏好）、goal（目标）、skill（技能）、fact（其他事实）
4. 如果对话中没有新的用户信息，返回空数组

返回严格 JSON 格式：
[{"content": "用户喜欢用 TypeScript", "category": "preference"}]`;

/**
 * 调用 AI 从对话中提取关键记忆
 */
async function extractMemoriesWithAI(
  userMessage: string,
  aiResponse: string
): Promise<MemoryExtraction[]> {
  const client = createAIClient();

  const response = await client.chat.completions.create({
    model: process.env.DASHSCOPE_MODEL ?? "deepseek-chat",
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: `用户说：${userMessage}\n\nAI 回复：${aiResponse}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 300,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) return [];

  try {
    // AI 可能返回 {"items": [...]} 或直接 [...]
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : parsed.items ?? [];
    return items.filter(
      (item: { content?: string; category?: string }) =>
        item.content && item.category
    );
  } catch {
    console.warn("[Memory] AI 提取结果解析失败:", text.slice(0, 100));
    return [];
  }
}

/**
 * 删除某条记忆
 */
export async function deleteMemory(
  id: string,
  userId: string
): Promise<boolean> {
  const memory = await prisma.userMemory.findUnique({ where: { id } });
  if (!memory || memory.userId !== userId) return false;
  await prisma.userMemory.delete({ where: { id } });
  return true;
}
