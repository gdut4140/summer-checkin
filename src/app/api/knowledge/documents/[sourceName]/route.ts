// DELETE /api/knowledge/documents/[sourceName] — 删除用户的一个文档（所有 chunk）
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

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

  console.log(`[Knowledge] 用户 ${user.id} 删除文档 "${decoded}" (${result.count} chunks)`);
  return NextResponse.json({ success: true, deletedChunks: result.count });
}
