import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
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
  // 条件请求：正文没变就回 304（无 body）。
  // 背景：AI 对话每轮结束前端都会拉一次最新正文，用来同步「AI 可能改过文档」；
  // 但改动是少数轮次，无条件全量下发等于每轮白传整篇（长文档几十~上百 KB）。
  // 客户端把上次的 ETag 回填到 If-None-Match，没变时这条路径在服务端就结束。
  const etag = `W/"${doc.updatedAt.getTime()}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  return NextResponse.json({ document: doc }, { headers: { ETag: etag } });
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
  // 回带 ETag：客户端保存后顺手更新本地 etag，使下一次「AI 结束后的条件请求」
  // 以最新版本为准。否则用户自己的自动保存会每编辑一次就让 etag 失效一次。
  return NextResponse.json(
    { document: updated },
    { headers: { ETag: `W/"${updated.updatedAt.getTime()}"` } }
  );
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
