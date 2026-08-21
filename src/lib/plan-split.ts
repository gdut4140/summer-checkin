// 计划任务拆分服务：把计划文档（含目标/说明）总结成平铺的、可打勾的任务清单。
// 由 /api/plans/[id]/split 路由和 createPlan 工具共用，避免逻辑重复。
// 对账策略：按归一化标题匹配 → 保留已有任务的完成状态；新增没见过的；
//           删除不再出现、且未完成的任务（已完成的历史保留，不丢进度）。

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { completionsWithFallback } from "@/lib/model-pool";
import { prisma } from "@/lib/prisma";
import { planTaskSource, planTaskSourceHash } from "@/lib/plan-tasks";

const SplitSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(600).optional(),
      category: z.enum(["study", "project", "review", "exercise"]).optional(),
      priority: z.enum(["high", "normal", "low"]).optional(),
    })
  ),
});

const SPLIT_SYSTEM_PROMPT = `你是学习计划拆解助手，把用户的学习计划文档拆成可执行、可打勾的任务清单。

要求：
- 平铺成一条条任务，不要按周/天分组，不要输出 Day/Week 编号。
- 每个任务具体、可量化、有明确的完成标准。
- 保留用户文档里已经写清楚的学习目标与安排，不要遗漏。
- 任务数量适中（一般不超过 30 个）。

必须只输出 JSON，且严格遵循以下结构（字段名不可改变，category/priority 只能取括号内的值）：
{
  "tasks": [
    {
      "title": "任务标题",
      "description": "任务描述（可省略）",
      "category": "study | project | review | exercise",
      "priority": "high | normal | low"
    }
  ]
}`;

function normalizeTitle(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

// 提取模型输出中的 JSON 主体（兼容可能的 markdown 代码围栏）
function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

// 判断文档改动是否实质影响任务清单（大意没变就不重新拆分任务）
const CHECK_TASKS_PROMPT = `你是学习计划任务同步判断器。对比"当前文档"与"当前任务清单"，判断文档的变化是否会让现有任务需要更新（新增/删除/修改）。
- 如果文档只是措辞调整、格式调整、错别字修改、补充说明等，不改变学习目标/内容/范围/节奏/产出 → needsUpdate=false
- 如果文档的学习目标、学习内容、范围、节奏或产出发生实质变化，需要重新生成任务 → needsUpdate=true
只返回 JSON：{"needsUpdate": true 或 false, "reason": "一句简短原因"}`;

async function tasksNeedUpdate(
  source: string,
  tasks: { title: string }[],
  userId: string
): Promise<boolean> {
  const { data: response } = await completionsWithFallback("low", (entry, client, extraBody) =>
    client.chat.completions.create({
      model: entry.modelName,
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CHECK_TASKS_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            document: source,
            tasks: tasks.map((t) => t.title),
          }),
        },
      ],
      ...extraBody,
    }),
    { userId, surface: "split", enforce: true }
  );
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) return true; // 拿不到判断结果时保守处理：当作需要更新
  try {
    const parsed = JSON.parse(extractJsonText(text)) as { needsUpdate?: boolean };
    return parsed.needsUpdate !== false;
  } catch {
    return true; // 解析失败保守处理
  }
}

export type SplitPlanResult = {
  success: true;
  alreadyRunning: boolean;
  changed: boolean;
  reason?: "no-change";
  created: number;
  updated: number;
  deleted: number;
};

/**
 * 拆分计划任务（幂等）：
 * - 已在拆分中（2 分钟内）→ 直接返回 alreadyRunning，避免重复触发
 * - AI 判断大意没变 → 不拆，仅更新哈希
 * - 真正拆分：对账创建/更新/删除
 */
export async function splitPlanTasks(
  planId: string,
  userId: string
): Promise<SplitPlanResult> {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.userId !== userId) {
    throw new Error("计划不存在");
  }

  const source = planTaskSource(plan);
  if (!source.trim()) {
    throw new Error("计划还没有可拆分的内容");
  }

  // 已在后台拆分中（2 分钟内视为进行中）→ 跳过，避免重复触发
  if (plan.tasksSplittingAt && Date.now() - plan.tasksSplittingAt.getTime() < 120_000) {
    return { success: true, alreadyRunning: true, changed: false, created: 0, updated: 0, deleted: 0 };
  }

  try {
    // 1. 先让 AI 判断文档改动是否实质影响任务：大意没变就不进入"刷新中"、不重新拆分
    const existingForCheck = await prisma.planTask.findMany({
      where: { planId },
      select: { title: true },
    });
    const needsUpdate = await tasksNeedUpdate(source, existingForCheck, userId);
    if (!needsUpdate) {
      // 大意没变：不拆分任务，只把文档哈希更新为"已评估"，抽屉不再提示过期
      await prisma.plan.update({
        where: { id: planId },
        data: { tasksSourceHash: planTaskSourceHash(plan) },
      });
      console.log("[split] 任务已检查，无需刷新", { planId });
      return { success: true, alreadyRunning: false, changed: false, reason: "no-change", created: 0, updated: 0, deleted: 0 };
    }

    // 2. 确实需要更新：先标记"刷新中"（抽屉据此显示进度条），再完整拆分
    await prisma.plan.update({ where: { id: planId }, data: { tasksSplittingAt: new Date() } });

    // 结构化输出用 json_object：DeepSeek 不支持 json_schema（generateObject 会发 json_schema 导致 400）
    // 模型偶尔会输出截断/损坏的 JSON，解析失败时重试一次；仍失败则不改动任务、返回错误
    let object: z.infer<typeof SplitSchema> | null = null;
    for (let attempt = 0; attempt < 2 && !object; attempt++) {
      const { data: response } = await completionsWithFallback(
        "low",
        (entry, client, extraBody) =>
          client.chat.completions.create({
            model: entry.modelName,
            temperature: 0.3,
            max_tokens: 8192,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SPLIT_SYSTEM_PROMPT },
              { role: "user", content: source },
            ],
            ...extraBody,
          }),
        { userId, surface: "split", enforce: true }
      );
      const text = response.choices[0]?.message?.content?.trim();
      if (!text) continue;
      try {
        object = SplitSchema.parse(JSON.parse(extractJsonText(text)));
      } catch (error) {
        console.warn(
          `[split] 第 ${attempt + 1} 次 JSON 解析失败:`,
          error instanceof Error ? error.message : error
        );
      }
    }
    if (!object) {
      throw new Error("AI 拆分结果解析失败，请重试");
    }

    // AI 没拆出内容时不改动现有任务，避免误清空
    if (object.tasks.length === 0) {
      return { success: true, alreadyRunning: false, changed: false, created: 0, updated: 0, deleted: 0 };
    }

    const existing = await prisma.planTask.findMany({ where: { planId } });
    const byTitle = new Map<string, (typeof existing)[number]>();
    for (const t of existing) byTitle.set(normalizeTitle(t.title), t);

    const usedIds = new Set<string>();
    let created = 0;
    let updated = 0;

    for (const task of object.tasks) {
      const match = byTitle.get(normalizeTitle(task.title));
      if (match && !usedIds.has(match.id)) {
        usedIds.add(match.id);
        await prisma.planTask.update({
          where: { id: match.id },
          data: {
            title: task.title,
            description: task.description ?? null,
            category: task.category ?? "study",
            priority: task.priority ?? "normal",
          },
        });
        updated++;
      } else {
        await prisma.planTask.create({
          data: {
            planId,
            userId,
            title: task.title,
            description: task.description ?? null,
            category: task.category ?? "study",
            priority: task.priority ?? "normal",
          },
        });
        created++;
      }
    }

    // 删除不再出现、且未完成的任务；已完成的历史保留
    let deleted = 0;
    for (const t of existing) {
      if (!usedIds.has(t.id) && t.status !== "done") {
        await prisma.planTask.delete({ where: { id: t.id } });
        deleted++;
      }
    }

    // 记录本次拆分所用的文档哈希，供抽屉判断任务是否过期（文档再改动即 stale）
    await prisma.plan.update({
      where: { id: planId },
      data: { tasksSourceHash: planTaskSourceHash(plan) },
    });

    // 任务已变化：使 /plans 页面的任务进度失效，返回后能拉到最新数据。
    // createPlan 工具会在请求流结束后后台触发拆分，此时 revalidatePath 可能超出请求上下文，
    // 包一层 catch 避免后台任务抛错。
    try {
      revalidatePath("/plans");
    } catch (error) {
      console.warn("[split] revalidatePath 跳过:", error);
    }
    console.log("[split] 任务已刷新", { planId, created, updated, deleted });
    return { success: true, alreadyRunning: false, changed: true, created, updated, deleted };
  } catch (error) {
    console.error("[split] 拆分失败:", error);
    throw error;
  } finally {
    // 无论成功失败都清除拆分中标记，抽屉轮询据此结束"刷新中"
    await prisma.plan.update({ where: { id: planId }, data: { tasksSplittingAt: null } }).catch(() => {});
  }
}
