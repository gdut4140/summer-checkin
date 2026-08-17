// 计划文档「## 任务安排」段落 ↔ PlanTask 双向同步（v1）
// 解析 + 差异计算：保存文档时按标题匹配 → 勾选状态更新（done/pending）+ 新增任务；
// **不删除**（保守策略，防误删进度）。

import { prisma } from "@/lib/prisma";

export interface TaskSectionItem {
  title: string;
  done: boolean;
}

/** 解析文档中「## 任务安排」（或「## 任务清单」）段落，返回任务行列表 */
export function parseTaskSection(markdown: string): TaskSectionItem[] {
  const lines = markdown.split("\n");
  const items: TaskSectionItem[] = [];
  let inSection = false;
  for (const line of lines) {
    // 段落起始标题（兼容 任务安排 / 任务清单 两种叫法）
    if (/^#{1,6}\s*(任务安排|任务清单)\s*$/.test(line.trim())) {
      inSection = true;
      continue;
    }
    // 遇到下一个任意标题 → 段落结束
    if (inSection && /^#{1,6}\s+/.test(line.trim())) break;
    if (!inSection) continue;
    // GFM 任务行：- [ ] / - [x]
    const match = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (match) {
      items.push({
        title: match[2].trim(),
        done: match[1].toLowerCase() === "x",
      });
    }
  }
  return items;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * 将文档中的任务安排段落同步到 PlanTask 表。
 * - 已存在的任务（按归一化标题匹配）：只同步勾选状态 done/pending
 * - 文档里新增的任务：创建（默认 study / normal / pending）
 * - 不删除任何任务（保守策略）
 */
export async function syncTasksFromDocument(
  planId: string,
  userId: string,
  document: string
): Promise<{ created: number; updated: number }> {
  const items = parseTaskSection(document);
  if (items.length === 0) return { created: 0, updated: 0 };

  const existing = await prisma.planTask.findMany({
    where: { planId },
    select: { id: true, title: true, status: true },
  });
  const byTitle = new Map(
    existing.map((t) => [normalizeTitle(t.title), t])
  );

  let created = 0;
  let updated = 0;

  for (const item of items) {
    const match = byTitle.get(normalizeTitle(item.title));
    if (match) {
      // 只同步 done ↔ 非 done（文档勾选状态）；in_progress / skipped 语义不因勾选框被动降级
      const isDone = match.status === "done";
      if (item.done !== isDone) {
        const nextStatus = item.done ? "done" : "pending";
        await prisma.planTask.update({
          where: { id: match.id },
          data: {
            status: nextStatus,
            completedAt: item.done ? new Date() : null,
          },
        });
        updated++;
      }
    } else {
      await prisma.planTask.create({
        data: {
          planId,
          userId,
          title: item.title,
          status: item.done ? "done" : "pending",
          completedAt: item.done ? new Date() : null,
          category: "study",
          priority: "normal",
        },
      });
      created++;
    }
  }

  return { created, updated };
}
