// ============================================================
// Phase 2: 长期记忆系统升级
//
// 升级内容：
// ① type   — 记忆分类细化（goal/habit/preference/skill/weakness/fact）
// ② importance — AI 判断的重要性评分 0-1
// ③ confidence — AI 对记忆准确性的置信度 0-1
// ④ lastUsed   — 上次被检索时间，用于淘汰冷记忆
//
// 新增能力：
// ⑤ getImportantMemories — 按重要性排序查询（Agent 用）
// ⑥ touchMemories        — 标记记忆被使用
// ⑦ 智能去重              — 同类同内容不重复保存
// ============================================================

import { prisma } from "@/lib/prisma";
import { createAIClient } from "@/lib/deepseek";

// ---- 类型（Phase 2 升级版） ----

/** 记忆类型（比旧版 category 更细粒度） */
export type MemoryType =
  | "goal"       // 学习目标（"准备字节前端面试"）
  | "habit"      // 学习习惯（"喜欢早上学习"）
  | "preference" // 偏好（"喜欢用 TypeScript"）
  | "skill"      // 技能（"React 熟练"）
  | "weakness"   // 薄弱点（"算法较弱"）
  | "fact";      // 其他事实

export interface UserMemory {
  id: string;
  content: string;
  type: MemoryType;       // Phase 2 新增
  importance: number;     // Phase 2 新增：0-1
  confidence: number;     // Phase 2 新增：0-1
  lastUsed: Date | null;  // Phase 2 新增
  createdAt: Date;
}

export interface MemoryExtraction {
  content: string;
  type: MemoryType;
  importance: number;   // 0-1
  confidence: number;   // 0-1
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
  return memories as unknown as UserMemory[];
}

/**
 * Phase 2 新增：按重要性排序获取记忆
 *
 * 用于 Agent Runtime — Agent 分析时优先获取最重要的记忆，
 * 而不是最近的所有记忆。重要性高的记忆（如学习目标）对决策更关键。
 */
export async function getImportantMemories(
  userId: string,
  limit = 10
): Promise<UserMemory[]> {
  const memories = await prisma.userMemory.findMany({
    where: { userId },
    orderBy: { importance: "desc" },
    take: limit,
  });
  return memories as unknown as UserMemory[];
}

/**
 * Phase 2 新增：按类型筛选记忆
 */
export async function getMemoriesByType(
  userId: string,
  type: MemoryType,
  limit = 10
): Promise<UserMemory[]> {
  const memories = await prisma.userMemory.findMany({
    where: { userId, type },
    orderBy: { importance: "desc" },
    take: limit,
  });
  return memories as unknown as UserMemory[];
}

/**
 * Phase 2 新增：标记记忆被使用（更新 lastUsed）
 *
 * 当记忆被检索并注入 system prompt 后调用，
 * 用于记忆生命周期管理 — 长期不用的重要记忆可以重新激活，
 * 长期不用的低重要性记忆可以被清理。
 */
export async function touchMemories(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await prisma.userMemory.updateMany({
      where: { id: { in: ids } },
      data: { lastUsed: new Date() },
    });
  } catch (error) {
    console.warn("[Memory] touchMemories 失败:", error);
  }
}

// ---- 格式化 ----

/**
 * 将记忆列表格式化为 system prompt 片段
 *
 * Phase 2 升级：按类型分组，标注重要性
 */
export function formatMemoriesForPrompt(memories: UserMemory[]): string {
  if (memories.length === 0) return "";

  // 按类型分组
  const grouped: Record<string, UserMemory[]> = {};
  for (const m of memories) {
    const key = m.type ?? "fact";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  const typeLabels: Record<string, string> = {
    goal: "🎯 学习目标",
    weakness: "⚠️ 薄弱环节",
    skill: "✅ 已有技能",
    preference: "💡 偏好习惯",
    habit: "🔄 学习习惯",
    fact: "📋 其他信息",
  };

  const sections: string[] = [];
  for (const [type, items] of Object.entries(grouped)) {
    const label = typeLabels[type] ?? type;
    const lines = items.map((m) => {
      const imp = m.importance != null ? `[重要度:${Math.round(m.importance * 100)}%]` : "";
      return `  - ${imp} ${m.content}`;
    });
    sections.push(`${label}:\n${lines.join("\n")}`);
  }

  return `[关于用户的长期记忆]\n${sections.join("\n\n")}\n`;
}

/**
 * 格式化记忆用于 Agent Runtime 分析
 *
 * 比 formatMemoriesForPrompt 更简洁，注重提取关键信息
 */
export function formatMemoriesForAgent(memories: UserMemory[]): string {
  if (memories.length === 0) return "";

  // 只取最重要的信息
  const important = memories
    .filter((m) => m.importance >= 0.5)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10);

  if (important.length === 0) return "";

  return important.map((m) => `- [${m.type}] ${m.content}`).join("\n");
}

// ---- 提取与保存 ----

/**
 * 从一轮对话中提取用户信息，存入数据库。
 *
 * 设计为 fire-and-forget：调用方不应 await 结果，避免阻塞主请求。
 * 提取失败只记日志，不影响对话流。
 *
 * Phase 2 升级：
 * - type 细分：goal/habit/preference/skill/weakness/fact
 * - importance + confidence：AI 打分
 * - 智能去重：同 type + 相似 content 不重复保存
 */
export async function extractAndSaveMemories(
  userId: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  try {
    // 先查询已有记忆，传给 AI 做语义去重
    const existing = await prisma.userMemory.findMany({
      where: { userId },
      select: { id: true, content: true, type: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const extracted = await extractMemoriesWithAI(
      userMessage,
      aiResponse,
      existing.map((m) => ({ content: m.content, type: m.type }))
    );
    if (extracted.length === 0) return;

    // 构建去重索引（精确匹配兜底）
    const normalizeContent = (s: string) =>
      s.replace(/^用户[是为的]?/, "").replace(/\s+/g, "").trim();
    const existingIndex = new Map<string, { id: string; type: string }>();
    for (const m of existing) {
      existingIndex.set(normalizeContent(m.content), { id: m.id, type: m.type });
    }

    let saved = 0;
    for (const item of extracted) {
      const normContent = normalizeContent(item.content);
      const match = existingIndex.get(normContent);

      if (match) {
        // 已存在 → 更新（含 type 纠正：旧 fact → 新 preference 等）
        try {
          await prisma.userMemory.update({
            where: { id: match.id },
            data: {
              type: item.type,        // 纠正旧 type
              importance: item.importance,
              confidence: item.confidence,
              lastUsed: new Date(),
            },
          });
          // 更新索引中的 type，避免后续重复再纠正
          match.type = item.type;
        } catch {
          // 静默跳过
        }
        continue;
      }

      // 新记忆 → 创建
      try {
        await prisma.userMemory.create({
          data: {
            userId,
            type: item.type,
            content: normContent,
            importance: item.importance,
            confidence: item.confidence,
          },
        });
        existingIndex.set(normContent, { id: "", type: item.type });
        saved++;
      } catch {
        // 并发写入冲突，跳过
      }
    }

    if (saved > 0) {
      console.log(`[Memory] 为用户 ${userId} 保存了 ${saved} 条新记忆`);
    }
  } catch (error) {
    console.error("[Memory] 提取记忆失败:", error);
  }
}

// ---- 内部 AI 调用 ----

/**
 * Phase 2 升级版提取 Prompt
 *
 * 新增要求：
 * ① type 细分为 6 类
 * ② 每条记忆标注 importance（0-1）和 confidence（0-1）
 * ③ importance 标准：
 *    - 0.9-1.0：核心目标、关键弱点（直接影响学习计划制定）
 *    - 0.7-0.9：重要偏好、已有技能
 *    - 0.5-0.7：一般习惯
 *    - 0.3-0.5：零散事实
 *    - 0.0-0.3：临时/非关键信息
 */
const EXTRACTION_PROMPT = `你是信息提取助手。根据以下对话，提取关于用户的 1-3 条关键信息。

## 提取规则
1. 只提取用户**明确说出**的信息，不要推测
2. 每条用简短中文表述，不超过 30 字
3. 如果对话中没有任何新的用户信息，返回空数组
4. **重要**：如果对话中提到的信息与「已有记忆」语义重复（意思相同但措辞不同），不要重复提取。例如已有"喜欢学前端React"，对话说"我在学React"，则跳过

## type 分类
- goal: 学习/职业目标（"准备字节前端面试"、"3个月学完Next.js"）
- weakness: 薄弱环节/困难（"算法题容易卡壳"、"CSS布局不熟"）
- skill: 已有技能/掌握程度（"React熟练"、"TypeScript用了2年"）
- preference: 偏好/倾向（"喜欢边做项目边学"、"早上效率高"）
- habit: 学习习惯/模式（"每天学习2小时"、"周末容易偷懒"）
- fact: 其他事实信息

## importance 评分标准（0.0-1.0）
- 0.9-1.0: 核心目标/关键弱点 — 直接影响学习计划
- 0.7-0.8: 重要偏好/技能 — 影响学习方式
- 0.5-0.6: 一般习惯 — 有参考价值
- 0.3-0.4: 零散事实 — 可能有价值
- 0.1-0.2: 临时信息 — 价值较低

## confidence 评分标准（0.0-1.0）
- 1.0: 用户非常明确地说出
- 0.8: 用户比较明确但未完全展开
- 0.5: 用户简略提及
- 0.3: 不太确定

返回严格 JSON 格式：
[{"content": "...", "type": "goal", "importance": 0.9, "confidence": 1.0}]`;

async function extractMemoriesWithAI(
  userMessage: string,
  aiResponse: string,
  existingMemories: { content: string; type: string }[] = []
): Promise<MemoryExtraction[]> {
  const client = createAIClient();

  // 构建已有记忆列表（只取最近10条，控制 prompt 长度）
  const existingText = existingMemories.slice(0, 10)
    .map((m) => `- [${m.type}] ${m.content}`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: process.env.DASHSCOPE_MODEL ?? "deepseek-v4-flash",
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: `已有记忆：\n${existingText || "（暂无）"}\n\n用户说：${userMessage}\n\nAI 回复：${aiResponse}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : parsed.items ?? [];
    return items.filter(
      (item: { content?: string; type?: string; importance?: number; confidence?: number }) =>
        item.content && item.type
    ).map((item: { content: string; type: string; importance?: number; confidence?: number }) => ({
      content: item.content,
      type: (item.type ?? "fact") as MemoryType,
      importance: clampScore(item.importance ?? 0.5),
      confidence: clampScore(item.confidence ?? 0.5),
    }));
  } catch {
    console.warn("[Memory] AI 提取结果解析失败:", text.slice(0, 100));
    return [];
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ---- 删除 ----

export async function deleteMemory(
  id: string,
  userId: string
): Promise<boolean> {
  const memory = await prisma.userMemory.findUnique({ where: { id } });
  if (!memory || memory.userId !== userId) return false;
  await prisma.userMemory.delete({ where: { id } });
  return true;
}
