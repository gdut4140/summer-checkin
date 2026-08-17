import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { id: true, userId: true, title: true, content: true, updatedAt: true },
  });
  if (!doc || doc.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ document: doc });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as { title?: string; content?: string };
  const data: Record<string, string> = {};
  if (body.title !== undefined) data.title = body.title.slice(0, 120);
  if (body.content !== undefined) data.content = body.content;

  const updated = await prisma.document.update({ where: { id }, data });
  return NextResponse.json({ document: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc || doc.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.document.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
