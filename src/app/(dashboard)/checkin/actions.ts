"use server";

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { refresh } from "next/cache";
import { startOfDay, endOfDay } from "date-fns";

export async function createCheckin(formData: FormData) {
  const user = await requireAuth();

  const content = formData.get("content") as string;
  const hours = parseFloat(formData.get("hours") as string) || 0;
  const subject = (formData.get("subject") as string) || null;
  const planId = (formData.get("planId") as string) || null;
  const mood = (formData.get("mood") as string) || null;

  if (!content || hours <= 0) {
    throw new Error("Content and hours are required");
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
}
