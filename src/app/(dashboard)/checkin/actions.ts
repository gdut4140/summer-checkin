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

export async function dailyCheckin(mood?: string, scene?: SceneType): Promise<ActionResult> {
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
        hours: 0,
        mood: mood ?? null,
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
