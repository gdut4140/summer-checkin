"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * GitHub 社交图标按钮（Uiverse.io wilsondesouza 方案改编）
 *  - 圆形按钮 + 底部升起主题色填充（从下到上充盈）
 *  - Hover 时"向下吐气泡"tooltip："点亮 Star"
 *  - 填充色 = 当前场景 --primary，文字色自动配对 --primary-foreground
 *
 *  Hydration 注意：
 *   className 中含 Tailwind 任意值类（translate-y-[12px] / cubic-bezier-[...] 等），
 *   在 Next Turbopack 下 SSR 与 CSR 偶尔会发生类名顺序不一致，
 *   所以用 mounted gate：SSR + 首次 CSR 吐同一"骨架版"，
 *   客户端挂载完成后再渲带 hover 动画的完整版，彻底消除 mismatch 警告。
 */
export function GithubLink({ className = "" }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const THEME_PRIMARY = "var(--theme-primary, var(--primary))";
  const THEME_PRIMARY_FG = "var(--primary-foreground)";

  // ── 骨架版（SSR + 首次 CSR 共享，保证两端 HTML 100% 一致） ──
  if (!mounted) {
    return (
      <div className={cn("gh-icon-wrap group relative", className)}>
        <a
          href="https://github.com/SoloDev666/summer-checkin"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="前往 GitHub 点亮 Star"
          className={cn(
            "relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full",
            "text-foreground/80 ring-1 ring-foreground/12 bg-foreground/[0.06]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          )}
          suppressHydrationWarning
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="relative z-10 h-5 w-5 fill-current"
            suppressHydrationWarning
          >
            <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.96 3.22 9.16 7.69 10.65.56.1.76-.24.76-.54 0-.27-.01-.98-.02-1.93-3.13.68-3.79-1.5-3.79-1.5-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.22.72-1.5-2.49-.28-5.1-1.25-5.1-5.56 0-1.23.44-2.24 1.15-3.02-.12-.28-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.14.89-.25 1.84-.37 2.79-.38.95.01 1.9.13 2.79.38 2.14-1.44 3.08-1.14 3.08-1.14.61 1.55.23 2.7.11 2.98.72.78 1.15 1.79 1.15 3.02 0 4.32-2.62 5.28-5.12 5.56.4.35.76 1.03.76 2.07 0 1.5-.01 2.7-.01 3.07 0 .3.2.65.77.54C20.04 20.91 23.25 16.71 23.25 11.75 23.25 5.48 18.27.5 12 .5z" />
          </svg>
        </a>
      </div>
    );
  }

  // ── 完整版（挂载后渲，仅客户端，含任意值动画类，不会触发 SSR 比对） ──
  return (
    <div className={cn("gh-icon-wrap group relative", className)}>
      {/* 下方 Tooltip：默认藏按钮正下方，hover 时"向下吐出"12px */}
      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-full z-30 -translate-x-1/2 translate-y-0 whitespace-nowrap",
          "rounded-lg px-3 py-1.5 text-xs font-medium text-[color:var(--primary-foreground)]",
          "opacity-0 invisible",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "group-hover:translate-y-[12px]",
          "group-hover:opacity-100 group-hover:visible",
          "shadow-[0_6px_20px_rgba(0,0,0,0.28)] ring-1 ring-black/10"
        )}
        style={{ backgroundColor: THEME_PRIMARY }}
      >
        点亮 Star
        {/* 小箭头朝上（指向按钮底部） */}
        <div
          className={cn(
            "absolute -top-[3px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 ring-1 ring-black/10"
          )}
          style={{ backgroundColor: THEME_PRIMARY }}
        />
      </div>

      {/* 圆形按钮：核心交互层 */}
      <a
        href="https://github.com/SoloDev666/summer-checkin"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="前往 GitHub 点亮 Star"
        className={cn(
          "relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full",
          "text-foreground/80 ring-1 ring-foreground/12 bg-foreground/[0.06]",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "group-hover:text-[color:var(--primary-foreground)]",
          "group-hover:shadow-[0_3px_18px_rgba(0,0,0,0.18)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        )}
      >
        {/* 底部升起填充层：hover 时 height 0→100%（对应 1.txt 的 .filled） */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 left-0 h-0 w-full",
            "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            "group-hover:h-full"
          )}
          style={{ backgroundColor: THEME_PRIMARY }}
        />

        {/* GitHub SVG：z-10 保证在填充层上方 */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={cn(
            "relative z-10 h-5 w-5 fill-current transition-transform duration-300 group-hover:scale-[1.06]"
          )}
        >
          <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.96 3.22 9.16 7.69 10.65.56.1.76-.24.76-.54 0-.27-.01-.98-.02-1.93-3.13.68-3.79-1.5-3.79-1.5-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.4-1.22.72-1.5-2.49-.28-5.1-1.25-5.1-5.56 0-1.23.44-2.24 1.15-3.02-.12-.28-.5-1.43.11-2.98 0 0 .94-.3 3.08 1.14.89-.25 1.84-.37 2.79-.38.95.01 1.9.13 2.79.38 2.14-1.44 3.08-1.14 3.08-1.14.61 1.55.23 2.7.11 2.98.72.78 1.15 1.79 1.15 3.02 0 4.32-2.62 5.28-5.12 5.56.4.35.76 1.03.76 2.07 0 1.5-.01 2.7-.01 3.07 0 .3.2.65.77.54C20.04 20.91 23.25 16.71 23.25 11.75 23.25 5.48 18.27.5 12 .5z" />
        </svg>
      </a>
    </div>
  );
}
