import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const MAX_TITLE = 120;
const MAX_CONTENT = 500_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
    take: 100,
  });
  return NextResponse.json({ documents: docs });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let title = "";
  let content = "";

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    // 导入 .md 文件
    const form = await req.formData();
    const file = form.get("file");
    if (file instanceof File) {
      title =
        (form.get("title") as string | null)?.trim() ||
        file.name.replace(/\.(md|markdown|txt)$/i, "");
      content = await file.text();
    }
  } else {
    const body = (await req.json().catch(() => null)) as
      | { title?: string; content?: string }
      | null;
    if (body?.title !== undefined) title = body.title.trim();
    if (body?.content !== undefined) content = body.content;
  }

  if (!title) title = "未命名文档";
  if (content.length > MAX_CONTENT) {
    return NextResponse.json({ error: "文档过大（>500KB）" }, { status: 413 });
  }

  const doc = await prisma.document.create({
    data: {
      userId: user.id,
      title: title.slice(0, MAX_TITLE),
      content,
    },
  });
  return NextResponse.json({ document: doc }, { status: 201 });
}
