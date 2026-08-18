"use client";

import { useCallback, useEffect, useRef } from "react";
import { useScene } from "@/context/scene-context";

export function BackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { scene } = useScene();

  const ensurePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    void video.play().catch(() => {
      // A later pointer interaction or visibility change retries playback.
    });
  }, []);

  useEffect(() => {
    if (scene !== "rain") return;
    ensurePlayback();
    const resume = () => {
      if (document.visibilityState === "visible") ensurePlayback();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pointerdown", ensurePlayback, { once: true });
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pointerdown", ensurePlayback);
    };
  }, [ensurePlayback, scene]);

  return (
    <>
      {/* 雨林场景：背景视频（非文档页：比最亮档略收，更耐看） */}
      <video
        ref={videoRef}
        className={`bg-video transition-opacity duration-700 ${scene === "rain" ? "opacity-100" : "opacity-0"}`}
        style={scene === "rain" ? { filter: "saturate(1.18) brightness(1.30) contrast(1.03)" } : undefined}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        onCanPlay={ensurePlayback}
      >
        <source src="/rain.mp4" type="video/mp4" />
      </video>

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
