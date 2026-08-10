"use server";

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { startOfDay, endOfDay } from "date-fns";
import type { ActionResult } from "@/types";

export async function dailyCheckin(mood?: string): Promise<ActionResult> {
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

    await prisma.checkin.create({
      data: {
        userId: user.id,
        content: "到访雨林",
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
