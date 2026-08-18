"use client";

import { useSceneCopy } from "@/context/scene-context";

interface FootprintHeadingProps {
  exploredDays: number;
  longestStreak: number;
}

/**
 * 打卡页 Heatmap 上方的「xx足迹 + 今年探索了 X 天」标题
 * 作为 Client Component 独立出来：外层 page.tsx 是 Server 不能用 hook
 */
export function FootprintHeading({ exploredDays, longestStreak }: FootprintHeadingProps) {
  const { footprintHeading } = useSceneCopy();
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="text-sm font-medium text-foreground/70">{footprintHeading}</span>
      <span className="text-xs text-muted-foreground/60">
        今年探索了 {exploredDays} 天 · 最长旅程 {longestStreak} 天
      </span>
    </div>
  );
}
