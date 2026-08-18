"use client";

import { resolveAvatarSrc, AI_AVATAR_ID, USER_AVATAR_PRESETS } from "@/lib/avatar-presets";
import { cn } from "@/lib/utils";

interface Props {
  /** 合法头像 id（"1"~"7" / "ai"），或图片 URL（/xxx、http(s)、data:） */
  image: string | null | undefined;
  /** 给 a11y + alt + hash fallback 用 */
  name: string;
  size?: "sm" | "md" | "lg";
  /** 强制渲染为 AI 专属头像 */
  ai?: boolean;
  className?: string;
}

function sizeClass(size: Props["size"]) {
  switch (size) {
    case "sm":
      return "h-7 w-7";
    case "lg":
      return "h-20 w-20";
    case "md":
    default:
      return "h-9 w-9";
  }
}

export function AppAvatar({ image, name, size = "md", ai = false, className }: Props) {
  const { src, id } = resolveAvatarSrc({ image, name, ai });
  const isAi = id === AI_AVATAR_ID;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full",
        "flex items-center justify-center select-none",
        sizeClass(size),
        isAi && "ring-1 ring-primary/40",
        // 高光 + 内阴影 + 细外描边：保持之前立体质感
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-1px_0_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.12)]",
        "bg-foreground/[0.06]",
        className
      )}
      title={name}
    >
      <img
        src={src}
        alt={name}
        draggable={false}
        loading="lazy"
        decoding="async"
        className={cn(
          "h-full w-full rounded-full object-cover",
          /* 图片加载失败时，隐藏 img（保留底色占位）*/
          "error:[display:none]"
        )}
        onError={(e) => {
          const el = e.currentTarget;
          // 已经是 fallback 了就别再跳，避免死循环
          if (el.dataset.fallback === "1") {
            el.style.display = "none";
            return;
          }
          // 失败：兜底给名字 hash 到的那张默认图，仍失败就隐藏
          const presets = USER_AVATAR_PRESETS;
          let hash = 0;
          const s = name || "?";
          for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
          const next = presets[hash % presets.length].src;
          if (el.src.endsWith(next)) {
            el.style.display = "none";
            return;
          }
          el.dataset.fallback = "1";
          el.src = next;
        }}
      />
    </div>
  );
}

export { USER_AVATAR_PRESETS as AVATAR_PRESETS, AI_AVATAR_ID };
