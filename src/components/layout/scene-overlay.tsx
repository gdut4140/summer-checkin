"use client";

/**
 * 场景蒙层（背景颜色渐变）
 * 实际颜色由 globals.css 里的 --scene-overlay-gradient 决定，
 * 根据 html[data-scene="rain" | "snow"] 自动切换，无需 JS 传值。
 */
export function SceneOverlay() {
  return <div className="bg-video-overlay transition-[background] duration-700" />;
}
