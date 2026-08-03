// ============================================================
// Phase 3: 学习报告生成器
//
// 报告类型：
// ① generateDailyReport   — 每日学习简报（轻量，主要给用户看）
// ② generateWeeklySummary — 周度学习分析（重量，包含趋势和建议）
//
// 数据来源：
// - Agent Runtime 的 LearningContext（observe 阶段输出）
// - analyzeStudyPattern 的分析结果
// - Agent 的 LLM 分析结果
//
// 设计原则：
// ① 报告是结构化数据（JSON），前端可以渲染为 Markdown 或卡片
// ② 报告可独立存储为 Notification 或单独展示
// ③ 复用已有分析逻辑，不做重复计算
// ============================================================

import type { LearningContext, AgentAnalysis } from "./runtime";
import type { StudyPattern, SubjectDetail } from "@/lib/tools/coach-tools";
import type { DailyReport } from "@/types";

// ---- 生成每日简报 ----

interface DailyReportInput {
  userId: string;
  context: LearningContext;
  analysis: AgentAnalysis;
  pattern?: StudyPattern;          // 来自 analyzeStudyPattern
  subjectDetails?: SubjectDetail[]; // 科目详情
  runId?: string;                   // 对应的 AgentRun ID
}

export function generateDailyReport(input: DailyReportInput): DailyReport {
  const { userId, context, analysis, pattern, subjectDetails, runId } = input;

  const today = new Date().toISOString().slice(0, 10);

  // 强弱项
  const strengths = pattern?.strongSubjects
    ? [...pattern.strongSubjects]
    : subjectDetails?.filter((d) => d.trend !== "down" && d.taskCompletionRate >= 70)
        .map((d) => d.subject) ?? [];

  const weaknesses = pattern?.weakSubjects
    ? [...pattern.weakSubjects]
    : subjectDetails?.filter((d) => d.trend === "down" || d.taskCompletionRate < 50)
        .map((d) => d.subject) ?? [];

  // 建议
  const suggestions: string[] = [];
  if (pattern?.suggestion) {
    suggestions.push(pattern.suggestion);
  }
  // 从 LLM 分析中提取建议
  for (const finding of analysis.findings) {
    if (finding.severity === "critical" || finding.severity === "warning") {
      suggestions.push(`⚠️ ${finding.detail}`);
    }
  }
  for (const action of analysis.actions) {
    if (action.type !== "ENCOURAGE") {
      suggestions.push(`📋 ${action.detail}`);
    }
  }
  // 去重
  const uniqueSuggestions = [...new Set(suggestions)];

  return {
    userId,
    date: today,
    status: analysis.status,
    summary: analysis.summary,
    stats: {
      todayHours: context.stats.todayHours,
      weekHours: context.stats.weekHours,
      streak: context.stats.streak,
      completionRate: pattern?.completionRate ?? 0,
    },
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    suggestions: uniqueSuggestions.slice(0, 5),
    generatedBy: runId ?? null,
  };
}

/**
 * 将报告格式化为可读的 Markdown 文本（用于通知或展示）
 */
export function formatReportAsMarkdown(report: DailyReport): string {
  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "早上好";
    if (hour < 18) return "下午好";
    return "晚上好";
  })();

  return [
    `${greeting}，这是你 ${report.date} 的学习小结 ☀️`,
    "",
    report.summary,
    "",
    `今天学了 **${report.stats.todayHours}h**，这周累计 **${report.stats.weekHours}h**，已经连续打卡 **${report.stats.streak} 天**`,
    "",
    ...(report.strengths.length > 0 ? [
      `做得好的地方：`,
      ...report.strengths.map((s) => `- ${s}`),
      "",
    ] : []),
    ...(report.weaknesses.length > 0 ? [
      `可以多关注一下：`,
      ...report.weaknesses.map((s) => `- ${s}`),
      "",
    ] : []),
    ...(report.suggestions.length > 0 ? [
      `一些小建议：`,
      ...report.suggestions.map((s) => `- ${s}`),
      "",
    ] : []),
  ].join("\n");
}

// ---- 生成周度总结 ----

interface WeeklyReportInput extends DailyReportInput {
  weekStart: string;
  weekEnd: string;
  dailySummaries?: string[]; // 本周每天的 summary
}

export function generateWeeklyReport(input: WeeklyReportInput): DailyReport & { weekStart: string; weekEnd: string } {
  const daily = generateDailyReport(input);
  return {
    ...daily,
    date: `${input.weekStart} ~ ${input.weekEnd}`,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
  };
}
