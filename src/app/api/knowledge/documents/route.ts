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
  KnowledgeLimitError,
  PDF_PARSE_TIMEOUT_MS,
  describeExtractionError,
  fileSizeError,
  requestSizeError,
} from "@/lib/knowledge-upload-guard";

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

  // 解析 body 之前先按 content-length 拒绝明显超限的请求。
  // chunked 传输没有 content-length，此时交给后面的 file.size 检查。
  const declared = request.headers.get("content-length");
  const requestSizeMessage = requestSizeError(
    declared === null ? null : Number(declared)
  );
  if (requestSizeMessage) {
    return NextResponse.json(
      { success: false, error: requestSizeMessage },
      { status: 413 }
    );
  }

  // ── 文件上传 ──
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const sizeMessage = fileSizeError(file.size);
    if (sizeMessage) {
      return NextResponse.json(
        { success: false, error: sizeMessage },
        { status: 413 }
      );
    }

    const fileName = file.name;
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

    let text: string;
    let sourceType: "text" | "markdown" | "pdf" | "docx" = "text";

    if (ext === "md") {
      text = await file.text();
      sourceType = "markdown";
    } else if (ext === "txt") {
      text = await file.text();
      sourceType = "text";
    } else if (ext === "pdf") {
      // PDF: 尝试用 Python 提取，失败则返回可读原因
      try {
        text = await extractPdfFromFile(file);
        sourceType = "pdf";
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            error: err instanceof Error ? err.message : "PDF 文本提取失败",
          },
          { status: 400 }
        );
      }
    } else if (ext === "docx") {
      // Word: 尝试用 Python 提取，失败则返回可读原因
      try {
        text = await extractDocxFromFile(file);
        sourceType = "docx";
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            error: err instanceof Error ? err.message : "Word 文本提取失败",
          },
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

    return runUpload({
      userId: user.id,
      text,
      sourceName: fileName,
      sourceType,
    });
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
  return runUpload({
    userId: user.id,
    text,
    sourceName,
    sourceType: "text",
  });
}

// ---- 入库 ----
// processKnowledgeText 失败时抛错（向量生成失败、事务回滚等），
// 之前这里没有 catch，Next.js 会返回一个空 body 的 500，
// 前端只能显示「上传失败，请重试」，用户看不到真正原因。
async function runUpload(opts: Parameters<typeof processKnowledgeText>[0]) {
  try {
    const result = await processKnowledgeText(opts);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    // 超限是可预期的输入问题，不是服务故障：返回 400，不打 500 日志
    if (err instanceof KnowledgeLimitError) {
      return NextResponse.json(
        {
          success: false,
          chunks: 0,
          replacedChunks: 0,
          error: err.message,
        },
        { status: err.status }
      );
    }

    console.error("[Knowledge] 上传失败:", err);
    return NextResponse.json(
      {
        success: false,
        chunks: 0,
        replacedChunks: 0,
        error: `文档处理失败：${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}

// ---- PDF / Word 提取（Python 脚本）----
async function extractViaPython(
  file: File,
  scriptName: string,
  ext: "pdf" | "docx"
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
        { timeout: PDF_PARSE_TIMEOUT_MS },
        (error, _stdout, stderr) => {
          if (error) {
            const execError = error as NodeJS.ErrnoException & {
              killed?: boolean;
              signal?: string;
            };
            // exec 超时会 SIGTERM 掉子进程；个别平台只设置 killed
            const timedOut =
              execError.killed === true || execError.signal === "SIGTERM";

            // 完整 stderr 只写服务端日志，不回给客户端（含服务器路径）
            console.error(
              `[Knowledge] ${ext} 解析失败:`,
              stderr || execError.message
            );

            reject(
              new Error(
                describeExtractionError(ext, stderr ?? "", {
                  timedOut,
                  fallback: execError.message || "text extraction failed",
                })
              )
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
