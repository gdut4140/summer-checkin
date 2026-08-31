import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 轻量 IP 限流：/api/auth/* 10次/分钟/IP（内存滑动窗口，单实例可用；多实例建议换 Redis）
// 与 better-auth 内置 rateLimit 双保险；middleware 在边缘最先拦截，省 DB
const WINDOW_MS = 60_000;
const MAX = 10;
const buckets = new Map<string, { start: number; count: number }>();

function hit(key: string): boolean {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now - cur.start > WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  if (cur.count >= MAX) return false;
  cur.count++;
  return true;
}

// 周期清理（防内存泄漏）
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now - v.start > WINDOW_MS) buckets.delete(k);
}, 5 * 60_000);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // 仅对认证相关写操作限流
  if (pathname.startsWith("/api/auth")) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (!hit(`auth:${ip}`)) {
      return NextResponse.json({ error: "Too many requests, please try later" }, { status: 429 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*"],
};
