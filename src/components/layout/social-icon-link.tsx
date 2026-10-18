"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 社交图标按钮（Uiverse.io wilsondesouza 方案改编）
 *  - 圆形按钮 + 底部升起主题色填充（从下到上充盈）
 *  - Hover 时"向下吐气泡"tooltip
 *  - 填充色 = 当前场景 --primary，文字色自动配对 --primary-foreground
 *
 * 抽成通用组件是因为 GitHub 和博客两个入口要用完全一样的动效。之前这里把
 * GitHub 的地址、图标、tooltip 文案全写死了，加第二个入口只能复制一整段——
 * 而这段里有一处很容易漏的 hydration 处理（见下），复制多份必然漂移。
 *
 * Hydration 注意：
 *  className 中含 Tailwind 任意值类（translate-y-[12px] / cubic-bezier-[...] 等），
 *  在 Next Turbopack 下 SSR 与 CSR 偶尔会发生类名顺序不一致，
 *  所以用 mounted gate：SSR + 首次 CSR 吐同一"骨架版"，
 *  客户端挂载完成后再渲带 hover 动画的完整版，彻底消除 mismatch 警告。
 */
export function SocialIconLink({
  href,
  ariaLabel,
  tooltip,
  icon,
  className = "",
  wrapperClassName = "",
}: {
  href: string;
  ariaLabel: string;
  tooltip: string;
  /** 图标元素，建议 h-5 w-5 并依赖 currentColor 上色 */
  icon: ReactNode;
  /** 外层定位/间距（如 ml-1 mr-0.5） */
  className?: string;
  /** 外层的额外类：新手引导靠它定位（.gh-icon-wrap），只该加在目标实例上 */
  wrapperClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  // 故意的：hydration gate 必须在 effect 里翻转（见顶部注释）。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const THEME_PRIMARY = "var(--theme-primary, var(--primary))";

  const wrapClass = cn("group relative", wrapperClassName, className);

  // ── 骨架版（SSR + 首次 CSR 共享，保证两端 HTML 100% 一致） ──
  if (!mounted) {
    return (
      <div className={wrapClass}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={ariaLabel}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full",
            "text-foreground/80 ring-1 ring-foreground/12 bg-foreground/[0.06]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          )}
          suppressHydrationWarning
        >
          <span className="relative z-10 flex items-center justify-center" suppressHydrationWarning>
            {icon}
          </span>
        </a>
      </div>
    );
  }

  // ── 完整版（挂载后渲，仅客户端，含任意值动画类，不会触发 SSR 比对） ──
  return (
    <div className={wrapClass}>
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
        {tooltip}
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
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full",
          "text-foreground/80 ring-1 ring-foreground/12 bg-foreground/[0.06]",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "group-hover:text-[color:var(--primary-foreground)]",
          "group-hover:shadow-[0_3px_18px_rgba(0,0,0,0.18)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        )}
      >
        {/* 底部升起填充层：hover 时 height 0→100% */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-x-0 bottom-0 left-0 h-0 w-full",
            "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            "group-hover:h-full"
          )}
          style={{ backgroundColor: THEME_PRIMARY }}
        />

        {/* 图标：z-10 保证在填充层上方，hover 轻微放大 */}
        <span className="relative z-10 flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.06]">
          {icon}
        </span>
      </a>
    </div>
  );
}
