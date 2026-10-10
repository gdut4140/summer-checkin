// 计划文档「## 任务安排」段落 ↔ PlanTask 双向同步
// 解析 + 差异计算：保存文档时按标题匹配 → 勾选状态 / 日期 / 标题更新 + 新增任务；
// **不删除**（保守策略，防误删进度）。

import { prisma } from "@/lib/prisma";

export interface TaskSectionItem {
  title: string;
  done: boolean;
  /** 该任务属于第几天；来自标题前缀或所属分组标题，都没有 → null */
  dayNumber: number | null;
  /** 同上，第几周 */
  weekNumber: number | null;
}

/** 段落标题：`## 任务安排` / `## 任务清单`（任意级别） */
const SECTION_RE = /^(#{1,6})\s*(任务安排|任务清单)\s*$/;
/** 任意标题，捕获级别 */
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/**
 * 标题里写着的日期前缀：「第1天：」「Day 2:」「第1周 · 第2天：」「**Day 3：**」。
 * 分隔符是必需的，所以「第1章」「第一天」这类不会被误伤。
 */
const TITLE_DAY_RE =
  /^\s*(?:\*\*)?(?:第\s*(\d+)\s*周\s*[·、,，]?\s*)?(?:第\s*(\d+)\s*天|Day\s*(\d+))\s*(?:\*\*)?\s*[：:、·.，,—-]\s*/i;

export interface TaskTitleParts {
  /** 去掉日期前缀后的标题 */
  title: string;
  dayNumber: number | null;
  weekNumber: number | null;
}

/**
 * 把标题里写着的日期拆出来。
 *
 * 项目里的实际约定是**日期写在标题文字里**（`第1天：闭包`），而不是填 dayNumber
 * 字段——实测 263 条 PlanTask 只有 6 条有 dayNumber。顺着这个既有习惯解析，比要求
 * 模型改行为可靠得多（它每次都老老实实写「第N天：」，却几乎不填结构化字段）。
 *
 * 前缀后面没内容时（标题只有「第1天：」）保留原标题，免得把标题清空。
 */
export function splitTitleDay(title: string): TaskTitleParts {
  const m = TITLE_DAY_RE.exec(title);
  if (!m) return { title: title.trim(), dayNumber: null, weekNumber: null };

  const weekNumber = m[1] ? Number(m[1]) : null;
  const dayNumber = m[2] ? Number(m[2]) : m[3] ? Number(m[3]) : null;
  const rest = title.slice(m[0].length).trim();

  if (!rest) return { title: title.trim(), dayNumber, weekNumber };
  return { title: rest, dayNumber, weekNumber };
}

/** 从分组标题文本里取周/天数字，取不到就是 null */
function parseDayHeading(text: string): {
  dayNumber: number | null;
  weekNumber: number | null;
} {
  const split = splitTitleDay(text);
  // 分组标题写作「### Day 3」/「### 第 1 周 · Day 3」，没有尾随分隔符，
  // 所以再用宽松一点的匹配兜一次
  const week = /第\s*(\d+)\s*周/.exec(text);
  const day = /Day\s*(\d+)/i.exec(text);
  return {
    dayNumber: split.dayNumber ?? (day ? Number(day[1]) : null),
    weekNumber: split.weekNumber ?? (week ? Number(week[1]) : null),
  };
}

/**
 * 解析文档中「## 任务安排」（或「## 任务清单」）段落，返回任务行列表。
 *
 * ⚠️ 段落终止条件是「同级或更浅的标题」，**不是「任何标题」**。
 * 清单按天分组后段落里会带 `### Day N` 子标题，用「任何标题都结束」的写法会
 * 停在第一个子标题上、返回 0 条，而 `syncTasksFromDocument` 对空结果是静默
 * early-return —— 表现为勾选框全部失效且没有任何报错。改这里务必跑测试。
 *
 * ⚠️ 返回的 title 已经去掉日期前缀。调用方按 title 匹配时必须用同一套归一化
 * （见 normalizeTitle），否则「第1天：闭包」与库里的「闭包」匹配不上，会重复建任务。
 *
 * 向后兼容：没有分组的平铺清单（旧文档）照常解析。
 */
export function parseTaskSection(markdown: string): TaskSectionItem[] {
  const items: TaskSectionItem[] = [];
  /** 0 = 还没进入任务段落 */
  let sectionLevel = 0;
  /** 0 = 段落内还没遇到分组标题 */
  let groupLevel = 0;
  let dayNumber: number | null = null;
  let weekNumber: number | null = null;

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();

    if (sectionLevel === 0) {
      const section = SECTION_RE.exec(line);
      if (section) sectionLevel = section[1].length;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      // 同级或更浅 → 本段落结束
      if (level <= sectionLevel) break;
      // 更深 → 是分组标题。只有「与当前分组同级或更浅」才开新分组；
      // 比分组更深的标题（如组内的 #### 备注）不改变当前日期
      if (groupLevel === 0 || level <= groupLevel) {
        groupLevel = level;
        const parsed = parseDayHeading(heading[2]);
        dayNumber = parsed.dayNumber;
        weekNumber = parsed.weekNumber;
      }
      continue;
    }

    // GFM 任务行：- [ ] / - [x]
    const match = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(raw);
    if (match) {
      const parts = splitTitleDay(match[2]);
      items.push({
        title: parts.title,
        done: match[1].toLowerCase() === "x",
        // 标题自带的日期优先：它贴在这一条上，比分组标题更具体
        dayNumber: parts.dayNumber ?? dayNumber,
        weekNumber: parts.weekNumber ?? weekNumber,
      });
    }
  }
  return items;
}

/**
 * 匹配键：**去掉日期前缀** + 大小写 / 空白归一。
 *
 * 两侧都必须过这一层。库里存的是「第1天：闭包」、文档里写的是「第1天：闭包」，
 * 而解析后 item.title 已经是「闭包」——如果只用朴素的 title 归一化去比，
 * 就会匹配不上已有行、把它们全部当成新任务重复创建。
 */
function normalizeTitle(title: string): string {
  return splitTitleDay(title).title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * 将文档中的任务安排段落同步到 PlanTask 表。
 * - 已存在的任务（按去掉日期前缀的标题匹配）：同步勾选状态、日期、以及去前缀后的标题
 * - 文档里新增的任务：创建（默认 study / normal）
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
    select: {
      id: true,
      title: true,
      status: true,
      dayNumber: true,
      weekNumber: true,
    },
  });
  const byTitle = new Map(existing.map((t) => [normalizeTitle(t.title), t]));

  let created = 0;
  let updated = 0;

  for (const item of items) {
    const match = byTitle.get(normalizeTitle(item.title));
    if (match) {
      const data: {
        title?: string;
        status?: string;
        completedAt?: Date | null;
        dayNumber?: number;
        weekNumber?: number;
      } = {};

      // 只同步 done ↔ 非 done（文档勾选状态）；in_progress / skipped 语义不因勾选框被动降级
      const isDone = match.status === "done";
      if (item.done !== isDone) {
        data.status = item.done ? "done" : "pending";
        data.completedAt = item.done ? new Date() : null;
      }

      // 日期同步：只在文档给了值时才写。
      // 文档没分组 ≠ 用户想清空日期（可能只是没写分组），所以 null 不覆盖，
      // 与「不删除任务」是同一条保守原则。
      if (item.dayNumber !== null && item.dayNumber !== match.dayNumber) {
        data.dayNumber = item.dayNumber;
      }
      if (item.weekNumber !== null && item.weekNumber !== match.weekNumber) {
        data.weekNumber = item.weekNumber;
      }

      // 标题去前缀：否则「第1天：」会永远留在标题里，和分组标题重复
      if (match.title !== item.title) {
        data.title = item.title;
      }

      if (Object.keys(data).length > 0) {
        await prisma.planTask.update({ where: { id: match.id }, data });
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
          dayNumber: item.dayNumber,
          weekNumber: item.weekNumber,
          category: "study",
          priority: "normal",
        },
      });
      created++;
    }
  }

  return { created, updated };
}
