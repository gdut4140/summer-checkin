// ============================================================
// 周度学习周报：显式生成（不依赖 LLM 是否产出 GENERATE_REPORT 动作）
// 周日由 cron daily 调用；用 observe + fallbackAnalysis（纯统计，不耗 LLM）
// 汇总"本周一 ~ 今天"的真实数据，落库为 report 通知。
// 注意：周报按"周"去重、直接落库，不走通用 createNotification 的"每日去重"，
// 否则会被当天已有的任何 report（如每日小结）挤掉。
// ============================================================

import { prisma } from "@/lib/prisma";
import { observe, fallbackAnalysis } from "./runtime";
import { generateWeeklyReport, formatReportAsMarkdown } from "./report";

/**
 * 为用户生成并落库一条"本周学习周报"通知。
 * 返回 null 表示本周已生成过（周度去重跳过）。
 */
export async function createWeeklyReportNotification(userId: string) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 回退到本周一
  weekStart.setHours(0, 0, 0, 0);

  // 周度去重：本周已生成过周报则跳过
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type: "report",
      title: "本周学习周报",
      createdAt: { gte: weekStart },
    },
    select: { id: true },
  });
  if (existing) {
    console.log(`[Weekly] 本周周报已存在，跳过: user=${userId.slice(0, 8)}`);
    return null;
  }

  const context = await observe(userId);
  const analysis = fallbackAnalysis(context);

  const report = generateWeeklyReport({
    userId,
    context,
    analysis,
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: now.toISOString().slice(0, 10),
  });

  const markdown = formatReportAsMarkdown(report);

  const notification = await prisma.notification.create({
    data: {
      userId,
      type: "report",
      title: "本周学习周报",
      content: markdown,
      actionUrl: "/agent",
    },
  });
  console.log(`[Weekly] 已生成本周学习周报: user=${userId.slice(0, 8)}`);
  return notification;
}
