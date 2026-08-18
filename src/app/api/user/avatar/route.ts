import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { VALID_AVATAR_IDS } from "@/lib/avatar-presets";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { avatar } = (await req.json()) as { avatar: string };
  if (!VALID_AVATAR_IDS.has(avatar)) {
    return NextResponse.json({ error: "Invalid avatar" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { image: avatar } });
  return NextResponse.json({ ok: true });
}
