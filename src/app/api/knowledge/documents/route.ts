// ============================================================
// 个人知识库 API
// GET  /api/knowledge/documents          — 列出用户的文档
// POST /api/knowledge/documents          — 上传文件或粘贴文本
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { processKnowledgeText } from "@/lib/knowledge-upload";
import { listKnowledgeDocs } from "@/lib/knowledge-docs";
import {
  formatUploadLimit,
  getKnowledgeUploadLimit,
  isKnowledgeUploadTooLarge,
} from "@/lib/knowledge-upload-limits";

// ---- GET: 列出用户文档 ----
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 与智能体的 listKnowledgeDocs 工具共用同一份查询，避免两处口径漂移
  return NextResponse.json({ documents: await listKnowledgeDocs(user.id) });
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
    const uploadLimit = getKnowledgeUploadLimit(ext);

    // Check File.size before file.text()/arrayBuffer(). Without this guard a
    // direct request (bypassing nginx) can make the Node process buffer an
    // arbitrarily large upload in memory before format-specific processing.
    if (isKnowledgeUploadTooLarge(ext, file.size)) {
      return NextResponse.json(
        { error: `文件过大（.${ext} 最大 ${formatUploadLimit(uploadLimit!)}）` },
        { status: 413 }
      );
    }

    let text: string;
    let sourceType: "text" | "markdown" | "pdf" | "docx" = "text";

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
      } catch (err) {
        return NextResponse.json(
          { error: `PDF 文本提取失败: ${err instanceof Error ? err.message : String(err)}` },
          { status: 400 }
        );
      }
    } else if (ext === "docx") {
      // Word: 尝试用 Python 提取，失败则返回错误
      try {
        text = await extractDocxFromFile(file);
        sourceType = "docx";
      } catch (err) {
        return NextResponse.json(
          { error: `Word 文本提取失败: ${err instanceof Error ? err.message : String(err)}` },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: `不支持的格式: .${ext}，支持 .txt .md .pdf .docx` },
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

  const sourceName = (body?.name?.trim() || "手动输入") + ".txt";
  const result = await processKnowledgeText({
    userId: user.id,
    text,
    sourceName,
    sourceType: "text",
  });

  return NextResponse.json(result, { status: 201 });
}

// ---- PDF / Word 提取（Python 脚本）----
async function extractViaPython(
  file: File,
  scriptName: string,
  ext: string
): Promise<string> {
  const { exec } = await import("child_process");
  const { writeFile, unlink, readFile } = await import("fs/promises");
  const { randomUUID } = await import("crypto");
  const path = await import("path");
  const os = await import("os");

  const buffer = Buffer.from(await file.arrayBuffer());
  const tmpDir = os.tmpdir();
  const tmpName = `kb-${ext}-${randomUUID()}`;
  const inputPath = path.join(tmpDir, `${tmpName}.${ext}`);
  const txtPath = path.join(tmpDir, `${tmpName}.txt`);

  try {
    await writeFile(inputPath, buffer);

    const scriptPath = path.join(process.cwd(), "scripts", scriptName);
    await new Promise<void>((resolve, reject) => {
      exec(
        `python "${scriptPath}" "${inputPath}" "${txtPath}"`,
        { timeout: 30000 },
        (error, _stdout, stderr) => {
          if (error) {
            reject(
              new Error(stderr || error.message || "text extraction failed")
            );
            return;
          }
          resolve();
        }
      );
    });

    return await readFile(txtPath, "utf-8");
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(txtPath).catch(() => {});
  }
}

async function extractPdfFromFile(file: File): Promise<string> {
  return extractViaPython(file, "extract_pdf.py", "pdf");
}

async function extractDocxFromFile(file: File): Promise<string> {
  return extractViaPython(file, "extract_docx.py", "docx");
}
