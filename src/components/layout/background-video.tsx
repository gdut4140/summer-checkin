"use client";

import { useScene, type SceneType } from "@/context/scene-context";

/** 场景 → 背景图 URL（WebP，每张 ~80–130KB；原 PNG 每张 2MB+） */
const SCENE_BG: Record<SceneType, string> = {
  rain: "url('/rain.webp')",
  snow: "url('/snow.webp')",
  cloud: "url('/cloud.webp')",
};

/**
 * 全局场景背景。
 * 只渲染「当前场景」那一张 —— 以前是雨/雪/云三张全挂 DOM，
 * 首屏白下载 6MB+ 图片。切换场景时用 key 重挂 + 700ms 淡入保留过渡手感
 * （prefers-reduced-motion 下动画会被全局规则压到 0.01ms）。
 */
export function BackgroundVideo() {
  const { scene } = useScene();

  return (
    <div
      key={scene}
      className="bg-video bg-cover bg-center bg-no-repeat animate-[bg-fade-in_700ms_ease]"
      style={{ backgroundImage: SCENE_BG[scene] }}
      aria-hidden="true"
    />
  );
}
