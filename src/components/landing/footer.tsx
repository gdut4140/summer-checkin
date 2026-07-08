"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 py-10 md:py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
              SC
            </div>
            Summer Checkin AI
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">
              登录
            </Link>
            <Link href="/register" className="hover:text-foreground transition-colors">
              注册
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            为学习者而生。
          </p>
        </div>
      </div>
    </footer>
  );
}
