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
import { completionsWithFallback } from "@/lib/model-pool";
import { embedText } from "@/lib/rag/client";
import { cosineSimilarity, parseEmbedding } from "@/lib/rag/retriever";

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
  importance: number;
  confidence: number;
  matchExistingId: string | null; // AI 判断匹配到的已有记忆 ID，null = 全新
}

// ---- 查询 ----

/**
 * 混合检索：向量语义搜索 + 重要性 + 时间衰减
 *
 * 如果有 query，用 pgvector 做语义搜索（余弦相似度排序）。
 * 无 query 时回退到原混合评分（importance + recency）。
 *
 * 评分公式（无 query）：score = importance * 0.6 + recencyScore * 0.4
 */
export async function getRelevantMemories(
  userId: string,
  limit = 20,
  query?: string
): Promise<UserMemory[]> {
  // ── 语义搜索路径（JS 余弦相似度）──
  if (query) {
    try {
      const vec = await embedText(query);

      // 加载该用户所有有 embedding 的记忆，在 JS 中计算相似度
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          userId: string;
          type: string;
          content: string;
          importance: number;
          confidence: number;
          lastUsed: Date | null;
          createdAt: Date;
          embedding: unknown;
        }>
      >(
        `SELECT id, "userId", type, content, importance, confidence, "lastUsed", "createdAt", embedding
         FROM usermemory
         WHERE "userId" = $1 AND embedding IS NOT NULL
         LIMIT 200`,
        userId
      );

      if (rows.length > 0) {
        // JS 余弦相似度排序
        const scored = rows.map((r) => {
          const emb = parseEmbedding(r.embedding);
          const sim = emb.length > 0 ? cosineSimilarity(vec, emb) : 0;
          return { row: r, similarity: sim };
        });
        scored.sort((a, b) => b.similarity - a.similarity);
        const top = scored.slice(0, limit);

        return top.map(({ row: r }) => ({
          id: r.id,
          content: r.content,
          type: r.type as MemoryType,
          importance: r.importance,
          confidence: r.confidence,
          lastUsed: r.lastUsed,
          createdAt: r.createdAt,
        }));
      }
      // 如果向量搜索无结果（所有记忆都还没有 embedding），回退到原逻辑
    } catch (err) {
      console.warn("[Memory] 向量搜索失败，回退到混合评分:", err);
    }
  }

  // ── 原混合评分路径（无 query 或向量搜索失败）──
  const [recent, important] = await Promise.all([
    prisma.userMemory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.userMemory.findMany({
      where: { userId },
      orderBy: { importance: "desc" },
      take: 10,
    }),
  ]);

  // 去重（按 id）
  const seen = new Set<string>();
  const pool: Array<{ m: (typeof recent)[number]; score: number }> = [];

  for (const m of [...important, ...recent]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);

    // 时间衰减：0天前=1.0，30天前及更早=0.0
    const ageDays =
      (Date.now() - m.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - ageDays / 30);

    // 综合得分
    const score = (m.importance ?? 0.5) * 0.6 + recencyScore * 0.4;

    pool.push({ m, score });
  }

  // 按得分降序，取 top N
  pool.sort((a, b) => b.score - a.score);

  return pool.slice(0, limit).map(({ m }) => m) as unknown as UserMemory[];
}

/**
 * 按重要性排序获取记忆（保留，给特定场景用）
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
    const existing = await prisma.userMemory.findMany({
      where: { userId },
      select: { id: true, content: true, type: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const extracted = await extractMemoriesWithAI(
      userMessage,
      aiResponse,
      existing.map((m) => ({ id: m.id, content: m.content })),
      userId
    );
    if (extracted.length === 0) {
      console.log("[Memory] AI 未提取到信息，跳过");
      return;
    }

    const existingById = new Map(existing.map((m) => [m.id, m]));

    let saved = 0;
    let updated = 0;
    for (const item of extracted) {
      // AI 标注了匹配的已有记忆 ID → 更新（含 embedding）
      if (item.matchExistingId && existingById.has(item.matchExistingId)) {
        const old = existingById.get(item.matchExistingId)!;
        try {
          // 基础字段更新
          await prisma.userMemory.update({
            where: { id: item.matchExistingId },
            data: {
              type: item.type,
              content: item.content,
              importance: item.importance,
              confidence: item.confidence,
              lastUsed: new Date(),
            },
          });

          // 内容变化时重新生成 embedding
          if (old.content !== item.content) {
            try {
              const vec = await embedText(item.content);
              await prisma.$executeRawUnsafe(
                `UPDATE usermemory SET embedding = $1::jsonb WHERE id = $2`,
                JSON.stringify(vec),
                item.matchExistingId,
              );
            } catch (err) {
              console.warn("[Memory] 更新 embedding 失败:", err);
            }
          }

          updated++;
          console.log(`[Memory] 🔄 语义匹配更新: [${old.type}→${item.type}] "${old.content}" → "${item.content}"`);
        } catch {}
        continue;
      }

      // AI 没匹配 → 全新创建（含 embedding）
      try {
        let vec: number[] | null = null;
        try {
          vec = await embedText(item.content);
        } catch (err) {
          console.warn("[Memory] embedding 生成失败，将不使用向量:", err);
        }

        if (vec && vec.length > 0) {
          // 有向量 → 用原始 SQL 写入（Prisma 不支持 Unsupported 字段）
          const id = crypto.randomUUID();
          await prisma.$executeRawUnsafe(
            `INSERT INTO usermemory (id, "userId", type, content, embedding, importance, confidence, "createdAt")
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
            id,
            userId,
            item.type,
            item.content,
            JSON.stringify(vec),
            item.importance,
            item.confidence,
            new Date(),
          );
        } else {
          // 无向量 → 用 Prisma 普通写入
          await (prisma.userMemory as any).create({
            data: {
              userId,
              type: item.type,
              content: item.content,
              importance: item.importance,
              confidence: item.confidence,
            },
          });
        }
        saved++;
        console.log(`[Memory] ✨ 新建: [${item.type}] "${item.content}"${vec ? " [向量化]" : ""}`);
      } catch {}
    }

    if (saved > 0 || updated > 0) {
      console.log(`[Memory] 用户 ${userId}: 新建 ${saved} 条, 更新 ${updated} 条`);
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
2. 每条用简短中文表述，不超过 30 字，不要加括号注释
3. 如果对话中没有任何用户信息，返回空数组
4. **语义匹配**：参考下方「已有记忆」列表，如果对话信息与某条已有记忆**意思相同**（措辞可以不同），在 matchExistingId 填那条记忆的 ID；如果是新信息填 null

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
[{"content": "...", "type": "goal", "importance": 0.9, "confidence": 1.0, "matchExistingId": "cuid123" | null}]`;

async function extractMemoriesWithAI(
  userMessage: string,
  aiResponse: string,
  existingMemories: { id: string; content: string }[] = [],
  userId: string
): Promise<MemoryExtraction[]> {
  const existingList = existingMemories.length > 0
    ? `\n## 已有记忆（用于语义匹配）\n${existingMemories.map((m) => `- id:${m.id} | ${m.content}`).join("\n")}`
    : "";

  const { data: response } = await completionsWithFallback("low", (entry, client, extraBody) =>
    client.chat.completions.create({
      model: entry.modelName,
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        {
          role: "user",
          content: `用户说：${userMessage}\n\nAI 回复：${aiResponse}${existingList}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" },
      ...extraBody,
    }),
    { userId, surface: "memory" }
  );

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : parsed.items ?? [];
    return items.filter(
      (item: { content?: string; type?: string }) =>
        item.content && item.type
    ).map((item: { content: string; type: string; importance?: number; confidence?: number; matchExistingId?: string | null }) => ({
      content: item.content,
      type: (item.type ?? "fact") as MemoryType,
      importance: clampScore(item.importance ?? 0.5),
      confidence: clampScore(item.confidence ?? 0.5),
      matchExistingId: item.matchExistingId ?? null,
    }));
  } catch {
    console.warn("[Memory] AI 提取结果解析失败:", text.slice(0, 100));
    return [];
  }
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ---- 冷记忆淘汰 ----

/**
 * 淘汰规则（按优先级从高到低匹配）：
 *
 * ① importance < 0.3 且 lastUsed 超过 30 天  → 删除（不重要且长期未使用）
 * ② confidence < 0.3 且 importance < 0.5     → 删除（AI 自己都不确定的低价值信息）
 * ③ importance < 0.5 且 lastUsed 超过 60 天  → 删除（中低重要性且长期闲置）
 * ④ importance ≥ 0.8                         → 保留（核心目标/关键弱点不淘汰）
 *
 * 返回值：{ deleted: number, kept: number, examined: number }
 */
export async function cleanupColdMemories(
  userId: string,
  options?: { dryRun?: boolean }
): Promise<{ deleted: number; kept: number; examined: number }> {
  const dryRun = options?.dryRun ?? false;
  const now = new Date();

  // 获取所有记忆（不做筛选，在应用层判断）
  const all = await prisma.userMemory.findMany({
    where: { userId },
    select: { id: true, type: true, importance: true, confidence: true, lastUsed: true, createdAt: true },
  });

  const toDelete: string[] = [];
  const reasons: string[] = [];

  for (const m of all) {
    const daysSinceUsed = m.lastUsed
      ? Math.floor((now.getTime() - m.lastUsed.getTime()) / 86400000)
      : Math.floor((now.getTime() - m.createdAt.getTime()) / 86400000); // 从未用过，按创建时间算

    // 规则④：核心目标永远不删
    if (m.importance >= 0.8) continue;

    // 规则②：AI 自己都不确定的低价值信息
    if (m.confidence < 0.3 && m.importance < 0.5) {
      toDelete.push(m.id);
      reasons.push(`低置信度(${m.confidence})+低重要性(${m.importance}): ${m.type}`);
      continue;
    }

    // 规则①：不重要 + 30天未使用
    if (m.importance < 0.3 && daysSinceUsed > 30) {
      toDelete.push(m.id);
      reasons.push(`低重要性(${m.importance})+${daysSinceUsed}天未使用: ${m.type}`);
      continue;
    }

    // 规则③：中低重要性 + 60天未使用
    if (m.importance < 0.5 && daysSinceUsed > 60) {
      toDelete.push(m.id);
      reasons.push(`中低重要性(${m.importance})+${daysSinceUsed}天未使用: ${m.type}`);
      continue;
    }
  }

  if (!dryRun && toDelete.length > 0) {
    await prisma.userMemory.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  if (toDelete.length > 0) {
    console.log(
      `[Memory] ${dryRun ? "[DRY RUN] " : ""}淘汰 ${toDelete.length}/${all.length} 条记忆:\n` +
        reasons.map((r) => `  - ${r}`).join("\n")
    );
  }

  return {
    deleted: toDelete.length,
    kept: all.length - toDelete.length,
    examined: all.length,
  };
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
