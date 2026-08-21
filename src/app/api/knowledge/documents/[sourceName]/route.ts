// DELETE /api/knowledge/documents/[sourceName] — 删除用户的一个文档（所有 chunk）
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sourceName: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sourceName } = await params;
  const decoded = decodeURIComponent(sourceName);

  const chunks = await prisma.documentChunk.findMany({
    where: { userId: user.id, sourceName: decoded },
    select: {
      sourceName: true,
      sourceType: true,
      chunkIndex: true,
      content: true,
      createdAt: true,
    },
    orderBy: [{ chunkIndex: "asc" }, { createdAt: "asc" }],
  });

  if (chunks.length === 0) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }

  const sourceType = chunks[0].sourceType;
  const typeLower = sourceType.toLowerCase();
  const isViewableType = ["markdown", "md"].includes(typeLower);
  const isViewableExt = /\.(md|markdown)$/i.test(decoded);
  if (!isViewableType && !isViewableExt) {
    return NextResponse.json(
      { error: "仅支持查看 markdown 文档" },
      { status: 400 }
    );
  }

  // 优先返回上传时保存的原文；旧数据没有原文则回退用切片拼接
  const original = await prisma.knowledgeDoc.findUnique({
    where: { userId_sourceName: { userId: user.id, sourceName: decoded } },
    select: { content: true },
  });
  const content = original?.content ?? chunks.map((c) => c.content).join("\n\n");
  return NextResponse.json({
    document: {
      sourceName: chunks[0].sourceName,
      sourceType,
      content,
      chunkCount: chunks.length,
      createdAt: chunks[0].createdAt,
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sourceName: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sourceName } = await params;
  const decoded = decodeURIComponent(sourceName);

  const result = await prisma.documentChunk.deleteMany({
    where: { userId: user.id, sourceName: decoded },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }

  // 同步删除上传时保存的原文
  await prisma.knowledgeDoc.deleteMany({
    where: { userId: user.id, sourceName: decoded },
  });

  console.log(`[Knowledge] 用户 ${user.id} 删除文档 "${decoded}" (${result.count} chunks)`);
  return NextResponse.json({ success: true, deletedChunks: result.count });
}
