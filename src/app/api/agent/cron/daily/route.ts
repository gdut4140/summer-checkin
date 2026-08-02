// ============================================================
// Phase 1: Daily Agent Cron — 每天自动运行 Agent 循环
//
// 触发方式：GET /api/agent/cron/daily
// 安全机制：通过 CRON_SECRET 验证调用来源
//           （生产环境由 Vercel Cron Jobs 或外部 cron 服务触发）
//
// 流程：
//   for each 活跃用户:
//     runLearningAgent(userId, { mode: "daily" })
//
// Phase 1 简化：只处理有活跃计划的用户
// Phase 3 升级：完整调度系统 + 用户级别 cron 配置
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runLearningAgent } from "@/lib/agent";

export async function GET(request: NextRequest) {
  // 安全校验：cron secret
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Cron] ====== 每日 Agent 运行开始 ======");

  try {
    // 找有活跃计划的用户（Phase 1 简化策略）
    const activeUsers = await prisma.plan.findMany({
      where: { status: "active" },
      select: { userId: true },
      distinct: ["userId"],
    });

    console.log(`[Cron] 找到 ${activeUsers.length} 个活跃用户`);

    const results: { userId: string; status: string; error?: string }[] = [];

    for (const { userId } of activeUsers) {
      try {
        const result = await runLearningAgent(userId, {
          mode: "daily",
          persist: true,
        });
        results.push({
          userId,
          status: result.status,
        });
        console.log(`[Cron] 用户 ${userId}: ${result.status}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "运行异常";
        results.push({ userId, status: "error", error: message });
        console.error(`[Cron] 用户 ${userId} 失败:`, message);
      }
    }

    const succeeded = results.filter((r) => r.status !== "error").length;

    console.log(
      `[Cron] ====== 每日 Agent 运行结束: ${succeeded}/${results.length} 成功 ======`
    );

    return NextResponse.json({
      success: true,
      processed: results.length,
      succeeded,
      failed: results.length - succeeded,
      results: results.slice(0, 50), // 限制响应大小
    });
  } catch (error) {
    console.error("[Cron] 每日 Agent 运行异常:", error);
    return NextResponse.json(
      { error: "Cron job failed" },
      { status: 500 }
    );
  }
}

// 生产环境建议：
// 1. Vercel Cron Jobs: vercel.json 中配置 cron
//    { "crons": [{ "path": "/api/agent/cron/daily", "schedule": "0 9 * * *" }] }
// 2. 设置环境变量 CRON_SECRET 保护接口
// 3. Phase 3 升级为按用户配置的时间运行（AgentSchedule 模型）
