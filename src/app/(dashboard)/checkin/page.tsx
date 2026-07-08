import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { CheckinForm } from "@/components/checkin/checkin-form";

export default async function CheckinPage() {
  const user = await requireAuth();
  const now = new Date();

  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const existingCheckin = await prisma.checkin.findFirst({
    where: {
      userId: user.id,
      checkinDate: { gte: todayStart, lte: todayEnd },
    },
  });

  const plans = await prisma.plan.findMany({
    where: { userId: user.id, status: "active" },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          今日打卡
        </h1>
        <p className="text-muted-foreground mt-1">
          记录今天的学习内容和心情。
        </p>
      </div>

      <CheckinForm
        existingCheckin={
          existingCheckin
            ? {
                id: existingCheckin.id,
                content: existingCheckin.content,
                hours: existingCheckin.hours,
                subject: existingCheckin.subject,
                planId: existingCheckin.planId,
                mood: existingCheckin.mood,
              }
            : null
        }
        plans={plans}
      />
    </div>
  );
}
