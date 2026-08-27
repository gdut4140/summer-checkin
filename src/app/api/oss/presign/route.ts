import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-utils";
import {
  isOssConfigured,
  OSS_ALLOWED_EXTS,
  OSS_PURPOSES,
  signUploadUrl,
  type OssExt,
  type OssPurpose,
} from "@/lib/oss";

// 轻量防滥用：同用户每分钟最多签 10 次（内存计数，进程重启清零可接受；
// 与 PATCH 的 3/min 限流配合，防止批量生成 URL 造孤儿对象）
const PRESIGN_BUDGET = 10;
const WINDOW_MS = 60_000;
const usage = new Map<string, { windowStart: number; count: number }>();

function checkBudget(userId: string): boolean {
  const now = Date.now();
  const u = usage.get(userId);
  if (!u || now - u.windowStart > WINDOW_MS) {
    usage.set(userId, { windowStart: now, count: 1 });
    return true;
  }
  if (u.count >= PRESIGN_BUDGET) return false;
  u.count++;
  return true;
}

/**
 * 签发预签名 PUT 地址（浏览器直传 OSS，文件不经过服务器）
 * GET /api/oss/presign?ext=png&purpose=avatars
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOssConfigured()) {
    return NextResponse.json({ error: "OSS not configured" }, { status: 503 });
  }

  if (!checkBudget(user.id)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const extRaw = (searchParams.get("ext") ?? "").toLowerCase().replace(/^\./, "");
  const purposeRaw = searchParams.get("purpose") ?? "avatars";

  if (!(OSS_ALLOWED_EXTS as readonly string[]).includes(extRaw)) {
    return NextResponse.json({ error: "Invalid ext" }, { status: 400 });
  }
  if (!(OSS_PURPOSES as readonly string[]).includes(purposeRaw)) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }

  try {
    const signed = signUploadUrl({
      userId: user.id,
      purpose: purposeRaw as OssPurpose,
      ext: extRaw as OssExt,
    });
    return NextResponse.json(signed);
  } catch (err) {
    console.error("[oss] presign 失败:", err);
    return NextResponse.json({ error: "Presign failed" }, { status: 500 });
  }
}
