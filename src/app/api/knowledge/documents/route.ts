// ============================================================
// 个人知识库 API
// GET  /api/knowledge/documents          — 列出用户的文档
// POST /api/knowledge/documents          — 上传文件或粘贴文本
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { processKnowledgeText } from "@/lib/knowledge-upload";

// ---- GET: 列出用户文档 ----
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 按 sourceName 去重，每组取一条
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      sourceName: string;
      sourceType: string;
      chunkCount: number;
      totalChars: number;
      createdAt: string;
    }>
  >(
    `SELECT
       "sourceName",
       "sourceType",
       COUNT(*)::int AS "chunkCount",
       SUM(LENGTH("content"))::int AS "totalChars",
       MAX("createdAt") AS "createdAt"
     FROM documentchunk
     WHERE "userId" = $1
     GROUP BY "sourceName", "sourceType"
     ORDER BY MAX("createdAt") DESC`,
    user.id
  );

  const documents = rows.map((r) => ({
    sourceName: r.sourceName,
    sourceType: r.sourceType,
    chunkCount: r.chunkCount,
    totalChars: r.totalChars,
    createdAt: r.createdAt,
  }));

  return NextResponse.json({ documents });
}

// ---- POST: 上传文档 ----
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";

  // ── 文件上传 ──
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name;
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

    let text: string;
    let sourceType: "text" | "markdown" | "pdf" = "text";

    if (ext === "md") {
      text = await file.text();
      sourceType = "markdown";
    } else if (ext === "txt") {
      text = await file.text();
      sourceType = "text";
    } else if (ext === "pdf") {
      // PDF: 尝试用 Python 提取，失败则返回错误
      try {
        text = await extractPdfFromFile(file);
        sourceType = "pdf";
      } catch (err: any) {
        return NextResponse.json(
          { error: `PDF 文本提取失败: ${err.message}` },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: `不支持的格式: .${ext}，支持 .txt .md .pdf` },
        { status: 400 }
      );
    }

    if (!text || text.trim().length < 10) {
      return NextResponse.json(
        { error: "文档内容太短（至少 10 个字符）" },
        { status: 400 }
      );
    }

    const result = await processKnowledgeText({
      userId: user.id,
      text,
      sourceName: fileName,
      sourceType,
    });

    return NextResponse.json(result, { status: 201 });
  }

  // ── 文本粘贴 ──
  const body = await request.json().catch(() => null) as {
    text?: string;
    name?: string;
  } | null;
  const text = body?.text?.trim();
  if (!text || text.length < 10) {
    return NextResponse.json(
      { error: "文本太短（至少 10 个字符）" },
      { status: 400 }
    );
  }

  const sourceName = (body.name?.trim() || "手动输入") + ".txt";
  const result = await processKnowledgeText({
    userId: user.id,
    text,
    sourceName,
    sourceType: "text",
  });

  return NextResponse.json(result, { status: 201 });
}

// ---- PDF 提取（Python 脚本）----
async function extractPdfFromFile(file: File): Promise<string> {
  const { exec } = await import("child_process");
  const { writeFile, unlink, readFile } = await import("fs/promises");
  const { randomUUID } = await import("crypto");
  const path = await import("path");
  const os = await import("os");

  const buffer = Buffer.from(await file.arrayBuffer());
  const tmpDir = os.tmpdir();
  const tmpName = `kb-pdf-${randomUUID()}`;
  const pdfPath = path.join(tmpDir, `${tmpName}.pdf`);
  const txtPath = path.join(tmpDir, `${tmpName}.txt`);

  try {
    await writeFile(pdfPath, buffer);

    const scriptPath = path.join(process.cwd(), "scripts", "extract_pdf.py");
    await new Promise<void>((resolve, reject) => {
      exec(
        `python "${scriptPath}" "${pdfPath}" "${txtPath}"`,
        { timeout: 30000 },
        (error, _stdout, stderr) => {
          if (error) {
            reject(
              new Error(stderr || error.message || "PDF extraction failed")
            );
            return;
          }
          resolve();
        }
      );
    });

    const extracted = await readFile(txtPath, "utf-8");
    return extracted;
  } finally {
    await unlink(pdfPath).catch(() => {});
    await unlink(txtPath).catch(() => {});
  }
}
