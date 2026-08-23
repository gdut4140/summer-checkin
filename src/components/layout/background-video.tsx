"use client";

import { useScene } from "@/context/scene-context";

export function BackgroundVideo() {
  const { scene } = useScene();

  return (
    <>
      {/* 雨林场景：背景图片 */}
      <div
        className={`bg-video bg-cover bg-center bg-no-repeat transition-opacity duration-700 ${scene === "rain" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ backgroundImage: "url('/rain.png')" }}
        aria-hidden="true"
      />

      {/* 雪景场景：背景图片 */}
      <div
        className={`bg-video bg-cover bg-center bg-no-repeat transition-opacity duration-700 ${scene === "snow" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ backgroundImage: "url('/snow.png')" }}
        aria-hidden="true"
      />

      {/* 暖云场景：背景图片（cloud.png） */}
      <div
        className={`bg-video bg-cover bg-center bg-no-repeat transition-opacity duration-700 ${scene === "cloud" ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        style={{ backgroundImage: "url('/cloud.png')" }}
        aria-hidden="true"
      />
    </>
  );
}
