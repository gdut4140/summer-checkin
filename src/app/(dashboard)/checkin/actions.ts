"use server";

// ============================================================
// Day 10 优化：统一 Server Action 错误处理
// 不再 throw，改为返回 ActionResult<T> 让调用方统一处理
// ============================================================

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { refresh } from "next/cache";
import { startOfDay, endOfDay } from "date-fns";
import type { ActionResult } from "@/types";

export async function createCheckin(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAuth();

    const content = formData.get("content") as string;
    const hours = parseFloat(formData.get("hours") as string) || 0;
    const subject = (formData.get("subject") as string) || null;
    const planId = (formData.get("planId") as string) || null;
    const mood = (formData.get("mood") as string) || null;

    if (!content || hours <= 0) {
      return { success: false, error: "Content and hours are required" };
    }

    const now = new Date();

    await prisma.checkin.create({
      data: {
        userId: user.id,
        content,
        hours,
        subject,
        planId,
        mood,
        checkinDate: now,
      },
    });

    // Update or create today's study record
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const existingRecord = await prisma.studyRecord.findFirst({
      where: {
        userId: user.id,
        date: { gte: todayStart, lte: todayEnd },
        subject: subject ?? "General",
      },
    });

    if (existingRecord) {
      await prisma.studyRecord.update({
        where: { id: existingRecord.id },
        data: {
          totalMinutes: existingRecord.totalMinutes + hours * 60,
        },
      });
    } else {
      await prisma.studyRecord.create({
        data: {
          userId: user.id,
          date: now,
          totalMinutes: hours * 60,
          subject: subject ?? "General",
        },
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/checkin");
    revalidatePath("/calendar");
    revalidatePath("/statistics");
    refresh();

    return { success: true };
  } catch (error) {
    console.error("[createCheckin] 失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "打卡失败，请稍后重试",
    };
  }
}
