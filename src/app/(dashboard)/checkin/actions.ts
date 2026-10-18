"use server";

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { startOfDay, endOfDay } from "date-fns";
import type { ActionResult } from "@/types";
// 注意：Server Action 绝对不能从带 "use client" 的文件导入值，
// 所以这里从纯共享模块读取 getSceneCopy / SceneType。
import {
  getSceneCopy,
  asSceneType,
  type SceneType,
} from "@/lib/scene-meta";

/**
 * 今日签到。
 *
 * 只有「今天来过了」这一种失败（幂等由这里挡）。**没有 mood / 科目 / 时长入参**：
 * 签到界面上根本没有对应输入，曾经留着的 mood 形参只会永远写 null，已删除。
 * 需要记录学习时长/科目的路径是 AI 代报「完成任务」（见 lib/tools/agent-tools.ts）。
 *
 * ⚠️ 这里的「今天已签到」是 findFirst → create，非原子；库上没有
 * (userId, 某一天的唯一约束)，并发请求理论上能插两条。见 remove-checkin-dead-columns.sql
 * 同一批遗留问题——要根治得先让「一行 = 一天」重新成立（AI 代报那条路径会一天写多行）。
 */
export async function dailyCheckin(scene?: SceneType): Promise<ActionResult> {
  try {
    const user = await requireAuth();
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // 今天是否已签到
    const existing = await prisma.checkin.findFirst({
      where: {
        userId: user.id,
        checkinDate: { gte: todayStart, lte: todayEnd },
      },
    });

    if (existing) {
      return { success: false, error: "今天已经来过了" };
    }

    // 根据场景决定签到记录文案（没传或非法就兜底雨林，不阻塞正常签到）
    const safeScene = scene ? asSceneType(scene) : null;
    const visitRecordText = safeScene
      ? getSceneCopy(safeScene).visitRecordText
      : "到访雨林";

    await prisma.checkin.create({
      data: {
        userId: user.id,
        content: visitRecordText,
        // 不写 hours：签到不产生时长，那一列已经是遗留列（见 schema 注释）
        checkinDate: now,
      },
    });

    revalidatePath("/checkin");
    revalidatePath("/dashboard");
    revalidatePath("/statistics");

    return { success: true };
  } catch (error) {
    console.error("[dailyCheckin] 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "签到失败",
    };
  }
}
