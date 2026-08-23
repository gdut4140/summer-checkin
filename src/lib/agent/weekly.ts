// ============================================================
// 周度学习周报：显式生成（不依赖 LLM 是否产出 GENERATE_REPORT 动作）
// 周日由 cron daily 调用；用 observe + fallbackAnalysis（纯统计，不耗 LLM）
// 汇总"本周一 ~ 今天"的真实数据，落库为 report 通知。
// ============================================================

import { observe, fallbackAnalysis } from "./runtime";
import { generateWeeklyReport, formatReportAsMarkdown } from "./report";
import { createNotification } from "@/lib/notification";

/**
 * 为用户生成并落库一条"本周学习周报"通知。
 * 返回 null 表示当天同类型通知已存在（每日去重跳过）。
 */
export async function createWeeklyReportNotification(userId: string) {
  const context = await observe(userId);
  const analysis = fallbackAnalysis(context);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 回退到本周一
  weekStart.setHours(0, 0, 0, 0);

  const report = generateWeeklyReport({
    userId,
    context,
    analysis,
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: now.toISOString().slice(0, 10),
  });

  const markdown = formatReportAsMarkdown(report);

  return createNotification({
    userId,
    type: "report",
    title: "本周学习周报",
    content: markdown,
    actionUrl: "/agent",
  });
}
