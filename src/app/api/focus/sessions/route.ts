import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/** Record only a naturally completed focus session. Pauses and skips stay client-side. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { durationMinutes?: unknown; sessionId?: unknown } | null;
  const durationMinutes = Number(body?.durationMinutes);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  if (!Number.isInteger(durationMinutes) || ![25, 45, 60].includes(durationMinutes) || !sessionId.startsWith("focus-") || sessionId.length > 100) {
    return NextResponse.json({ error: "Invalid focus duration" }, { status: 400 });
  }

  const existing = await prisma.studyRecord.findFirst({
    where: { userId: user.id, checkinId: sessionId },
    select: { id: true },
  });
  if (existing) {
    console.info("[focus-session] duplicate ignored", { userId: user.id, sessionId, recordId: existing.id });
    return NextResponse.json({ ok: true, duplicate: true, recordId: existing.id, durationMinutes });
  }

  const record = await prisma.studyRecord.create({
    data: { userId: user.id, date: new Date(), totalMinutes: durationMinutes, checkinId: sessionId },
  });

  console.info("[focus-session] completed and saved", {
    userId: user.id,
    durationMinutes,
    sessionId,
    recordId: record.id,
  });
  revalidatePath("/statistics");
  revalidatePath("/profile");
  return NextResponse.json({ ok: true, recordId: record.id, durationMinutes, sessionId });
}
