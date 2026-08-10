import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { avatar } = (await req.json()) as { avatar: string };
  const valid = ["seed","leaf","tree","water","mountain","sun","moon","flower","star","frog","owl","fox"];
  if (!valid.includes(avatar)) {
    return NextResponse.json({ error: "Invalid avatar" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { image: avatar } });
  return NextResponse.json({ ok: true });
}
